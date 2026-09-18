import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { deleteFileRecord, findFileRecordByHash, getFileRecord, listFileRecords, renameFileRecord, saveFileRecord, updateFileHash, type FileRecord } from "@/lib/fileRecords";
import { removeLocalCache } from "@/lib/localCache";
import { deleteStoredFile, getTieredStorageStatus, releaseTieredUploads, reserveTieredUploads, storeStreamWithHash, streamStoredFile } from "@/lib/tieredStorage";
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

type PublicFile = Omit<FileRecord, "cloudStatus" | "cloudError"> & { status: "ready" | "pending" | "error" };

function publicFile(record: FileRecord): PublicFile {
  const status = record.cloudStatus === "uploaded" || record.cloudStatus === "local"
    ? "ready"
    : record.cloudStatus === "pending"
      ? "pending"
      : "error";
  return {
    name: record.name,
    originalName: record.originalName,
    size: record.size,
    type: record.type,
    modifiedAt: record.modifiedAt,
    uploadedAt: record.uploadedAt,
    category: record.category,
    uploaderId: record.uploaderId,
    uploaderName: record.uploaderName,
    sha256: record.sha256,
    status,
  };
}

function listFiles(): PublicFile[] {
  return listFileRecords().map(publicFile);
}

async function storagePayload() {
  return (await getTieredStorageStatus()).combined;
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
    if (record.cloudStatus !== "uploaded" && record.cloudStatus !== "local") return NextResponse.json({ error: "File is not available yet." }, { status: 404 });
    const stored = streamStoredFile(record);
    if (!stored) return NextResponse.json({ error: "Stored file is temporarily unavailable." }, { status: 503 });
    const body = Readable.toWeb(stored.remoteStream) as unknown as ReadableStream;
    return new NextResponse(body, { headers: responseHeaders(record, record.type.startsWith("image/"), record.size) });
  }
  return NextResponse.json({ files: listFiles(), storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_REQUEST_BYTES + 1024 * 1024) return NextResponse.json({ error: "This upload exceeds the total upload limit" }, { status: 413 });

  const storage = await getTieredStorageStatus();
  if (!storage.combined.configured) return NextResponse.json({ error: storage.combined.message || "Storage is not configured." }, { status: 503 });

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

  const reservation = reserveTieredUploads(files.map((file) => file.size), storage);
  if (!reservation) return NextResponse.json({ error: "There is not enough storage remaining for this upload." }, { status: 413 });

  try {
    const identity = await currentDevIdentity();
    const uploaded: PublicFile[] = [];
    const duplicates: Array<{ incomingName: string; existing: PublicFile }> = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const destination = reservation.destinations[index];
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
      const result = await storeStreamWithHash(destination, record, file.stream() as unknown as import("node:stream/web").ReadableStream, file.size);
      if (result.sha256) updateFileHash(name, result.sha256);
      const saved = getFileRecord(name) || { ...record, cloudStatus: result.status, cloudError: result.status === "failed" ? "Upload failed." : null };
      if (result.status === "failed" || result.status === "not_configured") {
        return NextResponse.json({ ok: false, files: uploaded, duplicates, storage: await storagePayload(), error: `Could not store ${file.name}.` }, { status: 502 });
      }
      const duplicate = result.sha256 ? findFileRecordByHash(result.sha256, name) : null;
      if (duplicate) {
        const removed = await deleteStoredFile(saved);
        if (removed) {
          deleteFileRecord(name);
          duplicates.push({ incomingName: file.name, existing: publicFile(duplicate) });
          continue;
        }
      }
      const current = getFileRecord(name) || saved;
      uploaded.push(publicFile(current));
    }
    return NextResponse.json({ ok: true, files: uploaded, duplicates, storage: await storagePayload() });
  } finally {
    releaseTieredUploads(reservation);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { name?: unknown; displayName?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (!isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  if (!getFileRecord(name)) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!displayName || displayName.length > 160) return NextResponse.json({ error: "Display name must be between 1 and 160 characters" }, { status: 400 });
  const cleanedName = cleanOriginalName(displayName);
  if (!cleanedName || cleanedName === "unnamed-file") return NextResponse.json({ error: "Enter a valid display name" }, { status: 400 });
  if (!renameFileRecord(name, cleanedName)) return NextResponse.json({ error: "Could not rename the file" }, { status: 500 });
  const updated = getFileRecord(name);
  return NextResponse.json({
    ok: true,
    file: updated ? publicFile(updated) : null,
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
  if (record.cloudStatus === "pending") return NextResponse.json({ error: "This file is still uploading. Try again when it finishes." }, { status: 409 });
  if ((record.cloudStatus === "uploaded" || record.cloudStatus === "local") && !(await deleteStoredFile(record))) {
    return NextResponse.json({ error: "Could not delete the stored file." }, { status: 502 });
  }
  await removeLocalCache(record);
  deleteFileRecord(record.name);
  return NextResponse.json({ ok: true, storage: await storagePayload() });
}
