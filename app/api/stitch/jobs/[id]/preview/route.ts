import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { jobDir, readJob } from "@/lib/stitchJobs";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const meta = await readJob(id);
    if (!meta.files.length) return NextResponse.json({ error: "No images" }, { status: 404 });
    const output = path.join(jobDir(id), "input-preview.jpg");
    await access(output);
    try {
      return new NextResponse(await readFile(output), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
    } catch {
      await sharp(path.join(jobDir(id), "images", meta.files[0].storedName)).rotate().resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(output);
      return new NextResponse(await readFile(output), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
    }
  } catch {
    return NextResponse.json({ error: "Source preview not found" }, { status: 404 });
  }
}
