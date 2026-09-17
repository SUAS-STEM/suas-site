import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getDeviceAccess, isPermanentAdmin } from "@/lib/devAccess";

const COOKIE = "dev_auth";
const DEVICE_COOKIE = "dev_device";
const ADMIN_COOKIE = "dev_admin";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10;

export function expectedDevToken(deviceId?: string): string | null {
  const password = process.env.PASSWORD;
  if (!password || !deviceId) return null;
  return createHmac("sha256", password).update(`dev-auth:${deviceId}`).digest("base64url");
}

function expectedAdminToken(deviceId: string): string | null {
  const password = process.env.PASSWORD;
  if (!password || !deviceId) return null;
  return createHmac("sha256", password).update(`dev-admin:${deviceId}`).digest("base64url");
}

export async function isDevAuthorized(): Promise<boolean> {
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const expected = expectedDevToken(deviceId);
  if (!expected) return false;
  if (jar.get(COOKIE)?.value !== expected) return false;
  const adminToken = deviceId ? expectedAdminToken(deviceId) : null;
  if (adminToken && jar.get(ADMIN_COOKIE)?.value === adminToken) return true;
  return !!deviceId && getDeviceAccess(deviceId)?.status === "approved";
}

export async function isDevAdmin(): Promise<boolean> {
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const expected = expectedDevToken(deviceId);
  const expectedAdmin = deviceId ? expectedAdminToken(deviceId) : null;
  return Boolean(
    expected && expectedAdmin &&
    jar.get(COOKIE)?.value === expected &&
    (jar.get(ADMIN_COOKIE)?.value === expectedAdmin || (deviceId && isPermanentAdmin(deviceId))),
  );
}

export async function currentDevIdentity() {
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value || "admin";
  const request = getDeviceAccess(deviceId);
  const adminToken = expectedAdminToken(deviceId);
  const admin = Boolean(
    expectedDevToken(deviceId) && adminToken &&
    jar.get(COOKIE)?.value === expectedDevToken(deviceId) &&
    (jar.get(ADMIN_COOKIE)?.value === adminToken || isPermanentAdmin(deviceId)),
  );
  return { id: deviceId, name: request?.name || (admin ? "Admin" : "Approved member"), role: admin ? "admin" as const : "member" as const };
}

export function setDeviceSession(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, deviceId: string, admin = false) {
  const token = expectedDevToken(deviceId);
  if (!token) throw new Error("Dev access is not configured");
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
  response.cookies.set(COOKIE, token, options);
  response.cookies.set(DEVICE_COOKIE, deviceId, options);
  if (admin) {
    const adminToken = expectedAdminToken(deviceId);
    if (adminToken) response.cookies.set(ADMIN_COOKIE, adminToken, options);
  }
}

export const DEV_ADMIN_COOKIE = ADMIN_COOKIE;
