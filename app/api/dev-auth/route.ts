import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";
import { setDeviceSession } from "@/lib/devAdminAuth";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
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
