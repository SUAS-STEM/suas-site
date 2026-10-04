import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { isDevAuthorized } from "@/lib/devAdminAuth";
import { deleteFileRecord, getFileRecord, listFileRecords, renameFileRecord, type FileRecord } from "@/lib/fileRecords";
import { isLocallyCached, removeLocalCache, streamFileFromLocal } from "@/lib/localCache";
import { deleteFileThumbnail } from "@/lib/fileThumbnails";
import { deleteStoredFile, streamStoredFile } from "@/lib/tieredStorage";
import {
  deleteReleaseStoreFile,
  fetchReleaseStoreFile,
  getReleaseStoreStorage,
  ReleaseStoreError,
} from "@/lib/releaseStore";
import {
  cleanOriginalName,
  isStoredFileName,
  isUploadCategory,
} from "@/lib/devUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicFile = Omit<FileRecord, "cloudStatus" | "cloudError" | "storageBackend"> & { status: "ready" | "pending" | "error" };

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
    folderPath: record.folderPath,
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
  return getReleaseStoreStorage();
}

function responseHeaders(
  record: Pick<FileRecord, "originalName" | "type">,
  inline: boolean,
  size?: number,
  cacheable = false,
) {
  const isSvg = record.type.toLowerCase() === "image/svg+xml";
  const headers = new Headers({
    "Cache-Control": cacheable ? "private, max-age=31536000, immutable" : "private, no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Vary": "Cookie",
    "Content-Type": isSvg ? "application/octet-stream" : record.type,
    "Content-Disposition": `${inline && !isSvg ? "inline" : "attachment"}; filename="${cleanOriginalName(record.originalName)}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
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
    const inline = record.type.startsWith("image/") || record.type.startsWith("video/");
    const expectedVersion = record.sha256 || record.uploadedAt;
    const cacheable = inline && req.nextUrl.searchParams.get("v") === expectedVersion;
    if (record.storageBackend === "release_store") {
      try {
        const remote = await fetchReleaseStoreFile(record.name, req.headers.get("range"));
        if (!remote.body) return NextResponse.json({ error: "Stored file is temporarily unavailable." }, { status: 503 });
        const headers = responseHeaders(record, inline, remote.status === 206 ? undefined : record.size, cacheable);
        for (const name of ["accept-ranges", "content-range", "etag"]) {
          const value = remote.headers.get(name);
          if (value) headers.set(name, value);
        }
        const remoteLength = remote.headers.get("content-length");
        if (remoteLength) headers.set("Content-Length", remoteLength);
        return new NextResponse(remote.body, { status: remote.status, headers });
      } catch (cause) {
        const status = cause instanceof ReleaseStoreError ? cause.status : 503;
        return NextResponse.json({ error: cause instanceof Error ? cause.message : "Stored file is temporarily unavailable." }, { status });
      }
    }
    const localStream = record.cloudStatus === "uploaded" && await isLocallyCached(record)
      ? { remoteStream: streamFileFromLocal(record) }
      : null;
    const stored = localStream || streamStoredFile(record);
    if (!stored) return NextResponse.json({ error: "Stored file is temporarily unavailable." }, { status: 503 });
    const body = Readable.toWeb(stored.remoteStream) as unknown as ReadableStream;
    return new NextResponse(body, { headers: responseHeaders(record, inline, record.size, cacheable) });
  }
  return NextResponse.json({ files: listFiles(), storage: await storagePayload() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Use the resumable GitHub Releases upload endpoint." },
    { status: 405, headers: { "Allow": "GET, PATCH, DELETE" } },
  );
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
  const removed = record.storageBackend === "release_store"
    ? await deleteReleaseStoreFile(record.name)
    : await deleteStoredFile(record);
  if ((record.cloudStatus === "uploaded" || record.cloudStatus === "local") && !removed) {
    return NextResponse.json({ error: "Could not delete the stored file." }, { status: 502 });
  }
  if (record.storageBackend === "tiered") await removeLocalCache(record);
  await deleteFileThumbnail(record.name);
  deleteFileRecord(record.name);
  return NextResponse.json({ ok: true, storage: await storagePayload() });
}
