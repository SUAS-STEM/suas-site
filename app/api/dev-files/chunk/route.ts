import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isDevAuthorized } from "@/lib/devAdminAuth";
import {
  getReleaseStoreUpload,
  putReleaseStorePart,
  ReleaseStoreError,
} from "@/lib/releaseStore";
import { getUploadSession, isUploadId, saveUploadSession, uploadPayloadPath } from "@/lib/resumableUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeChunks = new Set<string>();

export async function PUT(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const offset = Number(req.nextUrl.searchParams.get("offset"));
  if (!isUploadId(id) || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid upload chunk" }, { status: 400 });
  if (activeChunks.has(id)) return NextResponse.json({ error: "Another chunk is being written for this file." }, { status: 409 });
  activeChunks.add(id);
  try {
    const session = await getUploadSession(id);
    if (!session || session.complete) return NextResponse.json({ error: "Upload session expired or is already complete." }, { status: 404 });
    if (session.finalizing) return NextResponse.json({ error: "This upload is already finalizing." }, { status: 409 });
    if (offset !== session.receivedBytes) return NextResponse.json({ error: "Chunk offset does not match the server upload position.", expectedOffset: session.receivedBytes }, { status: 409 });
    if (offset >= session.size) return NextResponse.json({ error: "The upload is already complete." }, { status: 409 });
    if (offset % session.chunkSize !== 0) return NextResponse.json({ error: "Chunk offset is not aligned to the upload part size." }, { status: 400 });
    const expectedBytes = Math.min(session.chunkSize, session.size - offset);
    const contentLength = Number(req.headers.get("content-length"));
    if (contentLength !== expectedBytes) return NextResponse.json({ error: "Chunk size is invalid." }, { status: 413 });
    const chunk = Buffer.from(await req.arrayBuffer());
    if (chunk.length !== expectedBytes) return NextResponse.json({ error: "Chunk size did not match the request." }, { status: 413 });

    const file = await open(uploadPayloadPath(id), "r+");
    try {
      let written = 0;
      while (written < chunk.length) {
        const result = await file.write(chunk, written, chunk.length - written, offset + written);
        if (result.bytesWritten <= 0) throw new Error("Could not write upload chunk.");
        written += result.bytesWritten;
      }
      await file.sync();
    } finally {
      await file.close();
    }

    const part = Math.floor(offset / session.chunkSize);
    const chunkSha256 = createHash("sha256").update(chunk).digest("hex");
    let remoteSaved = false;
    try {
      await putReleaseStorePart(session.releaseStoreId, part, chunk);
      remoteSaved = true;
    } catch (cause) {
      const remote = await getReleaseStoreUpload(session.releaseStoreId).catch(() => null);
      const received = remote?.receivedParts?.find((entry) => entry.part === part);
      if (received?.size === chunk.length && (!received.sha256 || received.sha256 === chunkSha256)) remoteSaved = true;
      else {
        const status = cause instanceof ReleaseStoreError ? cause.status : 502;
        return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not store upload part in GitHub Releases." }, { status });
      }
    }

    if (!remoteSaved) return NextResponse.json({ error: "Could not confirm the upload part in GitHub Releases." }, { status: 502 });
    session.receivedBytes += chunk.length;
    await saveUploadSession(session);
    return NextResponse.json({ id, receivedBytes: session.receivedBytes, size: session.size }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not store upload chunk." }, { status: 500 });
  } finally {
    activeChunks.delete(id);
  }
}
