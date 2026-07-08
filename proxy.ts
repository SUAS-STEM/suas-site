import { NextRequest, NextResponse } from "next/server";

const DEV_HOST = "dev.suasstem.org";
const COOKIE = "dev_auth";

async function verifyToken(token: string, password: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = Uint8Array.from(
      atob(token.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode("dev-auth")
    );
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.replace(/:\d+$/, "") !== DEV_HOST) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dev-login") || pathname.startsWith("/api/dev-auth")) {
    return NextResponse.next();
  }

  const password = process.env.PASSWORD;
  if (!password) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (token && (await verifyToken(token, password))) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/dev-login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.avif|images/).*)"],
};
