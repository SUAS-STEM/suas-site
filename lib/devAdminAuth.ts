import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDeviceAccess, isPermanentAdmin } from "@/lib/devAccess";
import { userFromSessionToken } from "@/lib/authCore";

const COOKIE = "dev_auth";
const DEVICE_COOKIE = "dev_device";
const ADMIN_COOKIE = "dev_admin";
export const DEV_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function tokenFor(password: string, purpose: "dev-auth" | "dev-admin", deviceId: string, expiresAt: number) {
  const payload = `v2:${purpose}:${deviceId}:${expiresAt}`;
  const signature = createHmac("sha256", password).update(payload).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function validToken(password: string, purpose: "dev-auth" | "dev-admin", deviceId: string, token: string | undefined) {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = tokenFor(password, purpose, deviceId, expiresAt);
  const actualBytes = Buffer.from(token.slice(separator + 1));
  const expectedBytes = Buffer.from(expected.slice(expected.indexOf(".") + 1));
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function expectedDevToken(deviceId?: string, expiresAt = Date.now() + DEV_SESSION_MAX_AGE * 1000): string | null {
  const password = process.env.PASSWORD;
  if (!password || !deviceId) return null;
  return tokenFor(password, "dev-auth", deviceId, expiresAt);
}

export async function isDevAuthorized(): Promise<boolean> {
  const jar = await cookies();
  const sharedUser = userFromSessionToken(jar.get("suas_session")?.value);
  if (sharedUser?.status === "approved") return true;
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const password = process.env.PASSWORD;
  if (!password || !deviceId || !validToken(password, "dev-auth", deviceId, jar.get(COOKIE)?.value)) return false;
  if (validToken(password, "dev-admin", deviceId, jar.get(ADMIN_COOKIE)?.value)) return true;
  return !!deviceId && getDeviceAccess(deviceId)?.status === "approved";
}

export async function isDevAdmin(): Promise<boolean> {
  const jar = await cookies();
  const sharedUser = userFromSessionToken(jar.get("suas_session")?.value);
  if (sharedUser?.status === "approved") return sharedUser.role === "admin";
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const password = process.env.PASSWORD;
  return Boolean(
    password && deviceId && validToken(password, "dev-auth", deviceId, jar.get(COOKIE)?.value) &&
    (validToken(password, "dev-admin", deviceId, jar.get(ADMIN_COOKIE)?.value) || isPermanentAdmin(deviceId)),
  );
}

export async function currentDevIdentity() {
  const jar = await cookies();
  const sharedUser = userFromSessionToken(jar.get("suas_session")?.value);
  if (sharedUser) return { id: sharedUser.id, name: sharedUser.displayName, username: sharedUser.username, role: sharedUser.role };
  const deviceId = jar.get(DEVICE_COOKIE)?.value || "admin";
  const request = getDeviceAccess(deviceId);
  const password = process.env.PASSWORD;
  const admin = Boolean(
    password && validToken(password, "dev-auth", deviceId, jar.get(COOKIE)?.value) &&
    (validToken(password, "dev-admin", deviceId, jar.get(ADMIN_COOKIE)?.value) || isPermanentAdmin(deviceId)),
  );
  return { id: deviceId, name: request?.name || (admin ? "Admin" : "Approved member"), role: admin ? "admin" as const : "member" as const };
}

export function setDeviceSession(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, deviceId: string, admin = false) {
  const password = process.env.PASSWORD;
  if (!password) throw new Error("Dev access is not configured");
  const expiresAt = Date.now() + DEV_SESSION_MAX_AGE * 1000;
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEV_SESSION_MAX_AGE,
  };
  response.cookies.set(COOKIE, tokenFor(password, "dev-auth", deviceId, expiresAt), options);
  response.cookies.set(DEVICE_COOKIE, deviceId, options);
  if (admin) response.cookies.set(ADMIN_COOKIE, tokenFor(password, "dev-admin", deviceId, expiresAt), options);
  else response.cookies.set(ADMIN_COOKIE, "", { ...options, maxAge: 0 });
}

export const DEV_ADMIN_COOKIE = ADMIN_COOKIE;
