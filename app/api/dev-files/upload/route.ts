import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { deleteFileRecord, fileFolderExists, findFileRecordByHash, getFileRecord, saveFileRecord, updateFileHash, type FileRecord } from "@/lib/fileRecords";
import { createImageThumbnail, createVideoThumbnail, deleteFileThumbnail, saveFileThumbnail } from "@/lib/fileThumbnails";
import { cleanOriginalName, isUploadCategory, MAX_UPLOAD_FILE_BYTES, mimeTypeForName, originalNameFromStored, storedFileName } from "@/lib/devUploads";
import { isValidFolderPath } from "@/lib/devFolders";
import { deleteStoredFile, getTieredStorageStatus, releaseTieredUploads, reserveTieredUploads, storeStreamWithHash } from "@/lib/tieredStorage";
import {
  canStageUpload,
  cleanupExpiredUploadSessions,
  createUploadSession,
  getUploadSession,
  isUploadId,
  saveUploadSession,
  uploadPayloadPath,
  withUploadInitLock,
  type UploadSessionResult,
} from "@/lib/resumableUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();

function sessionResult(record: FileRecord): UploadSessionResult {
  return {
    name: record.name,
    originalName: record.originalName,
    size: record.size,
    type: record.type,
    modifiedAt: record.modifiedAt,
    uploadedAt: record.uploadedAt,
    uploaderName: record.uploaderName,
    status: record.cloudStatus === "uploaded" || record.cloudStatus === "local" ? "ready" : record.cloudStatus === "pending" ? "pending" : "error",
    category: record.category,
    folderPath: record.folderPath,
  };
}

async function storagePayload() {
  return (await getTieredStorageStatus()).combined;
}

