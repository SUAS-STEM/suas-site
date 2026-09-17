import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { cloudProviderName, deleteFileFromCloud, getStorageStatus, streamFileFromCloud, syncStreamToCloudWithHash } from "@/lib/cloudStorage";
import { deleteFileRecord, deleteParamVersion, getFileRecord, getParamVersion, listParamVersions, saveFileRecord, saveParamVersion, updateCloudStatus, updateFileHash, updateParamVersion, type FileRecord, type ParamVersion } from "@/lib/fileRecords";
import { cleanOriginalName, isStoredFileName, mimeTypeForName, storedFileName } from "@/lib/devUploads";
import { cleanVersionName, isParameterFile, MAX_PARAM_FILE_BYTES, parseParameterFile } from "@/lib/paramFiles";
import { getLocalCacheStatus, isLocallyCached, removeLocalCache, streamFileFromLocal } from "@/lib/localCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListedVersion = Omit<ParamVersion, "parameters"> & { localAvailable: boolean };

async function listVersions(): Promise<ListedVersion[]> {
  return Promise.all(listParamVersions().map(async ({ parameters: _parameters, ...version }) => ({ ...version, localAvailable: await isLocallyCached(version) })));
}

async function storagePayload() {
  return { ...(await getStorageStatus()), local: await getLocalCacheStatus() };
}

function responseHeaders(record: Pick<FileRecord, "originalName" | "type">, size?: number) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": record.type || "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${cleanOriginalName(record.originalName)}"`,
  });
  if (size != null) headers.set("Content-Length", String(size));
  return headers;
}

function compareVersions(left: ParamVersion, right: ParamVersion) {
  const names = new Set([...Object.keys(left.parameters), ...Object.keys(right.parameters)]);
  return [...names].sort().flatMap((name) => {
    const from = left.parameters[name] ?? null;
    const to = right.parameters[name] ?? null;
    if (from === to) return [];
    return [{ name, from, to, change: from == null ? "added" : to == null ? "removed" : "changed" }];
  });
}

export async function GET(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    if (!isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const version = getParamVersion(name);
    if (!version || version.cloudStatus !== "uploaded") return NextResponse.json({ error: "Parameter version not found" }, { status: 404 });
    const local = await isLocallyCached(version);
    const remote = local ? { remoteStream: streamFileFromLocal(version) } : streamFileFromCloud(version);
    if (!remote) return NextResponse.json({ error: `${cloudProviderName()} is not configured` }, { status: 503 });
    return new NextResponse(Readable.toWeb(remote.remoteStream) as unknown as ReadableStream, { headers: responseHeaders(version, version.size) });
  }
  const leftName = req.nextUrl.searchParams.get("from");
  const rightName = req.nextUrl.searchParams.get("to");
  const comparison = leftName && rightName ? (() => {
    const left = getParamVersion(leftName);
    const right = getParamVersion(rightName);
    return left && right ? { from: left.name, to: right.name, changes: compareVersions(left, right) } : null;
  })() : null;
  return NextResponse.json({ versions: await listVersions(), comparison, storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storage = await getStorageStatus();
  if (!storage.cloud.configured) return NextResponse.json({ error: storage.cloud.message || `${cloudProviderName()} is not configured.` }, { status: 503 });
  if (storage.cloud.remaining == null) return NextResponse.json({ error: `Configure the ${cloudProviderName()} quota before uploading.` }, { status: 503 });
  const form = await req.formData();
  const file = form.get("file");
  const versionNameValue = form.get("versionName");
  const notesValue = form.get("notes");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a parameter file" }, { status: 400 });
  if (file.size > MAX_PARAM_FILE_BYTES) return NextResponse.json({ error: "Parameter files must be 16 MB or smaller" }, { status: 413 });
  if (!isParameterFile(file.name)) return NextResponse.json({ error: "Use an ArduPilot .param, .parm, .params, or text export" }, { status: 400 });
  const versionName = cleanVersionName(typeof versionNameValue === "string" ? versionNameValue : "");
  if (!versionName) return NextResponse.json({ error: "Give this parameter set a version name" }, { status: 400 });
  const notes = typeof notesValue === "string" ? notesValue.trim().slice(0, 5000) || null : null;
  const parameters = parseParameterFile(await file.text());
  if (!Object.keys(parameters).length) return NextResponse.json({ error: "No parameter lines were found in that file" }, { status: 400 });
  if (file.size > storage.cloud.remaining) return NextResponse.json({ error: `The ${cloudProviderName()} quota does not have enough room for this upload.` }, { status: 413 });

  const identity = await currentDevIdentity();
  const name = storedFileName(file.name);
  const timestamp = new Date().toISOString();
  const record: FileRecord = {
    name,
    originalName: cleanOriginalName(file.name),
    size: file.size,
    type: file.type || "text/plain; charset=utf-8",
    modifiedAt: timestamp,
    uploadedAt: timestamp,
    category: "params",
    uploaderId: identity.id,
    uploaderName: identity.name,
    sha256: null,
    cloudStatus: "pending",
    cloudError: null,
  };
  saveFileRecord(record);
  const result = await syncStreamToCloudWithHash(record, file.stream() as unknown as import("node:stream/web").ReadableStream, file.size);
  if (result.sha256) updateFileHash(name, result.sha256);
  const saved = getFileRecord(name) || { ...record, cloudStatus: result.status, cloudError: result.status === "failed" ? "Upload failed." : null };
  saveParamVersion(saved, versionName, notes, parameters);
  if (result.status !== "uploaded") return NextResponse.json({ error: `Could not upload the parameter file to ${cloudProviderName()}.` }, { status: 502 });
  const version = getParamVersion(name);
  return NextResponse.json({ ok: true, version: version ? { ...version, parameters: undefined } : null, storage: await storagePayload() });
}

export async function PATCH(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { name?: unknown; versionName?: unknown; notes?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  const versionName = typeof body?.versionName === "string" ? cleanVersionName(body.versionName) : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 5000) || null : null;
  if (!isStoredFileName(name) || !versionName) return NextResponse.json({ error: "A valid version name is required" }, { status: 400 });
  if (!getParamVersion(name) || !updateParamVersion(name, versionName, notes)) return NextResponse.json({ error: "Parameter version not found" }, { status: 404 });
  const version = getParamVersion(name);
  return NextResponse.json({ ok: true, version: version ? { ...version, parameters: undefined } : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const record = getParamVersion(name);
  if (!record) return NextResponse.json({ error: "Parameter version not found" }, { status: 404 });
  if (record.cloudStatus === "uploaded" && !(await deleteFileFromCloud(record))) return NextResponse.json({ error: `Could not delete the ${cloudProviderName()} copy.` }, { status: 502 });
  await removeLocalCache(record);
  deleteParamVersion(name);
  deleteFileRecord(name);
  updateCloudStatus(name, "local");
  return NextResponse.json({ ok: true, storage: await storagePayload() });
}
