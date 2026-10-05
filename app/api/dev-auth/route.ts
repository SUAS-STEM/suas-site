import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";
import { setDeviceSession } from "@/lib/devAdminAuth";
import { checkRateLimit, readBoundedText, requestClientIp } from "@/lib/rateLimit";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(req: NextRequest) {
  const origin = requestOrigin(req);
  const ip = requestClientIp(req);
  const rateLimit = checkRateLimit("dev-auth", ip, MAX_ATTEMPTS, WINDOW_MS);
  if (!rateLimit.allowed) {
    const url = new URL("/dev-login", origin);
    url.searchParams.set("error", "rate-limited");
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  const text = await readBoundedText(req, MAX_BODY_BYTES);
  if (text === null) return new NextResponse("Request too large", { status: 413 });

  const contentType = req.headers.get("content-type") ?? "";
  let password = "";
  let redirect = "/";
  let deviceId = "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    password = params.get("password") ?? "";
    redirect = params.get("redirect") ?? "/";
    deviceId = params.get("deviceId") ?? "";
  } else {
    const body = (() => {
      try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
    })();
    password = typeof body.password === "string" ? body.password : "";
    redirect = typeof body.redirect === "string" ? body.redirect : "/";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  }

  password = typeof password === "string" ? password : "";
  redirect = typeof redirect === "string" ? redirect : "/";

  const correct = process.env.PASSWORD ?? "";
  if (!correct) {
    const url = new URL("/dev-login", origin);
    url.searchParams.set("error", "not-configured");
    url.searchParams.set("redirect", redirect);
    return NextResponse.redirect(url, 302);
  }

  const a = Buffer.alloc(correct.length);
  const b = Buffer.from(correct);
  Buffer.from(password).copy(a, 0, 0, correct.length);
  const match = timingSafeEqual(a, b) && password.length === correct.length;

  if (!match) {
    const url = new URL("/dev-login", origin);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("redirect", redirect);
    return NextResponse.redirect(url, 302);
  }

  const trustedDeviceId = /^[A-Za-z0-9_-]{20,128}$/.test(deviceId)
    ? deviceId
    : randomBytes(32).toString("base64url");
  const safe = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
  const res = NextResponse.redirect(new URL(safe, origin), 302);
  setDeviceSession(res, trustedDeviceId, true);
  return res;
}
