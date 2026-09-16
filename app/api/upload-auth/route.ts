import { NextRequest, NextResponse } from "next/server";
import {
  clearUploadSession,
  currentUploadUser,
  loginUploadUser,
  publicUser,
  registerUploadUser,
  setUploadSession,
} from "@/lib/uploadAuth";
import { isDevSiteHost } from "@/lib/devHost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDevSiteHost(req.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await currentUploadUser();
  return NextResponse.json({ user: user ? publicUser(user) : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!isDevSiteHost(req.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action === "logout") {
    const response = NextResponse.json({ ok: true });
    clearUploadSession(response);
    return response;
  }
  if (action !== "register" && action !== "login") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  try {
    const user = action === "register"
      ? registerUploadUser(String(body?.name || ""), String(body?.passcode || ""))
      : loginUploadUser(String(body?.name || ""), String(body?.passcode || ""));
    if (!user) return NextResponse.json({ error: "Name or passcode not recognized" }, { status: 401 });
    if ("pending" in user) return NextResponse.json({ pending: true, error: "Your request is waiting for admin approval." }, { status: 403 });
    if (action === "register") return NextResponse.json({ ok: true, pending: true, message: "Request sent. An admin must approve it before you can sign in." }, { status: 202 });
    const response = NextResponse.json({ ok: true, user: publicUser(user) });
    setUploadSession(response, user.id);
    return response;
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "That name already has a request. Use Sign in to check its status." }, { status: 409 });
    }
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not create login" }, { status: 400 });
  }
}
