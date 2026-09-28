import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, loginUser, registerUser, SESSION_MAX_AGE, sessionCookies, userFromSessionToken } from "@/lib/authCore";
import { clientAddress, consumeRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deviceId(req: NextRequest, supplied: unknown) {
  return typeof supplied === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(supplied)
    ? supplied
    : req.cookies.get("suas_device")?.value || crypto.randomUUID();
}

function resultError(message: string, status = 400, retryAfter?: number | null) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return NextResponse.json({ error: message }, { status, headers });
}

export async function GET(req: NextRequest) {
  const user = userFromSessionToken(req.cookies.get("suas_session")?.value);
  return NextResponse.json({ user }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const ip = clientAddress(req.headers);

  if (action === "register") {
    const retryAfter = consumeRateLimit([`register:ip:${ip}`], 5);
    if (retryAfter) return resultError("Too many registration attempts; try again later", 429, retryAfter);
    try {
      const user = registerUser(String(body.username || ""), String(body.password || ""), String(body.displayName || ""));
      return NextResponse.json({ status: "pending", user }, { status: 202, headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
      return resultError(cause instanceof Error ? cause.message : "Could not register");
    }
  }

  if (action === "logout") {
    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response);
    return response;
  }

  if (action !== "login") return resultError("Unknown action");
  const username = String(body.username || "");
  const password = String(body.password || "");
  const normalizedUsername = username.trim().toLowerCase();
  if (!username || !password) return resultError("Username and password are required");
  const retryAfter = consumeRateLimit([
    `login:ip:${ip}`,
    `login:user:${normalizedUsername || "unknown"}`,
  ], 12);
  if (retryAfter) return resultError("Too many sign-in attempts; try again later", 429, retryAfter);
  const result = loginUser(username, password, deviceId(req, body.deviceId), req.headers.get("user-agent") || "");
  if (result.kind === "invalid") return resultError("Invalid username or password", 401);
  if (result.kind === "pending") return NextResponse.json({ status: "pending", user: result.user }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (result.kind === "denied") return NextResponse.json({ status: "denied" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!result.token) return resultError("Could not create trusted session", 500);

  const response = NextResponse.json({ status: "approved", user: result.user }, { headers: { "Cache-Control": "no-store" } });
  sessionCookies(response, result.token, result.user);
  response.cookies.set("suas_device", deviceId(req, body.deviceId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
