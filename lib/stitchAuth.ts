import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "dev_auth";

export function expectedDevToken(): string | null {
  const password = process.env.PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("dev-auth").digest("base64url");
}

export async function isStitchAdmin(): Promise<boolean> {
  const expected = expectedDevToken();
  if (!expected) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === expected;
}
