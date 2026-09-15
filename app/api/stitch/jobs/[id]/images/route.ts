import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";
import { jobDir, MAX_FILE_BYTES, MAX_FILES_PER_JOB, MAX_JOB_BYTES, readJob, sanitizeFilename, writeJob } from "@/lib/stitchJobs";

export const runtime = "nodejs";
function supportedImage(file: File, bytes: Buffer) {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (type === "image/tiff" && (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))) return true;
  if (type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  return false;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isStitchAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const meta = await readJob(id);
  if (meta.startedAt) return NextResponse.json({ error: "Job already started" }, { status: 409 });
  if (meta.files.length >= MAX_FILES_PER_JOB) return NextResponse.json({ error: `A job can contain at most ${MAX_FILES_PER_JOB} images` }, { status: 413 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image must be 1 byte to 80 MB" }, { status: 413 });
  }
  if (meta.totalBytes + file.size > MAX_JOB_BYTES) {
    return NextResponse.json({ error: "This job would exceed the 800 MB total upload limit" }, { status: 413 });
  }

  const original = Buffer.from(await file.arrayBuffer());
  if (!supportedImage(file, original)) return NextResponse.json({ error: "Only valid JPEG, TIFF, or PNG image files are accepted" }, { status: 415 });

  const clean = sanitizeFilename(file.name);
  const storedName = `${String(meta.files.length + 1).padStart(4, "0")}-${clean}`;
  await writeFile(
    path.join(jobDir(id), "images", storedName),
    original,
    { flag: "wx", mode: 0o600 },
  );

  let exif: Record<string, unknown> | null = null;
  const exifRaw = form.get("exif");
  if (typeof exifRaw === "string" && exifRaw.length < 10_000) {
    try {
      const parsed = JSON.parse(exifRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) exif = parsed;
    } catch {}
  }

  meta.files.push({ name: clean, storedName, size: file.size, type: file.type, exif });
  meta.totalBytes += file.size;
  await writeJob(meta);
  return NextResponse.json({
    ok: true,
    count: meta.files.length,
    totalBytes: meta.totalBytes,
    file: meta.files.at(-1),
  });
}
