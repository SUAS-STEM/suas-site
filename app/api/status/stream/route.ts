import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILE = "/run/suas-status/status.json";
const STALE_AFTER_SECONDS = 90;
const DEAD_AFTER_SECONDS = 180;
const CHECK_MS = 250;
const HEARTBEAT_MS = 15_000;

type StatusFile = {
  updated_at: string;
  source: string;
  current_is_inferred: boolean;
  gone_count: number;
  gone: unknown[];
  teams: unknown[];
  [key: string]: unknown;
};

function validStatus(value: unknown): value is StatusFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StatusFile>;
  return (
    typeof v.updated_at === "string" &&
    typeof v.source === "string" &&
    typeof v.gone_count === "number" &&
    Array.isArray(v.gone) &&
    Array.isArray(v.teams) &&
    typeof v.current_is_inferred === "boolean"
  );
}

async function payloadFromRaw(raw: string) {
  const data: unknown = JSON.parse(raw);
  if (!validStatus(data)) throw new Error("Status file has an invalid schema");
  const updatedMs = Date.parse(data.updated_at);
  if (!Number.isFinite(updatedMs)) throw new Error("Status file has an invalid updated_at value");
  const fileInfo = await stat(STATUS_FILE);
  const ageSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
  const health = ageSeconds >= DEAD_AFTER_SECONDS ? "stale" : ageSeconds >= STALE_AFTER_SECONDS ? "delayed" : "live";
  return {
    ...data,
    health,
    age_seconds: ageSeconds,
    stale_after_seconds: STALE_AFTER_SECONDS,
    file_mtime: fileInfo.mtime.toISOString(),
    served_at: new Date().toISOString(),
    poll_interval_seconds: 1,
    transport: "sse",
  };
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;
  let busy = false;
  let lastRaw = "";
  let checkTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (checkTimer) clearInterval(checkTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
      };

      const push = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          const raw = await readFile(STATUS_FILE, "utf8");
          if (raw !== lastRaw) {
            const payload = await payloadFromRaw(raw);
            if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            lastRaw = raw;
          }
        } catch (error) {
          console.error("SUAS status SSE error:", error);
        } finally {
          busy = false;
        }
      };

      void push();
      checkTimer = setInterval(() => void push(), CHECK_MS);
      heartbeatTimer = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, HEARTBEAT_MS);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      if (checkTimer) clearInterval(checkTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
