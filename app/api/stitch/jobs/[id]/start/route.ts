import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";
import { DEFAULT_STITCH_SETTINGS, jobDir, MAX_FILES_PER_JOB, normalizeStitchSettings, readJob, writeJob } from "@/lib/stitchJobs";

export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
const BROKER = process.env.STITCH_STATUS_ORIGIN || "http://host.docker.internal:3005";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isStitchAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const meta = await readJob(id);
  if (meta.startedAt) return NextResponse.json({ error: "Job already started" }, { status: 409 });
  if (meta.files.length < 2) return NextResponse.json({ error: "Upload at least two images" }, { status: 400 });
  if (meta.files.length > MAX_FILES_PER_JOB) return NextResponse.json({ error: "Too many images" }, { status: 413 });
  let settings = DEFAULT_STITCH_SETTINGS;
  try {
    const body = await req.json().catch(() => ({}));
    settings = normalizeStitchSettings(body?.settings ?? DEFAULT_STITCH_SETTINGS);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid stitch settings" }, { status: 400 });
  }

  const archive = path.join(jobDir(id), "input.tar.gz");
  await execFileAsync("/usr/bin/tar", ["-czf", archive, "-C", path.join(jobDir(id), "images"), "."], { timeout: 120_000 });

  const brokerToken = process.env.STITCH_BROKER_TOKEN;
  if (!brokerToken) return NextResponse.json({ error: "Stitch broker is not configured" }, { status: 503 });
  const response = await fetch(`${BROKER}/api/stitch/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Stitch-Broker-Token": brokerToken },
    body: JSON.stringify({
      workflow: "stitch-job.yml",
      inputs: {
        job_id: id,
        input_url: `https://suasstem.org/api/stitch/jobs/${id}/input`,
        input_token: meta.token,
        settings,
      },
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: result.error || `Broker returned ${response.status}` }, { status: 502 });

  meta.startedAt = new Date().toISOString();
  meta.settings = settings;
  await writeJob(meta);
  return NextResponse.json({ ok: true, id, files: meta.files.length, totalBytes: meta.totalBytes, settings });
}
