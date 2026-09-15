import { readFile, stat } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILE = "/run/suas-status/status.json";
const STALE_AFTER_SECONDS = 90;
const DEAD_AFTER_SECONDS = 180;
const CHECK_MS = 200;
const HEARTBEAT_MS = 15_000;

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
    poll_interval_seconds: 1,
    delivery: "sse",
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  // Build the first event before constructing the stream. This guarantees a
  // body chunk is ready synchronously when Next.js starts sending the response.
  const [initialRaw, initialInfo] = await Promise.all([readFile(STATUS_FILE, "utf8"), stat(STATUS_FILE)]);
  const initialPayload = enrich(initialRaw, initialInfo.mtime);

  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastMtimeMs = initialInfo.mtimeMs;
  let busy = false;

  const cleanup = () => {
    closed = true;
    if (timer) clearInterval(timer);
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`retry: 1000\n: stream-open ${Date.now()}\n\ndata: ${JSON.stringify(initialPayload)}\n\n`));

      const sendLatest = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          const info = await stat(STATUS_FILE);
          if (info.mtimeMs === lastMtimeMs) return;
          const raw = await readFile(STATUS_FILE, "utf8");
          const payload = enrich(raw, info.mtime);
          lastMtimeMs = info.mtimeMs;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          if (!closed) controller.enqueue(encoder.encode(`event: warning\ndata: {"error":"status temporarily unavailable"}\n\n`));
        } finally {
          busy = false;
        }
      };

      timer = setInterval(() => void sendLatest(), CHECK_MS);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
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
