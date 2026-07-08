import { NextRequest, NextResponse } from "next/server";

const DEV_HOST = "dev.suasstem.org";
const COOKIE = "dev_auth";

async function makeToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("dev-auth"));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.replace(/:\d+$/, "") !== DEV_HOST) return NextResponse.next();

  const password = process.env.PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname, searchParams } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dev", req.url));
  }

  if (pathname === "/dev-auth-callback" && searchParams.get("token")) {
    const submitted = searchParams.get("token")!;
    const expected = await makeToken(password);
    if (submitted === expected) {
      const redirect = searchParams.get("redirect") ?? "/";
      const safe = redirect.startsWith("/") ? redirect : "/";
      const res = NextResponse.redirect(new URL(safe, req.url));
      res.cookies.set(COOKIE, expected, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
  }

  if (pathname.startsWith("/dev-login") || pathname.startsWith("/api/dev-auth") || pathname.startsWith("/dev-auth-callback")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  const expected = await makeToken(password);
  if (token === expected) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/dev-login";
  loginUrl.searchParams.set("redirect", pathname === "/" ? "/dev" : pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.avif|images/).*)"],
};