export async function GET(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!isUploadId(id)) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
  const session = await getUploadSession(id);
  if (!session) return NextResponse.json({ error: "Upload session expired or not found" }, { status: 404 });
  return NextResponse.json({
    id: session.id,
    receivedBytes: session.receivedBytes,
    size: session.size,
    chunkSize: session.chunkSize,
    complete: session.complete === true,
    file: session.result || null,
    duplicate: session.duplicate === true,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === "complete") return completeUpload(body);

  const categoryValue = typeof body?.category === "string" ? body.category : "work";
  if (!isUploadCategory(categoryValue)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const category = categoryValue;
  const folderPath = typeof body?.folderPath === "string" ? body.folderPath : "";
  if (!isValidFolderPath(folderPath)) return NextResponse.json({ error: "Invalid folder path" }, { status: 400 });
  if (!fileFolderExists(category, folderPath)) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  const name = typeof body?.name === "string" ? cleanOriginalName(body.name) : "";
  const size = typeof body?.size === "number" ? body.size : Number.NaN;
  if (!name || name === "unnamed-file" || !Number.isSafeInteger(size) || size < 0) return NextResponse.json({ error: "Invalid file details" }, { status: 400 });
  if (size > MAX_UPLOAD_FILE_BYTES) return NextResponse.json({ error: `${name} is larger than the ${Math.floor(MAX_UPLOAD_FILE_BYTES / 1_000_000_000)} GB per-file limit` }, { status: 413 });

  const status = await getTieredStorageStatus();
  if (!status.combined.configured) return NextResponse.json({ error: status.combined.message || "Storage is not configured." }, { status: 503 });

  try {
    const session = await withUploadInitLock(async () => {
      await cleanupExpiredUploadSessions();
      if (!(await canStageUpload(size))) throw new Error("There is not enough temporary upload space available. Finish or remove another upload, then try again.");
      const identity = await currentDevIdentity();
      return createUploadSession({
        category,
        folderPath,
        originalName: name,
        storedName: storedFileName(name),
        size,
        type: mimeTypeForName(name),
        uploaderId: identity.id,
        uploaderName: identity.name,
      });
    });
    return NextResponse.json({ id: session.id, size: session.size, chunkSize: session.chunkSize, receivedBytes: session.receivedBytes }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not start upload." }, { status: 507 });
  }
}

async function completeUpload(body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : "";
  if (!isUploadId(id)) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
  if (activeSessions.has(id)) return NextResponse.json({ error: "This upload is already being finalized." }, { status: 409 });
  activeSessions.add(id);
  let reservation: ReturnType<typeof reserveTieredUploads> = null;
  try {
    const session = await getUploadSession(id);
    if (!session) return NextResponse.json({ error: "Upload session expired or not found" }, { status: 404 });
    if (session.complete && session.result) return NextResponse.json({ ok: true, file: session.result, duplicate: session.duplicate === true, storage: await storagePayload() });
    if (session.receivedBytes !== session.size) {
      return NextResponse.json({ error: `Upload is incomplete (${session.receivedBytes} of ${session.size} bytes received).` }, { status: 409 });
    }

    const status = await getTieredStorageStatus();
    reservation = reserveTieredUploads([session.size], status);
    if (!reservation) return NextResponse.json({ error: "There is not enough storage remaining for this file." }, { status: 413 });

    const timestamp = new Date().toISOString();
    const existing = getFileRecord(session.storedName);
    const record: FileRecord = existing || {
      name: session.storedName,
      originalName: originalNameFromStored(session.storedName),
      size: session.size,
      type: session.type,
      modifiedAt: timestamp,
      uploadedAt: timestamp,
      category: session.category,
      folderPath: session.folderPath,
      uploaderId: session.uploaderId,
      uploaderName: session.uploaderName,
      sha256: null,
      cloudStatus: "pending",
      cloudError: null,
    };
    record.cloudStatus = "pending";
    record.cloudError = null;
    saveFileRecord(record);
    const input = createReadStream(uploadPayloadPath(id));
    const result = await storeStreamWithHash(reservation.destinations[0], record, Readable.toWeb(input) as unknown as import("node:stream/web").ReadableStream, session.size);
    if (result.sha256) updateFileHash(record.name, result.sha256);
    const saved = getFileRecord(record.name) || { ...record, cloudStatus: result.status, cloudError: null };
    if (result.status === "failed" || result.status === "not_configured") {
      return NextResponse.json({ error: `Could not store ${session.originalName}. You can retry finalizing this upload.` }, { status: 502 });
    }

    const duplicate = result.sha256 ? findFileRecordByHash(result.sha256, record.name, record.category, record.folderPath) : null;
    if (duplicate) {
      const removed = await deleteStoredFile(saved);
      if (removed) {
        deleteFileRecord(record.name);
        await deleteFileThumbnail(record.name);
        session.complete = true;
        session.duplicate = true;
        session.result = sessionResult(duplicate);
        await saveUploadSession(session);
        await unlink(uploadPayloadPath(id)).catch(() => undefined);
        return NextResponse.json({ ok: true, file: session.result, duplicate: true, storage: await storagePayload() });
      }
    }

    if (saved.type.startsWith("image/") || saved.type.startsWith("video/")) {
      try {
        const thumbnail = saved.type.startsWith("image/")
          ? await createImageThumbnail(uploadPayloadPath(id))
          : await createVideoThumbnail(uploadPayloadPath(id));
        await saveFileThumbnail(saved.name, thumbnail);
      } catch (cause) {
        console.warn(`Could not create preview for ${saved.originalName}`, cause instanceof Error ? cause.message : cause);
      }
    }

    session.complete = true;
    session.duplicate = false;
    session.result = sessionResult(getFileRecord(record.name) || saved);
    await saveUploadSession(session);
    await unlink(uploadPayloadPath(id)).catch(() => undefined);
    return NextResponse.json({ ok: true, file: session.result, duplicate: false, storage: await storagePayload() });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not finalize upload." }, { status: 500 });
  } finally {
    if (reservation) releaseTieredUploads(reservation);
    activeSessions.delete(id);
  }
}
