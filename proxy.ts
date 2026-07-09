import { NextRequest, NextResponse } from "next/server";

const DEV_HOST = "dev.suasstem.org";
const COOKIE = "dev_auth";
const PROTECTED_PREFIXES = ["/dev", "/api/wiki", "/api/links"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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
  const { pathname, searchParams } = req.nextUrl;
  const password = process.env.PASSWORD;

  if (pathname === "/dev-auth-callback") {
    const submitted = searchParams.get("token");
    const redirectParam = searchParams.get("redirect") ?? "/";
    const safe = redirectParam.startsWith("/") ? redirectParam : "/";
    const loginUrl = new URL("/dev-login", req.url);

    if (!password || !submitted) return NextResponse.redirect(loginUrl);

    const expected = await makeToken(password);
    if (submitted !== expected) return NextResponse.redirect(loginUrl);

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

  if (pathname.startsWith("/dev-login") || pathname.startsWith("/api/dev-auth")) {
    return NextResponse.next();
  }

  if (!isProtected(pathname)) return NextResponse.next();

  // Fail closed: without a configured password, protected routes are blocked
  // rather than silently served, so a missing env var can't leak internal content.
  if (!password) {
    return new NextResponse("Not configured", { status: 503 });
  }

  const token = req.cookies.get(COOKIE)?.value;
  const expected = await makeToken(password);
  if (token === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const host = req.headers.get("host")?.replace(/:\d+$/, "") ?? "";
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/dev-login";
  loginUrl.searchParams.set("redirect", host === DEV_HOST && pathname === "/dev" ? "/" : pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.avif|images/).*)"],
};
