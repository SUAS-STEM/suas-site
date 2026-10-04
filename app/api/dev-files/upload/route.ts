import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import {
  fileFolderExists,
  findFileRecordByHash,
  getFileRecord,
  saveFileRecord,
  updateCloudStatus,
  updateFileHash,
  type FileRecord,
} from "@/lib/fileRecords";
import {
  createImageThumbnail,
  createVideoThumbnail,
  deleteFileThumbnail,
  saveFileThumbnail,
} from "@/lib/fileThumbnails";
import {
  cleanOriginalName,
  isUploadCategory,
  MAX_UPLOAD_FILE_BYTES,
  mimeTypeForName,
  originalNameFromStored,
  storedFileName,
} from "@/lib/devUploads";
import { isValidFolderPath } from "@/lib/devFolders";
import {
  cancelReleaseStoreUpload,
  completeReleaseStoreUpload,
  createReleaseStoreUpload,
  getReleaseStoreStorage,
  getReleaseStoreUpload,
  releaseStoreObjectName,
  ReleaseStoreError,
} from "@/lib/releaseStore";
import {
  canStageUpload,
  cleanupExpiredUploadSessions,
  createUploadSession,
  getUploadSession,
  isUploadId,
  saveUploadSession,
  uploadPayloadPath,
  withUploadInitLock,
  type UploadSession,
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
  return getReleaseStoreStorage();
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function markSessionComplete(session: UploadSession, sha256: string) {
  const record = getFileRecord(session.storedName);
  if (!record) throw new Error("Upload metadata is missing.");
  updateFileHash(record.name, sha256);
  updateCloudStatus(record.name, "uploaded");
  const saved = getFileRecord(record.name) || { ...record, sha256, cloudStatus: "uploaded" as const };
  session.sha256 = sha256;
  session.finalizing = false;
  session.complete = true;
  session.duplicate = false;
  session.result = sessionResult(saved);
  await saveUploadSession(session);
  await unlink(uploadPayloadPath(session.id)).catch(() => undefined);
  return session;
}

async function reconcileSession(session: UploadSession) {
  if (!session.finalizing || session.complete) return session;
  const remote = await getReleaseStoreUpload(session.releaseStoreId);
  if (remote.state !== "complete") return session;
  const expected = session.sha256;
  const actual = remote.sha256 || null;
  if (expected && actual && expected !== actual) {
    updateCloudStatus(session.storedName, "failed", "GitHub Releases checksum did not match the uploaded file.");
    session.finalizing = false;
    await saveUploadSession(session);
    throw new Error("GitHub Releases checksum did not match the uploaded file.");
  }
  return markSessionComplete(session, actual || expected || "");
}

function pendingPayload(session: UploadSession, remote?: Awaited<ReturnType<typeof getReleaseStoreUpload>>) {
  return {
    ok: false,
    pending: true,
    id: session.id,
    receivedBytes: session.receivedBytes,
    size: session.size,
    replicatedBytes: remote?.replicatedBytes ?? null,
    bufferedBytes: remote?.bufferedBytes ?? null,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!isUploadId(id)) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
  let session = await getUploadSession(id);
  if (!session) return NextResponse.json({ error: "Upload session expired or not found" }, { status: 404 });
  try {
    session = await reconcileSession(session);
    const remote = session.complete ? null : await getReleaseStoreUpload(session.releaseStoreId).catch(() => null);
    return NextResponse.json({
      id: session.id,
      receivedBytes: session.receivedBytes,
      size: session.size,
      chunkSize: session.chunkSize,
      complete: session.complete === true,
      finalizing: session.finalizing === true,
      file: session.result || null,
      duplicate: session.duplicate === true,
      replicatedBytes: remote?.replicatedBytes ?? (session.complete ? session.size : null),
      bufferedBytes: remote?.bufferedBytes ?? (session.complete ? 0 : null),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not check upload status." }, { status: 502 });
  }
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

  const status = await getReleaseStoreStorage();
  if (!status.configured) return NextResponse.json({ error: status.message || "GitHub Releases storage is not configured." }, { status: 503 });

  try {
    const session = await withUploadInitLock(async () => {
      await cleanupExpiredUploadSessions();
      if (!(await canStageUpload(size))) throw new ReleaseStoreError("There is not enough temporary upload space available. Finish or remove another upload, then try again.", 507);
      const identity = await currentDevIdentity();
      const storedName = storedFileName(name);
      const type = mimeTypeForName(name);
      const remote = await createReleaseStoreUpload(storedName, size, type);
      try {
        return await createUploadSession({
          releaseStoreId: remote.id,
          releaseStoreName: releaseStoreObjectName(storedName),
          category,
          folderPath,
          originalName: name,
          storedName,
          size,
          type,
          uploaderId: identity.id,
          uploaderName: identity.name,
          chunkSize: remote.partSize,
        });
      } catch (cause) {
        await cancelReleaseStoreUpload(remote.id);
        throw cause;
      }
    });
    return NextResponse.json({ id: session.id, size: session.size, chunkSize: session.chunkSize, receivedBytes: session.receivedBytes }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const statusCode = cause instanceof ReleaseStoreError ? cause.status : 500;
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not start upload." }, { status: statusCode });
  }
}

async function completeUpload(body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : "";
  if (!isUploadId(id)) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
  if (activeSessions.has(id)) return NextResponse.json({ error: "This upload is already being finalized." }, { status: 409 });
  activeSessions.add(id);
  try {
    let session = await getUploadSession(id);
    if (!session) return NextResponse.json({ error: "Upload session expired or not found" }, { status: 404 });
    session = await reconcileSession(session);
    if (session.complete && session.result) return NextResponse.json({ ok: true, file: session.result, duplicate: session.duplicate === true, storage: await storagePayload() });
    if (session.finalizing) {
      const remote = await getReleaseStoreUpload(session.releaseStoreId).catch(() => undefined);
      return NextResponse.json(pendingPayload(session, remote), { status: 202 });
    }
    if (session.receivedBytes !== session.size) {
      return NextResponse.json({ error: `Upload is incomplete (${session.receivedBytes} of ${session.size} bytes received).` }, { status: 409 });
    }

    const filePath = uploadPayloadPath(id);
    const sha256 = await sha256File(filePath);
    const duplicate = findFileRecordByHash(sha256, session.storedName, session.category, session.folderPath);
    if (duplicate) {
      if (!(await cancelReleaseStoreUpload(session.releaseStoreId))) {
        return NextResponse.json({ error: "Could not cancel the duplicate GitHub Releases upload." }, { status: 502 });
      }
      await deleteFileThumbnail(session.storedName);
      session.sha256 = sha256;
      session.complete = true;
      session.finalizing = false;
      session.duplicate = true;
      session.result = sessionResult(duplicate);
      await saveUploadSession(session);
      await unlink(filePath).catch(() => undefined);
      return NextResponse.json({ ok: true, file: session.result, duplicate: true, storage: await storagePayload() });
    }

    const timestamp = new Date().toISOString();
    const record: FileRecord = getFileRecord(session.storedName) || {
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
      sha256,
      storageBackend: "release_store",
      cloudStatus: "pending",
      cloudError: null,
    };
    record.sha256 = sha256;
    record.storageBackend = "release_store";
    record.cloudStatus = "pending";
    record.cloudError = null;
    saveFileRecord(record);

    if (record.type.startsWith("image/") || record.type.startsWith("video/")) {
      try {
        const thumbnail = record.type.startsWith("image/")
          ? await createImageThumbnail(filePath)
          : await createVideoThumbnail(filePath);
        await saveFileThumbnail(record.name, thumbnail);
      } catch (cause) {
        console.warn(`Could not create preview for ${record.originalName}`, cause instanceof Error ? cause.message : cause);
      }
    }

    const completion = await completeReleaseStoreUpload(session.releaseStoreId);
    session.sha256 = sha256;
    session.finalizing = true;
    await saveUploadSession(session);
    await unlink(filePath).catch(() => undefined);

    if (completion.body.state === "complete") {
      if (completion.body.sha256 && completion.body.sha256 !== sha256) {
        updateCloudStatus(record.name, "failed", "GitHub Releases checksum did not match the uploaded file.");
        return NextResponse.json({ error: "GitHub Releases checksum did not match the uploaded file." }, { status: 502 });
      }
      session = await markSessionComplete(session, completion.body.sha256 || sha256);
      return NextResponse.json({ ok: true, file: session.result, duplicate: false, storage: await storagePayload() });
    }

    const remote = await getReleaseStoreUpload(session.releaseStoreId).catch(() => undefined);
    return NextResponse.json(pendingPayload(session, remote), { status: 202 });
  } catch (cause) {
    const statusCode = cause instanceof ReleaseStoreError ? cause.status : 500;
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not finalize upload." }, { status: statusCode });
  } finally {
    activeSessions.delete(id);
  }
}
