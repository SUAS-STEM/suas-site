import { readFile, stat } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILE = "/run/suas-status/status.json";
const STALE_AFTER_SECONDS = 90;
const DEAD_AFTER_SECONDS = 180;
const CHECK_MS = 1_000;
const HEARTBEAT_MS = 15_000;

type Listener = (event: string) => void;
const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | undefined;
let pollBusy = false;
let lastMtimeMs = 0;

function enrich(raw: string, mtime: Date) {
  const data = JSON.parse(raw) as { updated_at: string } & Record<string, unknown>;
  const updatedMs = Date.parse(data.updated_at);
  if (!Number.isFinite(updatedMs)) throw new Error("invalid updated_at");
  const ageSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
  const health = ageSeconds >= DEAD_AFTER_SECONDS ? "stale" : ageSeconds >= STALE_AFTER_SECONDS ? "delayed" : "live";
  return {
    ...data,
    health,
    age_seconds: ageSeconds,
    stale_after_seconds: STALE_AFTER_SECONDS,
    file_mtime: mtime.toISOString(),
    served_at: new Date().toISOString(),
    poll_interval_seconds: CHECK_MS / 1000,
    delivery: "sse",
  };
}

async function pollLatest() {
  if (pollBusy || listeners.size === 0) return;
  pollBusy = true;
  try {
    const info = await stat(STATUS_FILE);
    if (info.mtimeMs === lastMtimeMs) return;
    const raw = await readFile(STATUS_FILE, "utf8");
    const event = `data: ${JSON.stringify(enrich(raw, info.mtime))}\n\n`;
    lastMtimeMs = info.mtimeMs;
    for (const listener of [...listeners]) listener(event);
  } catch {
    const warning = `event: warning\ndata: {"error":"status temporarily unavailable"}\n\n`;
    for (const listener of [...listeners]) listener(warning);
  } finally {
    pollBusy = false;
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  if (!pollTimer) pollTimer = setInterval(() => void pollLatest(), CHECK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  // Build the first event before constructing the stream. This guarantees a
  // body chunk is ready synchronously when Next.js starts sending the response.
  const [initialRaw, initialInfo] = await Promise.all([readFile(STATUS_FILE, "utf8"), stat(STATUS_FILE)]);
  const initialPayload = enrich(initialRaw, initialInfo.mtime);
  lastMtimeMs = Math.max(lastMtimeMs, initialInfo.mtimeMs);

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
  };
  request.signal.addEventListener("abort", cleanup, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`retry: 1000\n: stream-open ${Date.now()}\n\ndata: ${JSON.stringify(initialPayload)}\n\n`));
      unsubscribe = subscribe((event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          cleanup();
        }
      });
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
