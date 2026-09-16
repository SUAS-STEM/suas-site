import { NextRequest, NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";
import { isDevSiteHost } from "@/lib/devHost";
import { listPendingUploadRequests, reviewUploadRequest } from "@/lib/uploadAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  return isDevSiteHost(req.headers.get("host")) && await isStitchAdmin();
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ requests: listPendingUploadRequests() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action === "approve" || body?.action === "deny" ? body.action : null;
  if (!id || !action) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!reviewUploadRequest(id, action)) return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
