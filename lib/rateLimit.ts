import { requestClientIp } from "@/lib/sitlClientIp";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
}

/** Returns the client address only from trusted Cloudflare/local-preview headers. */
export function clientAddress(headers: Headers) {
  return requestClientIp(headers) || "unknown";
}

/** Consume one request from each bucket; returns retry seconds when blocked. */
export function consumeRateLimit(keys: readonly string[], limit: number, now = Date.now()): number | null {
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  if (!uniqueKeys.length || limit <= 0) return null;
  prune(now);

  let retryAfter = 0;
  for (const key of uniqueKeys) {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= limit) {
      retryAfter = Math.max(retryAfter, Math.ceil((bucket.resetAt - now) / 1000));
    }
  }

  for (const key of uniqueKeys) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      bucket.count += 1;
    }
  }

  return retryAfter || null;
}
