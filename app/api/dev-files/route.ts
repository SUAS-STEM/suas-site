import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { deleteFileFromCloud, getStorageStatus, streamFileFromCloud, syncStreamToCloud } from "@/lib/cloudStorage";
import { deleteFileRecord, getFileRecord, listFileRecords, saveFileRecord, updateCloudStatus, type FileRecord } from "@/lib/fileRecords";
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

type ListedFile = FileRecord & { localAvailable: false };

function listFiles(): ListedFile[] {
  return listFileRecords().map((record) => ({ ...record, localAvailable: false }));
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
    if (record.cloudStatus !== "uploaded") return NextResponse.json({ error: "File is not available in TeraBox yet." }, { status: 404 });
    const remote = streamFileFromCloud(record);
    if (!remote) return NextResponse.json({ error: "TeraBox is not configured" }, { status: 503 });
    const body = Readable.toWeb(remote.remoteStream) as unknown as ReadableStream;
    return new NextResponse(body, { headers: responseHeaders(record, record.type.startsWith("image/"), record.size) });
  }
  return NextResponse.json({ files: listFiles(), storage: await getStorageStatus() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_REQUEST_BYTES + 1024 * 1024) return NextResponse.json({ error: "This upload exceeds the total upload limit" }, { status: 413 });
  const storage = await getStorageStatus();
  if (!storage.cloud.configured) return NextResponse.json({ error: storage.cloud.message || "TeraBox is not configured. No local fallback is available." }, { status: 503 });
  if (storage.cloud.remaining == null) return NextResponse.json({ error: "Configure the TeraBox quota before uploading." }, { status: 503 });

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
  if (totalBytes > storage.cloud.remaining) return NextResponse.json({ error: "The TeraBox quota does not have enough room for this upload." }, { status: 413 });

  const identity = await currentDevIdentity();
  const uploaded: ListedFile[] = [];
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
      cloudStatus: "pending",
      cloudError: null,
    };
    saveFileRecord(record);
    const result = await syncStreamToCloud(record, file.stream() as unknown as import("node:stream/web").ReadableStream, file.size);
    const saved = getFileRecord(name) || { ...record, cloudStatus: result, cloudError: result === "failed" ? "Upload failed." : null };
    uploaded.push({ ...saved, localAvailable: false });
    if (result !== "uploaded") {
      return NextResponse.json({ ok: false, files: uploaded, storage: await getStorageStatus(), error: `Could not upload ${file.name} to TeraBox.` }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, files: uploaded, storage: await getStorageStatus() });
}

export async function DELETE(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const categoryParam = req.nextUrl.searchParams.get("category");
  if (categoryParam && !isUploadCategory(categoryParam)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const record = getFileRecord(name);
  if (!record || (categoryParam && record.category !== categoryParam)) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (record.cloudStatus === "pending") return NextResponse.json({ error: "This file is still uploading to TeraBox. Try again when it finishes." }, { status: 409 });
  if (record.cloudStatus === "uploaded" && !(await deleteFileFromCloud(record))) return NextResponse.json({ error: "Could not delete the TeraBox copy." }, { status: 502 });
  deleteFileRecord(record.name);
  updateCloudStatus(record.name, "local");
  return NextResponse.json({ ok: true, storage: await getStorageStatus() });
}
