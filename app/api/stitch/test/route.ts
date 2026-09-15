import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";

export const runtime = "nodejs";
const BROKER = process.env.STITCH_STATUS_ORIGIN || "http://host.docker.internal:3005";

export async function POST() {
  if (!(await isStitchAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brokerToken = process.env.STITCH_BROKER_TOKEN;
  if (!brokerToken) return NextResponse.json({ error: "Stitch broker is not configured" }, { status: 503 });
  const jobId = `test-${randomUUID()}`;
  const response = await fetch(`${BROKER}/api/stitch/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Stitch-Broker-Token": brokerToken },
    body: JSON.stringify({ workflow: "webodm-blacksmith-smoke.yml", inputs: { job_id: jobId } }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: result.error || `Broker returned ${response.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, jobId });
}
