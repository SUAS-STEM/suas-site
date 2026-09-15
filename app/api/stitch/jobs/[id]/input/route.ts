import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { jobDir, readJob } from "@/lib/stitchJobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const meta = await readJob(id);
    const queryToken = req.nextUrl.searchParams.get("token");
    const auth = req.headers.get("authorization") || "";
    const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (queryToken !== meta.token && bearerToken !== meta.token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await readFile(path.join(jobDir(id), "input.tar.gz"));
    return new NextResponse(body, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="stitch-${id}.tar.gz"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Input archive not found" }, { status: 404 });
  }
}
