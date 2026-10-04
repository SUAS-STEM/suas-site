import { NextRequest, NextResponse } from "next/server";
import { isDevAuthorized } from "@/lib/devAdminAuth";
import { getFileRecord } from "@/lib/fileRecords";
import { readFileThumbnail } from "@/lib/fileThumbnails";
import { isStoredFileName, isUploadCategory } from "@/lib/devUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  const category = req.nextUrl.searchParams.get("category");
  if (!name || !isStoredFileName(name) || !category || !isUploadCategory(category)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  const record = getFileRecord(name);
  if (!record || record.category !== category || (!record.type.startsWith("image/") && !record.type.startsWith("video/"))) {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }
  if (record.cloudStatus !== "uploaded" && record.cloudStatus !== "local") return NextResponse.json({ error: "Preview is not available yet" }, { status: 404 });
  try {
    const thumbnail = await readFileThumbnail(name);
    return new NextResponse(new Uint8Array(thumbnail), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(thumbnail.length),
        // Dev gallery thumbnails are authenticated team content. Keep them out
        // of shared/CDN caches, but let the signed-in browser reuse the
        // versioned thumbnail URL while scrolling and revisiting the gallery.
        "Cache-Control": "private, max-age=31536000, immutable",
        "Cloudflare-CDN-Cache-Control": "no-store",
        "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
