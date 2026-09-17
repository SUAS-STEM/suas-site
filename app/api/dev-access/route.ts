import { NextRequest, NextResponse } from "next/server";
import { isDevAdmin, isDevAuthorized, setDeviceSession } from "@/lib/devAdminAuth";
import {
  getDeviceAccess,
  getDeviceAccessByPhrase,
  isPermanentAdmin,
  listApprovedDeviceAccessRequests,
  listPendingDeviceAccessRequests,
  promoteDevice,
  requestDeviceAccess,
  reviewDeviceAccessRequest,
} from "@/lib/devAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

function isDevHost(req: NextRequest) {
  const host = (req.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase();
  return host === "dev.suasstem.org" || host === "localhost" || host === "127.0.0.1";
}

function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

export async function GET(req: NextRequest) {
  if (!isDevHost(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (req.nextUrl.searchParams.get("pending") === "1") {
    if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(
      {
        requests: listPendingDeviceAccessRequests(),
        devices: listApprovedDeviceAccessRequests(),
        canManageAdmins: await isDevAdmin(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Invalid device" }, { status: 400 });
  const request = getDeviceAccess(deviceId);
  if (request?.status === "approved") {
    const response = NextResponse.json({ status: "approved", phrase: request.phrase }, { headers: { "Cache-Control": "private, no-store" } });
    setDeviceSession(response, deviceId, isPermanentAdmin(deviceId));
    return response;
  }
  return NextResponse.json(
    { status: request?.status || "not_requested", requestId: request?.id || null, phrase: request?.phrase || null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest) {
  if (!isDevHost(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "request") {
    const deviceId = body?.deviceId;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Invalid device" }, { status: 400 });
    if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Name must be between 2 and 80 characters" }, { status: 400 });
    const request = requestDeviceAccess(deviceId, name, req.headers.get("user-agent") || "");
    const response = NextResponse.json({ status: request.status, requestId: request.id, phrase: request.phrase }, { status: 202 });
    if (request.status === "approved") setDeviceSession(response, deviceId, isPermanentAdmin(deviceId));
    return response;
  }

  if (!(await isDevAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = typeof body?.id === "string" ? body.id : "";
  const review = body?.action === "approve" || body?.action === "deny" || body?.action === "kick" || body?.action === "make_admin"
    ? body.action
    : null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const requestedId = id || (code.match(/^\d{6}$/) ? getDeviceAccessByPhrase(code)?.id || "" : "");
  if (!requestedId || !review) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (review === "make_admin") {
    if (!(await isDevAdmin())) return NextResponse.json({ error: "Only an admin can assign admin access" }, { status: 403 });
    if (!promoteDevice(requestedId)) return NextResponse.json({ error: "Device not found or not eligible" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (!reviewDeviceAccessRequest(requestedId, review)) return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
