import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

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

function makeToken(password: string): string {
  return createHmac("sha256", password)
    .update("dev-auth")
    .digest("base64url");
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let password = "";
  let redirect = "/";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    password = params.get("password") ?? "";
    redirect = params.get("redirect") ?? "/";
  } else {
    const body = await req.json().catch(() => ({}));
    password = body.password ?? "";
    redirect = body.redirect ?? "/";
  }

  const correct = process.env.PASSWORD ?? "";
  if (!correct) {
    const url = new URL("/dev-login", req.url);
    url.searchParams.set("error", "not-configured");
    url.searchParams.set("redirect", redirect);
    return NextResponse.redirect(url, 302);
  }

  const a = Buffer.alloc(correct.length);
  const b = Buffer.from(correct);
  Buffer.from(password).copy(a, 0, 0, correct.length);
  const match = timingSafeEqual(a, b) && password.length === correct.length;

  if (!match) {
    const url = new URL("/dev-login", req.url);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("redirect", redirect);
    return NextResponse.redirect(url, 302);
  }

  const token = makeToken(correct);
  const safe = redirect.startsWith("/") ? redirect : "/";
  const res = NextResponse.redirect(new URL(safe, req.url), 302);
  res.cookies.set("dev_auth", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
