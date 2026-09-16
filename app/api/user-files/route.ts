import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DEV_UPLOAD_DIR, cleanOriginalName, isStoredFileName, MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_REQUEST_BYTES, mimeTypeForName, originalNameFromStored, userStoredFileName } from "@/lib/devUploads";
import { currentUploadUser } from "@/lib/uploadAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListedFile = { name: string; originalName: string; size: number; type: string; modifiedAt: string };

function belongsToUser(name: string, userId: string) {
  return name.startsWith(`${userId}__`) && isStoredFileName(name);
}

async function listUserFiles(userId: string): Promise<ListedFile[]> {
  await mkdir(DEV_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  const entries = await readdir(DEV_UPLOAD_DIR, { withFileTypes: true });
  const files: ListedFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !belongsToUser(entry.name, userId)) continue;
    const details = await stat(path.join(DEV_UPLOAD_DIR, entry.name));
    files.push({ name: entry.name, originalName: originalNameFromStored(entry.name), size: details.size, type: mimeTypeForName(entry.name), modifiedAt: details.mtime.toISOString() });
  }
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function GET(req: NextRequest) {
  const user = await currentUploadUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    if (!belongsToUser(name, user.id)) return NextResponse.json({ error: "File not found" }, { status: 404 });
    try {
      const data = await readFile(path.join(DEV_UPLOAD_DIR, name));
      return new NextResponse(new Uint8Array(data), { headers: { "Cache-Control": "private, no-store", "Content-Type": mimeTypeForName(name), "Content-Disposition": `attachment; filename="${cleanOriginalName(originalNameFromStored(name))}"` } });
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }
  return NextResponse.json(await listUserFiles(user.id), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await currentUploadUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file" }, { status: 400 });
  if (files.length > MAX_UPLOAD_FILES) return NextResponse.json({ error: `You can upload at most ${MAX_UPLOAD_FILES} files at a time` }, { status: 413 });
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_REQUEST_BYTES) return NextResponse.json({ error: "This upload is limited to 400 MB total" }, { status: 413 });
  const tooLarge = files.find((file) => file.size > MAX_UPLOAD_FILE_BYTES);
  if (tooLarge) return NextResponse.json({ error: `${tooLarge.name} is larger than the 100 MB limit` }, { status: 413 });

  await mkdir(DEV_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  const uploaded: ListedFile[] = [];
  for (const file of files) {
    const name = userStoredFileName(user.id, file.name);
    await writeFile(path.join(DEV_UPLOAD_DIR, name), new Uint8Array(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    uploaded.push({ name, originalName: originalNameFromStored(name), size: file.size, type: mimeTypeForName(name), modifiedAt: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, files: uploaded });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUploadUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !belongsToUser(name, user.id)) return NextResponse.json({ error: "File not found" }, { status: 404 });
  try {
    await unlink(path.join(DEV_UPLOAD_DIR, name));
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
