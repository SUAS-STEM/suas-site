import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";
import { setDeviceSession } from "@/lib/devAdminAuth";
import { clientAddress, consumeRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let password = "";
  let redirect = "/";
  let deviceId = "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    password = params.get("password") ?? "";
    redirect = params.get("redirect") ?? "/";
    deviceId = params.get("deviceId") ?? "";
  } else {
    const body = await req.json().catch(() => ({}));
    password = body.password ?? "";
    redirect = body.redirect ?? "/";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  }

  const origin = requestOrigin(req);
  const retryAfter = consumeRateLimit([`legacy-login:ip:${clientAddress(req.headers)}`], 10);
  if (retryAfter) {
    const url = new URL("/dev-login", origin);
    url.searchParams.set("error", "rate-limited");
    url.searchParams.set("redirect", redirect);
    return NextResponse.redirect(url, 302);
  }

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
