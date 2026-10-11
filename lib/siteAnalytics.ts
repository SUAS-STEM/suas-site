import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { NextRequest } from "next/server";

export const ANALYTICS_VISITOR_COOKIE = "suas_analytics_visitor";

const DB_PATH =
  process.env.SITE_ANALYTICS_DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/analytics/site-analytics.db"
    : path.join(process.cwd(), "data", "site-analytics.db"));

const EVENT_TYPES = new Set([
  "page_view",
  "page_summary",
  "interaction",
  "cta_impression",
  "web_vital",
  "client_error",
]);

const WEB_VITAL_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function cleanPath(value: unknown): string | null {
  const pathValue = cleanText(value, 512);
  if (!pathValue || !pathValue.startsWith("/")) return null;
  return pathValue.split("?")[0].split("#")[0].slice(0, 512);
}

function cleanReferrer(value: unknown): string | null {
  const raw = cleanText(value, 1_024);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 1_024);
  } catch {
    return null;
  }
}

function cleanUuid(value: unknown): string | null {
  const text = cleanText(value, 64);
  if (
    text &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    return text;
  }
  return null;
}

function cleanNumber(
  value: unknown,
  min: number,
  max: number,
  integer = false,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const bounded = Math.max(min, Math.min(max, value));
  return integer ? Math.round(bounded) : bounded;
}

function requestIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function hashNetworkIdentity(request: NextRequest): string | null {
  const ip = requestIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  if (ip === "unknown" && !userAgent) return null;
  return createHash("sha256")
    .update(`${ip}\n${userAgent}`)
    .digest("hex");
}

type AnalyticsDbGlobal = typeof globalThis & {
  __suasAnalyticsDb?: Database.Database;
};

function getDb(): Database.Database {
  const globalDb = globalThis as AnalyticsDbGlobal;
  if (globalDb.__suasAnalyticsDb) return globalDb.__suasAnalyticsDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 2000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      event_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      path TEXT,
      previous_path TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      interaction_name TEXT,
      interaction_label TEXT,
      duration_ms INTEGER,
      active_ms INTEGER,
      max_scroll_percent INTEGER,
      metric_name TEXT,
      metric_value REAL,
      viewport_category TEXT,
      color_scheme TEXT,
      connection_type TEXT,
      navigation_type TEXT,
      error_message TEXT,
      error_source TEXT,
      error_line INTEGER,
      error_column INTEGER,
      network_user_agent_hash TEXT,
      user_agent TEXT,
      accept_language TEXT,
      cf_country TEXT,
      cf_colo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_created_at
      ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_visitor
      ON analytics_events(visitor_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_session
      ON analytics_events(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_type
      ON analytics_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_path
      ON analytics_events(path, created_at);
  `);

  // Keep this intentionally bounded. Analytics should never become a disk
  // reliability risk for the production site.
  db.prepare(
    "DELETE FROM analytics_events WHERE created_at < datetime('now', '-180 days')",
  ).run();
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM analytics_events")
    .get() as { count: number };
  if (count.count > 250_000) {
    db.prepare(`
      DELETE FROM analytics_events
      WHERE event_id IN (
        SELECT event_id FROM analytics_events
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(count.count - 250_000);
  }

  globalDb.__suasAnalyticsDb = db;
  return db;
}

export type SiteAnalyticsBody = Record<string, unknown>;

export function recordSiteAnalyticsEvent(
  request: NextRequest,
  body: SiteAnalyticsBody,
): { visitorId: string; accepted: boolean } {
  const eventType = cleanText(body.eventType, 64);
  if (!eventType || !EVENT_TYPES.has(eventType)) {
    return { visitorId: "", accepted: false };
  }

  const existingVisitorId = cleanUuid(
    request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value,
  );
  const clientVisitorId = cleanUuid(body.visitorId);
  const visitorId = existingVisitorId || clientVisitorId || randomUUID();
  const sessionId = cleanUuid(body.sessionId);
  if (!sessionId) return { visitorId, accepted: false };

  const metricName = cleanText(body.metricName, 32);
  if (
    eventType === "web_vital" &&
    (!metricName || !WEB_VITAL_NAMES.has(metricName))
  ) {
    return { visitorId, accepted: false };
  }

  const cfRay = request.headers.get("cf-ray");
  const colo =
    cfRay && cfRay.includes("-")
      ? cleanText(cfRay.slice(cfRay.lastIndexOf("-") + 1), 16)
      : null;

  const row = {
    eventId: randomUUID(),
    visitorId,
    sessionId,
    createdAt: new Date().toISOString(),
    eventType,
    path: cleanPath(body.path),
    previousPath: cleanPath(body.previousPath),
    referrer: cleanReferrer(body.referrer),
    utmSource: cleanText(body.utmSource, 128),
    utmMedium: cleanText(body.utmMedium, 128),
    utmCampaign: cleanText(body.utmCampaign, 160),
    utmContent: cleanText(body.utmContent, 160),
    interactionName: cleanText(body.interactionName, 96),
    interactionLabel: cleanText(body.interactionLabel, 160),
    durationMs: cleanNumber(body.durationMs, 0, 24 * 60 * 60 * 1000, true),
    activeMs: cleanNumber(body.activeMs, 0, 24 * 60 * 60 * 1000, true),
    maxScrollPercent: cleanNumber(body.maxScrollPercent, 0, 100, true),
    metricName,
    metricValue: cleanNumber(body.metricValue, 0, 10_000_000),
    viewportCategory: cleanText(body.viewportCategory, 32),
    colorScheme: cleanText(body.colorScheme, 16),
    connectionType: cleanText(body.connectionType, 32),
    navigationType: cleanText(body.navigationType, 32),
    errorMessage: cleanText(body.errorMessage, 500),
    errorSource: cleanText(body.errorSource, 256),
    errorLine: cleanNumber(body.errorLine, 0, 10_000_000, true),
    errorColumn: cleanNumber(body.errorColumn, 0, 10_000_000, true),
    networkUserAgentHash: hashNetworkIdentity(request),
    userAgent: cleanText(request.headers.get("user-agent"), 2_048),
    acceptLanguage: cleanText(
      request.headers.get("accept-language"),
      1_024,
    ),
    cfCountry: cleanText(request.headers.get("cf-ipcountry"), 16),
    cfColo: colo,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO analytics_events (
      event_id, visitor_id, session_id, created_at, event_type, path,
      previous_path, referrer, utm_source, utm_medium, utm_campaign,
      utm_content, interaction_name, interaction_label, duration_ms,
      active_ms, max_scroll_percent, metric_name, metric_value,
      viewport_category, color_scheme, connection_type, navigation_type,
      error_message, error_source, error_line, error_column,
      network_user_agent_hash, user_agent, accept_language, cf_country,
      cf_colo
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    row.eventId,
    row.visitorId,
    row.sessionId,
    row.createdAt,
    row.eventType,
    row.path,
    row.previousPath,
    row.referrer,
    row.utmSource,
    row.utmMedium,
    row.utmCampaign,
    row.utmContent,
    row.interactionName,
    row.interactionLabel,
    row.durationMs,
    row.activeMs,
    row.maxScrollPercent,
    row.metricName,
    row.metricValue,
    row.viewportCategory,
    row.colorScheme,
    row.connectionType,
    row.navigationType,
    row.errorMessage,
    row.errorSource,
    row.errorLine,
    row.errorColumn,
    row.networkUserAgentHash,
    row.userAgent,
    row.acceptLanguage,
    row.cfCountry,
    row.cfColo,
  );

  return { visitorId, accepted: true };
}
