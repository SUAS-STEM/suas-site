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

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastMtimeMs = -1;
  let busy = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendLatest = async (force = false) => {
        if (closed || busy) return;
        busy = true;
        try {
          const info = await stat(STATUS_FILE);
          if (!force && info.mtimeMs === lastMtimeMs) return;
          const raw = await readFile(STATUS_FILE, "utf8");
          const payload = enrich(raw, info.mtime);
          lastMtimeMs = info.mtimeMs;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (error) {
          if (!closed) {
            controller.enqueue(encoder.encode(`event: warning\ndata: ${JSON.stringify({ error: "status temporarily unavailable" })}\n\n`));
          }
        } finally {
          busy = false;
        }
      };

      void sendLatest(true);
      timer = setInterval(() => void sendLatest(false), CHECK_MS);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "CDN-Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
