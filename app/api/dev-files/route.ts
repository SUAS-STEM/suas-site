import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { cloudProviderName, deleteFileFromCloud, getStorageStatus, releaseCloudUpload, reserveCloudUpload, streamFileFromCloud, syncStreamToCloudWithHash } from "@/lib/cloudStorage";
import { deleteFileRecord, findFileRecordByHash, getFileRecord, listFileRecords, renameFileRecord, saveFileRecord, updateCloudStatus, updateFileHash, type FileRecord } from "@/lib/fileRecords";
import { cacheFileFromCloud, getLocalCacheStatus, isLocallyCached, removeLocalCache, streamFileFromLocal } from "@/lib/localCache";
import {
  cleanOriginalName,
  isStoredFileName,
  isUploadCategory,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  mimeTypeForName,
  originalNameFromStored,
  storedFileName,
  type UploadCategory,
} from "@/lib/devUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListedFile = FileRecord & { localAvailable: boolean };

async function listFiles(): Promise<ListedFile[]> {
  return Promise.all(listFileRecords().map(async (record) => ({ ...record, localAvailable: await isLocallyCached(record) })));
}

async function storagePayload() {
  return { ...(await getStorageStatus()), local: await getLocalCacheStatus() };
}

function responseHeaders(record: Pick<FileRecord, "originalName" | "type">, inline: boolean, size?: number) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": record.type,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${cleanOriginalName(record.originalName)}"`,
  });
  if (size != null) headers.set("Content-Length", String(size));
  return headers;
}

export async function GET(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    if (!isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const categoryParam = req.nextUrl.searchParams.get("category");
    if (categoryParam && !isUploadCategory(categoryParam)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const record = getFileRecord(name);
    if (!record || (categoryParam && record.category !== categoryParam)) return NextResponse.json({ error: "File not found" }, { status: 404 });
    if (record.cloudStatus !== "uploaded") return NextResponse.json({ error: `File is not available in ${cloudProviderName()} yet.` }, { status: 404 });
    const local = await isLocallyCached(record);
    const remote = local ? { remoteStream: streamFileFromLocal(record) } : streamFileFromCloud(record);
    if (!remote) return NextResponse.json({ error: `${cloudProviderName()} is not configured` }, { status: 503 });
    const body = Readable.toWeb(remote.remoteStream) as unknown as ReadableStream;
    return new NextResponse(body, { headers: responseHeaders(record, record.type.startsWith("image/"), record.size) });
  }
  return NextResponse.json({ files: await listFiles(), storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_REQUEST_BYTES + 1024 * 1024) return NextResponse.json({ error: "This upload exceeds the total upload limit" }, { status: 413 });
  const storage = await getStorageStatus();
  if (!storage.cloud.configured) return NextResponse.json({ error: storage.cloud.message || `${cloudProviderName()} is not configured. No local fallback is available.` }, { status: 503 });
  if (storage.cloud.remaining == null) return NextResponse.json({ error: `Configure the ${cloudProviderName()} quota before uploading.` }, { status: 503 });

  const form = await req.formData();
  const categoryValue = form.get("category");
  const category: UploadCategory = typeof categoryValue === "string" && isUploadCategory(categoryValue) ? categoryValue : "work";
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Choose at least one file" }, { status: 400 });
  if (files.length > MAX_UPLOAD_FILES) return NextResponse.json({ error: `You can upload at most ${MAX_UPLOAD_FILES} files at a time` }, { status: 413 });
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) return NextResponse.json({ error: "This upload exceeds the total upload limit" }, { status: 413 });
  const tooLarge = files.find((file) => file.size > MAX_UPLOAD_FILE_BYTES);
  if (tooLarge) return NextResponse.json({ error: `${tooLarge.name} is larger than the per-file limit` }, { status: 413 });
  if (totalBytes > storage.cloud.remaining) return NextResponse.json({ error: `The ${cloudProviderName()} quota does not have enough room for this upload.` }, { status: 413 });
  if (!reserveCloudUpload(totalBytes, storage.cloud.remaining)) return NextResponse.json({ error: `The ${cloudProviderName()} quota is currently reserved by another upload.` }, { status: 413 });

  try {
    const identity = await currentDevIdentity();
    const uploaded: ListedFile[] = [];
    const duplicates: Array<{ incomingName: string; existing: ListedFile }> = [];
    for (const file of files) {
      const name = storedFileName(file.name);
      const timestamp = new Date().toISOString();
      const record: FileRecord = {
        name,
        originalName: originalNameFromStored(name),
        size: file.size,
        type: mimeTypeForName(name),
        modifiedAt: timestamp,
        uploadedAt: timestamp,
        category,
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
      if (result.status !== "uploaded") {
        return NextResponse.json({ ok: false, files: uploaded, duplicates, storage: await storagePayload(), error: `Could not upload ${file.name} to ${cloudProviderName()}.` }, { status: 502 });
      }
      const duplicate = result.sha256 ? findFileRecordByHash(result.sha256, name) : null;
      if (duplicate) {
        const removed = await deleteFileFromCloud(saved);
        if (removed) {
          deleteFileRecord(name);
          duplicates.push({ incomingName: file.name, existing: { ...duplicate, localAvailable: await isLocallyCached(duplicate) } });
          continue;
        }
        // Keep the newly uploaded record if cleanup fails, so a cloud object
        // is never left orphaned and the user can still manage it later.
      }
      const current = getFileRecord(name) || saved;
      uploaded.push({ ...current, localAvailable: false });
    }
    return NextResponse.json({ ok: true, files: uploaded, duplicates, storage: await storagePayload() });
  } finally {
    releaseCloudUpload(totalBytes);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { name?: unknown; displayName?: unknown; cacheLocal?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (!isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const record = getFileRecord(name);
  if (!record) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (typeof body?.cacheLocal === "boolean") {
    if (body.cacheLocal) {
      const cached = await cacheFileFromCloud(record);
      if (!cached.ok) return NextResponse.json({ error: cached.message }, { status: 413 });
    } else {
      await removeLocalCache(record);
    }
    return NextResponse.json({ ok: true, file: { ...record, localAvailable: await isLocallyCached(record) }, storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (!displayName || displayName.length > 160) return NextResponse.json({ error: "Display name must be between 1 and 160 characters" }, { status: 400 });
  const cleanedName = cleanOriginalName(displayName);
  if (!cleanedName || cleanedName === "unnamed-file") return NextResponse.json({ error: "Enter a valid display name" }, { status: 400 });
  if (!renameFileRecord(name, cleanedName)) return NextResponse.json({ error: "Could not rename the file" }, { status: 500 });
  const updated = getFileRecord(name);
  return NextResponse.json({
    ok: true,
    file: updated ? { ...updated, localAvailable: await isLocallyCached(updated) } : null,
    storage: await storagePayload(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const categoryParam = req.nextUrl.searchParams.get("category");
  if (categoryParam && !isUploadCategory(categoryParam)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const record = getFileRecord(name);
  if (!record || (categoryParam && record.category !== categoryParam)) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (record.cloudStatus === "pending") return NextResponse.json({ error: `This file is still uploading to ${cloudProviderName()}. Try again when it finishes.` }, { status: 409 });
  if (record.cloudStatus === "uploaded" && !(await deleteFileFromCloud(record))) return NextResponse.json({ error: `Could not delete the ${cloudProviderName()} copy.` }, { status: 502 });
  await removeLocalCache(record);
  deleteFileRecord(record.name);
  updateCloudStatus(record.name, "local");
  return NextResponse.json({ ok: true, storage: await storagePayload() });
}
