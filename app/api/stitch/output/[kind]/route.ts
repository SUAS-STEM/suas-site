import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BROKER = process.env.STITCH_STATUS_ORIGIN || "http://host.docker.internal:3005";

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!['preview', 'download'].includes(kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const brokerToken = process.env.STITCH_BROKER_TOKEN;
  if (!brokerToken) return NextResponse.json({ error: "Stitch broker is not configured" }, { status: 503 });

  const statusResponse = await fetch(`${BROKER}/api/stitch/status`, { cache: "no-store" });
  if (!statusResponse.ok) return NextResponse.json({ error: "Status unavailable" }, { status: 503 });
  const status = await statusResponse.json();
  const runId = Number(status.runId || status.artifact?.runId || 0);
  if (status.status !== "complete" || !Number.isSafeInteger(runId) || runId <= 0 || status.artifact?.runId !== runId || status.artifact?.jobId !== status.jobId) {
    return NextResponse.json({ error: "No completed output is available for the current job" }, { status: 404 });
  }

  const filename = kind === "preview" ? "preview.jpg" : "odm_orthophoto.tif";
  const response = await fetch(`${BROKER}/api/stitch/artifact?run_id=${runId}&filename=${encodeURIComponent(filename)}`, {
    headers: { "X-Stitch-Broker-Token": brokerToken }, cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Output artifact is not available yet" }, { status: response.status });
  const body = await response.arrayBuffer();
  const headers: Record<string, string> = {
    "Content-Type": kind === "preview" ? "image/jpeg" : "image/tiff",
    "Cache-Control": "no-store",
  };
  if (kind === "download") headers["Content-Disposition"] = 'attachment; filename="odm_orthophoto.tif"';
  return new NextResponse(body, { headers });
}
