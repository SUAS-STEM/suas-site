import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILE = "/run/suas-status/status.json";
const STALE_AFTER_SECONDS = 90;
const DEAD_AFTER_SECONDS = 180;

type Team = {
  flight_order: string;
  uid: string;
  team: string;
  safety_inspection?: string;
  design_for_rapid_response?: string;
  location?: string;
  flight_status: string;
  notes?: string;
};

type StatusFile = {
  updated_at: string;
  source: string;
  current_team: Team | null;
  current_is_inferred: boolean;
  last_team_gone: Team | null;
  next_team: Team | null;
  gone_count: number;
  gone: Team[];
  tesla: Team | null;
  teams: Team[];
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

export async function GET() {
  try {
    const [raw, fileInfo] = await Promise.all([
      readFile(STATUS_FILE, "utf8"),
      stat(STATUS_FILE),
    ]);
    const data: unknown = JSON.parse(raw);
    if (!validStatus(data)) throw new Error("Status file has an invalid schema");

    const updatedMs = Date.parse(data.updated_at);
    if (!Number.isFinite(updatedMs)) throw new Error("Status file has an invalid updated_at value");

    const ageSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
    const health =
      ageSeconds >= DEAD_AFTER_SECONDS
        ? "stale"
        : ageSeconds >= STALE_AFTER_SECONDS
          ? "delayed"
          : "live";

    return NextResponse.json(
      {
        ...data,
        health,
        age_seconds: ageSeconds,
        stale_after_seconds: STALE_AFTER_SECONDS,
        file_mtime: fileInfo.mtime.toISOString(),
        served_at: new Date().toISOString(),
        poll_interval_seconds: 1,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("SUAS status API error:", error);
    return NextResponse.json(
      {
        health: "unavailable",
        error: "Live competition status is temporarily unavailable.",
        served_at: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
        },
      },
    );
  }
}
