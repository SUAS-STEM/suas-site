import { createHmac, timingSafeEqual } from "node:crypto";

type ReviewAction = "approve" | "deny";

function signingSecret() {
  return process.env.ACCESS_REVIEW_SECRET || process.env.PASSWORD || "";
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createAccessReviewToken(id: string, action: ReviewAction, ttlSeconds = 7 * 24 * 60 * 60) {
  const payload = encode({ id, action, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return `${payload}.${signature(payload)}`;
}

export function verifyAccessReviewToken(token: string): { id: string; action: ReviewAction } | null {
  const secret = signingSecret();
  const parts = token.split(".");
  if (!secret || parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { id?: unknown; action?: unknown; exp?: unknown };
    if (typeof payload.id !== "string" || !payload.id || (payload.action !== "approve" && payload.action !== "deny") || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.id, action: payload.action };
  } catch {
    return null;
  }
}
