import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";

const DEV_HOST = "dev.suasstem.org";
const DEV_ORIGIN = `https://${DEV_HOST}`;
const COOKIE = "dev_auth";
const DEVICE_COOKIE = "dev_device";
const SHARED_COOKIE = "suas_auth";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PROTECTED_PREFIXES = ["/dev", "/api/wiki", "/api/links", "/api/dev-files", "/api/dev-sitl", "/api/sitl-access", "/api/sitl-connect"];
const INSTALLER_CLIENT_PREFIXES = [
  "/api/ssgcs/install/start",
  "/api/ssgcs/install/poll",
  "/api/ssgcs/install/exchange",
  "/api/ssgcs/install/manifest",
  "/api/ssgcs/install/files",
  "/api/ssgcs/admin/releases",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function makeToken(password: string, deviceId = "", expiresAt = Date.now() + SESSION_MAX_AGE * 1000): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payload = `v2:dev-auth:${deviceId}:${expiresAt}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${expiresAt}.${encoded}`;
}

async function verifyDeviceToken(password: string, deviceId: string, token: string | undefined) {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  return token === await makeToken(password, deviceId, expiresAt);
}

function isSameOriginRequest(req: NextRequest, isLocalPreview: boolean) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const allowed = isLocalPreview
      ? new Set(["http://localhost", "http://127.0.0.1", "http://localhost:3002", "http://127.0.0.1:3002"])
      : new Set([DEV_ORIGIN]);
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
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

async function verifySharedCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.AUTH_SECRET || process.env.PASSWORD;
  if (!secret) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const decode = (encoded: string) => {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  };
  let bytes: Uint8Array;
  try {
    bytes = decode(signature);
  } catch {
    return false;
  }
  if (!await crypto.subtle.verify("HMAC", key, bytes as BufferSource, new TextEncoder().encode(payload) as BufferSource)) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decode(payload))) as { v?: number; exp?: number };
    return parsed.v === 2 && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
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
  const isInstallerClientRequest = INSTALLER_CLIENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );

  if ((isDevHost || isLocalPreview) && !isSameOriginRequest(req, isLocalPreview)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Native installer/deployment clients do not have browser cookies. These
  // routes enforce their own one-time device proofs or deployment bearer token.
  if (isDevHost && isInstallerClientRequest) return NextResponse.next();

  if (pathname === "/dev-auth-callback" && !isDevHost && !isLocalPreview) {
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, DEV_ORIGIN));
  }

  if ((pathname.startsWith("/dev-login") || pathname.startsWith("/dev-register") || pathname.startsWith("/api/dev-auth") || pathname.startsWith("/api/suas-auth")) && !isDevHost && !isLocalPreview) {
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

  if (pathname.startsWith("/dev-login") || pathname.startsWith("/dev-register") || pathname.startsWith("/api/dev-auth") || pathname.startsWith("/api/suas-auth")) {
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
  if (await verifySharedCookie(req.cookies.get(SHARED_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (token && deviceId && await verifyDeviceToken(password, deviceId, token)) {
    const response = NextResponse.next();
    setAuthCookies(response, token, deviceId);
    return response;
  }
  if (await verifyDeviceToken(password, "", token)) {
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
  // Force browsers that already have the retired password page open to fetch
  // the request-based access page again. The page itself is no-store, but an
  // already-open tab can otherwise remain on the old DOM until navigation.
  loginUrl.searchParams.set("v", String(Date.now()));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|.*\\.avif|images/).*)"],
};
