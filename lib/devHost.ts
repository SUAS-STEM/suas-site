export function isDevSiteHost(host: string | null) {
  const normalized = (host || "").replace(/:\d+$/, "").toLowerCase();
  return normalized === "dev.suasstem.org" || normalized === "localhost" || normalized === "127.0.0.1";
}

export async function isValidUploadSession(token: string | undefined, secret: string) {
  if (!token) return false;
  const [userId, expiresText, signature] = token.split(".");
  const expiresAt = Number(expiresText);
  if (!/^[0-9a-f-]{36}$/i.test(userId || "") || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${expiresAt}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return signature === expected;
}
