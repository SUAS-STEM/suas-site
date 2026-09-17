import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isDevAuthorized } from "@/lib/devAdminAuth";
import {
  DEV_UPLOAD_DIR,
  isUploadCategory,
  isStoredFileName,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  mimeTypeForName,
  originalNameFromStored,
  storedFileName,
  type UploadCategory,
  uploadCategoryDir,
} from "@/lib/devUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListedFile = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  category: UploadCategory;
};

async function listFiles(): Promise<ListedFile[]> {
  await mkdir(DEV_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  const files: ListedFile[] = [];

  const directories: Array<[UploadCategory, string]> = [
    ["work", DEV_UPLOAD_DIR],
    ["work", uploadCategoryDir("work")],
    ["thirdparty", uploadCategoryDir("thirdparty")],
    ["gallery", uploadCategoryDir("gallery")],
  ];

  for (const [category, directory] of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !isStoredFileName(entry.name)) continue;
      const details = await stat(path.join(directory, entry.name));
      files.push({
        name: entry.name,
        originalName: originalNameFromStored(entry.name),
        size: details.size,
        type: mimeTypeForName(entry.name),
        modifiedAt: details.mtime.toISOString(),
        category,
      });
    }
  }

  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function requireAdmin() {
  return isDevAuthorized();
}

async function findFilePath(name: string, category: UploadCategory | null) {
  const directories = category
    ? category === "work"
      ? [uploadCategoryDir("work"), DEV_UPLOAD_DIR]
      : [uploadCategoryDir(category)]
    : [DEV_UPLOAD_DIR, uploadCategoryDir("work"), uploadCategoryDir("thirdparty"), uploadCategoryDir("gallery")];

  for (const directory of directories) {
    const filePath = path.join(directory, name);
    try {
      await stat(filePath);
      return filePath;
    } catch {
      // Continue through the supported category directories.
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    if (!isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const categoryParam = req.nextUrl.searchParams.get("category");
    if (categoryParam && !isUploadCategory(categoryParam)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const filePath = await findFilePath(name, categoryParam as UploadCategory | null);
    if (!filePath) return NextResponse.json({ error: "File not found" }, { status: 404 });
    try {
      const data = await readFile(/* turbopackIgnore: true */ filePath);
      const originalName = originalNameFromStored(name).replace(/[`"\r\n]/g, "-");
      const inline = mimeTypeForName(name).startsWith("image/");
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": mimeTypeForName(name),
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${originalName}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  return NextResponse.json(await listFiles(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const categoryValue = form.get("category");
  const category: UploadCategory = typeof categoryValue === "string" && isUploadCategory(categoryValue)
    ? categoryValue
    : "work";
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    const single = form.get("file");
    if (single instanceof File) files.push(single);
  }
  if (files.length === 0) return NextResponse.json({ error: "Choose at least one file" }, { status: 400 });
  if (files.length > MAX_UPLOAD_FILES) {
    return NextResponse.json({ error: `You can upload at most ${MAX_UPLOAD_FILES} files at a time` }, { status: 413 });
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: "This upload is limited to 400 MB total" }, { status: 413 });
  }
  const tooLarge = files.find((file) => file.size > MAX_UPLOAD_FILE_BYTES);
  if (tooLarge) return NextResponse.json({ error: `${tooLarge.name} is larger than the 100 MB limit` }, { status: 413 });

  const destination = uploadCategoryDir(category);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const uploaded: ListedFile[] = [];
  for (const file of files) {
    const name = storedFileName(file.name);
    await writeFile(path.join(destination, name), new Uint8Array(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
    uploaded.push({
      name,
      originalName: originalNameFromStored(name),
      size: file.size,
      type: mimeTypeForName(name),
      modifiedAt: new Date().toISOString(),
      category,
    });
  }

  return NextResponse.json({ ok: true, files: uploaded });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !isStoredFileName(name)) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  const categoryParam = req.nextUrl.searchParams.get("category");
  if (categoryParam && !isUploadCategory(categoryParam)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const filePath = await findFilePath(name, categoryParam as UploadCategory | null);
  if (!filePath) return NextResponse.json({ error: "File not found" }, { status: 404 });
  try {
    await unlink(filePath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
