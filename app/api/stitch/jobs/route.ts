import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";
import { cleanupStaleJobs, JOB_ROOT, StitchJobMeta, writeJob } from "@/lib/stitchJobs";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isStitchAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await cleanupStaleJobs();
  const id = randomUUID();
  const meta: StitchJobMeta = {
    id,
    token: randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
    files: [],
    totalBytes: 0,
  };
  await mkdir(path.join(JOB_ROOT, id, "images"), { recursive: true, mode: 0o700 });
  await writeJob(meta);
  return NextResponse.json({ id, createdAt: meta.createdAt });
}
