import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { createFileFolder, fileFolderExists, listFileFolders } from "@/lib/fileRecords";
import { childFolderName, isValidFolderName, isValidFolderPath } from "@/lib/devFolders";
import { isUploadCategory, type UploadCategory } from "@/lib/devUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function folderResponse(category: UploadCategory, parentPath: string) {
  const folders = listFileFolders(category)
    .map((path) => ({ name: childFolderName(parentPath, path), path }))
    .filter((folder): folder is { name: string; path: string } => folder.name !== null);
  return NextResponse.json({ category, parentPath, folders }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categoryValue = request.nextUrl.searchParams.get("category");
  if (!isUploadCategory(categoryValue) || categoryValue === "params") return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const parentPath = request.nextUrl.searchParams.get("parentPath") || "";
  if (!isValidFolderPath(parentPath)) return NextResponse.json({ error: "Invalid folder path" }, { status: 400 });
  if (!fileFolderExists(categoryValue, parentPath)) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  return folderResponse(categoryValue, parentPath);
}

export async function POST(request: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { category?: unknown; parentPath?: unknown; name?: unknown } | null;
  const categoryValue = typeof body?.category === "string" ? body.category : "";
  if (!isUploadCategory(categoryValue) || categoryValue === "params") return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const parentPath = typeof body?.parentPath === "string" ? body.parentPath : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!isValidFolderPath(parentPath) || !isValidFolderName(name)) return NextResponse.json({ error: "Enter a valid folder name" }, { status: 400 });
  if (!fileFolderExists(categoryValue, parentPath)) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
  const folderPath = parentPath ? `${parentPath}/${name}` : name;
  if (!isValidFolderPath(folderPath)) return NextResponse.json({ error: "Folder path is too deep or too long" }, { status: 400 });
  if (!createFileFolder(categoryValue, folderPath)) return NextResponse.json({ error: "A folder with this name already exists here" }, { status: 409 });
  const identity = await currentDevIdentity();
  return NextResponse.json({ ok: true, folder: { name, path: folderPath }, createdBy: identity.name }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
