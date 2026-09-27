import { isIP } from "node:net";

export function normalizeSitlClientIp(value: string | null | undefined) {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.includes("]")) candidate = candidate.slice(1, candidate.indexOf("]"));
  if (candidate.toLowerCase().startsWith("::ffff:")) candidate = candidate.slice(7);
  const zone = candidate.indexOf("%");
  if (zone !== -1) candidate = candidate.slice(0, zone);
  if (isIP(candidate) === 6) {
    try {
      const hostname = new URL(`http://[${candidate}]/`).hostname;
      candidate = hostname.slice(1, -1);
    } catch {
      return null;
    }
  }
  return isIP(candidate) ? candidate : null;
}

export function requestClientIp(headers: Headers) {
  const cloudflare = normalizeSitlClientIp(headers.get("cf-connecting-ip"));
  if (cloudflare) return cloudflare;

  // Local previews and direct development requests do not pass through
  // Cloudflare. Never trust X-Forwarded-For on the production public host.
  if (process.env.NODE_ENV !== "production") {
    const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0];
    const parsed = normalizeSitlClientIp(forwarded);
    if (parsed) return parsed;
  }
  return null;
}
