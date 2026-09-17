import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";

const DEV_HOST = "dev.suasstem.org";
const DEV_ORIGIN = `https://${DEV_HOST}`;
const COOKIE = "dev_auth";
const DEVICE_COOKIE = "dev_device";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10;
const PROTECTED_PREFIXES = ["/dev", "/api/wiki", "/api/links", "/api/dev-files"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function makeToken(password: string, deviceId?: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(deviceId ? `dev-auth:${deviceId}` : "dev-auth"));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function setAuthCookies(response: NextResponse, token: string, deviceId: string) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
  response.cookies.set(COOKIE, token, cookieOptions);
  response.cookies.set(DEVICE_COOKIE, deviceId, cookieOptions);
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const password = process.env.PASSWORD;
  const host = req.headers.get("host")?.replace(/:\d+$/, "") ?? "";
  const isDevHost = host === DEV_HOST;
  const isLocalPreview = host === "localhost" || host === "127.0.0.1";
  // next.config.ts rewrites "/" -> "/dev" for this host, but that rewrite
  // happens after middleware, so this proxy sees the original "/" and must
  // treat it as protected explicitly.
  const isDevHostRoot = host === DEV_HOST && pathname === "/";

  if (pathname === "/dev-auth-callback" && !isDevHost && !isLocalPreview) {
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, DEV_ORIGIN));
  }

  if ((pathname.startsWith("/dev-login") || pathname.startsWith("/api/dev-auth")) && !isDevHost && !isLocalPreview) {
    if (pathname.startsWith("/api/")) return new NextResponse("Not Found", { status: 404 });
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, DEV_ORIGIN));
  }

  if (pathname.startsWith("/api/dev-access")) {
    if (!isDevHost && !isLocalPreview) return new NextResponse("Not Found", { status: 404 });
    return NextResponse.next();
  }

  if (pathname === "/dev-auth-callback") {
    const origin = requestOrigin(req);
    const submitted = searchParams.get("token");
    const redirectParam = searchParams.get("redirect") ?? "/";
    const safe = redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : "/";
    const loginUrl = new URL("/dev-login", origin);

    if (!password || !submitted) return NextResponse.redirect(loginUrl);

    const deviceId = req.cookies.get(DEVICE_COOKIE)?.value || crypto.randomUUID();
    const expected = await makeToken(password, deviceId);
    const legacyExpected = await makeToken(password);
    if (submitted !== expected && submitted !== legacyExpected) return NextResponse.redirect(loginUrl);

    const res = NextResponse.redirect(new URL(safe, origin));
    setAuthCookies(res, await makeToken(password, deviceId), deviceId);
    return res;
  }

  if (pathname.startsWith("/dev-login") || pathname.startsWith("/api/dev-auth")) {
    return NextResponse.next();
  }

  if (isProtected(pathname) && !isDevHost && !isLocalPreview) {
    if (pathname.startsWith("/api/")) return new NextResponse("Not Found", { status: 404 });
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, DEV_ORIGIN));
  }

  const isPublicStatusRoute = pathname === "/status" || pathname.startsWith("/status/") || pathname === "/api/status" || pathname.startsWith("/api/status/");
  const needsDevHostAuth = isDevHost && !isPublicStatusRoute;
  const pathRequiresProtection = isProtected(pathname) && !isLocalPreview;
  if (!pathRequiresProtection && !needsDevHostAuth && !isDevHostRoot) return NextResponse.next();

  // Fail closed: without a configured password, protected routes are blocked
  // rather than silently served, so a missing env var can't leak internal content.
  if (!password) {
    return new NextResponse("Not configured", { status: 503 });
  }

  const token = req.cookies.get(COOKIE)?.value;
  const deviceId = req.cookies.get(DEVICE_COOKIE)?.value;
  const expected = deviceId ? await makeToken(password, deviceId) : "";
  if (token && deviceId && token === expected) {
    const response = NextResponse.next();
    setAuthCookies(response, token, deviceId);
    return response;
  }
  if (token === await makeToken(password)) {
    const upgradedDeviceId = crypto.randomUUID();
    const response = NextResponse.next();
    setAuthCookies(response, await makeToken(password, upgradedDeviceId), upgradedDeviceId);
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const loginUrl = new URL("/dev-login", requestOrigin(req));
  loginUrl.searchParams.set("redirect", isDevHostRoot ? "/" : pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.avif|images/).*)"],
};
