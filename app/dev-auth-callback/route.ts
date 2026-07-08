import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function makeToken(password: string): string {
  return createHmac("sha256", password).update("dev-auth").digest("base64url");
}

export function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token") ?? "";
  const redirect = searchParams.get("redirect") ?? "/dev";

  const password = process.env.PASSWORD ?? "";
  const expected = password ? makeToken(password) : "";

  if (!expected || token !== expected) {
    return NextResponse.redirect(new URL("/dev-login", req.url));
  }

  const safe = redirect.startsWith("/") ? redirect : "/dev";
  const res = NextResponse.redirect(new URL(safe, req.url));
  res.cookies.set("dev-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
