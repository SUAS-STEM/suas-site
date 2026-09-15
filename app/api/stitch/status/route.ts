import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = process.env.STITCH_STATUS_ORIGIN || "http://host.docker.internal:3005";

export async function GET() {
  try {
    const response = await fetch(`${ORIGIN}/api/stitch/status`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`origin returned ${response.status}`);
    const data = await response.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stitch status proxy error:", error);
    return NextResponse.json({ error: "Stitch status unavailable" }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
