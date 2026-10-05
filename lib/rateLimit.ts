type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const MAX_ENTRIES = 5_000;
const entries = new Map<string, RateLimitEntry>();

function prune(now: number) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

export function requestClientIp(request: { headers: Headers }): string {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // When Cloudflare is not present (for example localhost development), use
  // the proxy nearest to the application, not the spoofable left-most XFF
  // entry supplied by the client.
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

export function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const key = `${scope}:${identity}`;
  let entry = entries.get(key);

  if (!entry || entry.resetAt <= now) {
    if (!entries.has(key) && entries.size >= MAX_ENTRIES) prune(now);
    entry = { count: 0, resetAt: now + windowMs };
    entries.set(key, entry);
  }

  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
