import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { deleteFileRecord, deleteParamVersion, getFileRecord, getParamVersion, listParamVersions, saveFileRecord, saveParamVersion, updateFileHash, updateParamVersion, type FileRecord, type ParamVersion } from "@/lib/fileRecords";
import { cleanOriginalName, isStoredFileName, storedFileName } from "@/lib/devUploads";
import { cleanVersionName, isParameterFile, MAX_PARAM_FILE_BYTES, parseParameterFile } from "@/lib/paramFiles";
import { removeLocalCache } from "@/lib/localCache";
import { deleteStoredFile, getTieredStorageStatus, releaseTieredUploads, reserveTieredUploads, storeStreamWithHash, streamStoredFile } from "@/lib/tieredStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicVersion = Omit<ParamVersion, "parameters" | "cloudStatus" | "cloudError"> & { status: "ready" | "pending" | "error" };

function publicVersion(version: ParamVersion): PublicVersion {
  const status = version.cloudStatus === "uploaded" || version.cloudStatus === "local"
    ? "ready"
    : version.cloudStatus === "pending"
      ? "pending"
      : "error";
  return {
    name: version.name,
    originalName: version.originalName,
    size: version.size,
    type: version.type,
    modifiedAt: version.modifiedAt,
    uploadedAt: version.uploadedAt,
    category: version.category,
    uploaderId: version.uploaderId,
    uploaderName: version.uploaderName,
    sha256: version.sha256,
    versionName: version.versionName,
    notes: version.notes,
    parameterCount: version.parameterCount,
    status,
  };
}

function listVersions(): PublicVersion[] {
  return listParamVersions().map(publicVersion);
}

async function storagePayload() {
  return (await getTieredStorageStatus()).combined;
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
    if (!version || (version.cloudStatus !== "uploaded" && version.cloudStatus !== "local")) return NextResponse.json({ error: "Parameter version not found" }, { status: 404 });
    const stored = streamStoredFile(version);
    if (!stored) return NextResponse.json({ error: "Stored parameter file is temporarily unavailable." }, { status: 503 });
    return new NextResponse(Readable.toWeb(stored.remoteStream) as unknown as ReadableStream, { headers: responseHeaders(version, version.size) });
  }
  const leftName = req.nextUrl.searchParams.get("from");
  const rightName = req.nextUrl.searchParams.get("to");
  const comparison = leftName && rightName ? (() => {
    const left = getParamVersion(leftName);
    const right = getParamVersion(rightName);
    return left && right ? { from: left.name, to: right.name, changes: compareVersions(left, right) } : null;
  })() : null;
  return NextResponse.json({ versions: listVersions(), comparison, storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storage = await getTieredStorageStatus();
  if (!storage.combined.configured) return NextResponse.json({ error: storage.combined.message || "Storage is not configured." }, { status: 503 });
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

  const reservation = reserveTieredUploads([file.size], storage);
  if (!reservation) return NextResponse.json({ error: "There is not enough storage remaining for this upload." }, { status: 413 });

  try {
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
    const result = await storeStreamWithHash(reservation.destinations[0], record, file.stream() as unknown as import("node:stream/web").ReadableStream, file.size);
    if (result.sha256) updateFileHash(name, result.sha256);
    const saved = getFileRecord(name) || { ...record, cloudStatus: result.status, cloudError: result.status === "failed" ? "Upload failed." : null };
    saveParamVersion(saved, versionName, notes, parameters);
    if (result.status === "failed" || result.status === "not_configured") return NextResponse.json({ error: "Could not store the parameter file." }, { status: 502 });
    const version = getParamVersion(name);
    return NextResponse.json({ ok: true, version: version ? publicVersion(version) : null, storage: await storagePayload() });
  } finally {
    releaseTieredUploads(reservation);
  }
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
  return NextResponse.json({ ok: true, version: version ? publicVersion(version) : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const record = getParamVersion(name);
  if (!record) return NextResponse.json({ error: "Parameter version not found" }, { status: 404 });
  if (record.cloudStatus === "pending") return NextResponse.json({ error: "This parameter file is still uploading." }, { status: 409 });
  if ((record.cloudStatus === "uploaded" || record.cloudStatus === "local") && !(await deleteStoredFile(record))) {
    return NextResponse.json({ error: "Could not delete the stored parameter file." }, { status: 502 });
  }
  await removeLocalCache(record);
  deleteParamVersion(name);
  deleteFileRecord(name);
  return NextResponse.json({ ok: true, storage: await storagePayload() });
}
