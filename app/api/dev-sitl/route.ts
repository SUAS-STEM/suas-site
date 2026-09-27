import { NextRequest, NextResponse } from "next/server";
import { isDevAdmin, isDevAuthorized } from "@/lib/devAdminAuth";
import { getSITLStatus, startSITL, stopSITL } from "@/lib/sitlControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
};

export async function GET() {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [status, canControl] = await Promise.all([getSITLStatus(), isDevAdmin()]);
  return NextResponse.json({ ...status, canControl }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isDevAdmin())) return NextResponse.json({ error: "Administrator access is required to control SITL." }, { status: 403 });

  const body = await req.json().catch(() => null) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "start" && action !== "stop") return NextResponse.json({ error: "Use the start or stop action." }, { status: 400 });

  try {
    const status = action === "start" ? await startSITL() : await stopSITL();
    return NextResponse.json({ ok: true, ...status, canControl: true }, { headers: noStore });
  } catch (error) {
    console.error(`SITL ${action} error:`, error);
    return NextResponse.json({ error: `Could not ${action} SITL. Check the controller log on the Pi.` }, { status: 503, headers: noStore });
  }
}
