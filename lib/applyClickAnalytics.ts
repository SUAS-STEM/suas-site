import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { ANALYTICS_VISITOR_COOKIE } from "@/lib/siteAnalytics";

export const APPLICATION_FORM_URL = "https://forms.cloud.microsoft/r/M236hGQ0cv";
export const APPLY_VISITOR_COOKIE = "suas_apply_visitor";

const DB_PATH =
  process.env.APPLY_CLICK_DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/apply-clicks.db"
    : path.join(process.cwd(), "data", "apply-clicks.db"));

// Never store arbitrary request headers. They may contain tokens, credentials,
// or sensitive data provided by a browser extension or upstream service.
const SAFE_HEADERS = new Set([
  "accept",
  "accept-language",
  "dnt",
  "sec-gpc",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "user-agent",
]);

function cleanText(value: string | null, maxLength = 2_048): string | null {
  if (!value) return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function cleanSource(value: string | null): string {
  return (
    value
      ?.trim()
      .replace(/[^a-zA-Z0-9 _.:/()@+-]/g, "")
      .slice(0, 160) || "unknown"
  );
}

function safeHeaders(headers: Headers): string {
  const values: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    const lowerName = name.toLowerCase();
    if (!SAFE_HEADERS.has(lowerName)) continue;
    values[lowerName] = value.slice(0, 512);
  }
  return JSON.stringify(values);
}

function validVisitorId(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function requestIp(request: NextRequest): string | null {
  return cleanText(
    request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    128,
  );
}

function cloudflareColo(ray: string | null): string | null {
  if (!ray) return null;
  const dash = ray.lastIndexOf("-");
  return dash >= 0 ? ray.slice(dash + 1, dash + 16) : null;
}

function knownBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /bot|crawler|spider|slurp|preview|facebookexternalhit|bingpreview|headless/i.test(
    userAgent,
  );
}

function getDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS apply_clicks (
      click_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL,
      target_url TEXT NOT NULL,
      request_url TEXT NOT NULL,
      ip TEXT,
      ip_user_agent_hash TEXT,
      user_agent TEXT,
      referer TEXT,
      host TEXT,
      forwarded_proto TEXT,
      cf_country TEXT,
      cf_ray TEXT,
      cf_colo TEXT,
      cf_visitor TEXT,
      accept TEXT,
      accept_language TEXT,
      sec_ch_ua TEXT,
      sec_ch_ua_mobile TEXT,
      sec_ch_ua_platform TEXT,
      sec_fetch_site TEXT,
      sec_fetch_mode TEXT,
      sec_fetch_dest TEXT,
      dnt TEXT,
      global_privacy_control TEXT,
      priority TEXT,
      likely_browser_navigation INTEGER NOT NULL,
      known_bot INTEGER NOT NULL,
      first_click_for_visitor INTEGER NOT NULL,
      headers_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apply_clicks_created_at
      ON apply_clicks(created_at);
    CREATE INDEX IF NOT EXISTS idx_apply_clicks_visitor_id
      ON apply_clicks(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_apply_clicks_source
      ON apply_clicks(source);
  `);
  // Limit stored visitor data and disk usage. The existing database stays
  // private in the Pi's /analytics volume, not in the public source repo.
  db.prepare("DELETE FROM apply_clicks WHERE created_at < ?").run(
    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const count = db.prepare("SELECT COUNT(*) AS n FROM apply_clicks").get() as {
    n: number;
  };
  if (count.n > 50000) {
    db.prepare(`
      DELETE FROM apply_clicks WHERE click_id IN (
        SELECT click_id FROM apply_clicks ORDER BY created_at ASC LIMIT ?
      )
    `).run(count.n - 50000);
  }
  return db;
}

export type ApplyClickRecord = {
  clickId: string;
  visitorId: string;
  isNewVisitor: boolean;
};

export function recordApplyClick(
  request: NextRequest,
  sourceValue: string | null,
): ApplyClickRecord {
  const clickId = randomUUID();
  const existingVisitorId =
    request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value ||
    request.cookies.get(APPLY_VISITOR_COOKIE)?.value;
  const visitorId = validVisitorId(existingVisitorId)
    ? existingVisitorId
    : randomUUID();
  const source = cleanSource(sourceValue);
  const ip = requestIp(request);
  const userAgent = cleanText(request.headers.get("user-agent"), 4_096);
  const cfRay = cleanText(request.headers.get("cf-ray"), 256);
  const secFetchMode = cleanText(request.headers.get("sec-fetch-mode"), 64);
  const secFetchDest = cleanText(request.headers.get("sec-fetch-dest"), 64);
  const isKnownBot = knownBot(userAgent);
  const likelyBrowserNavigation =
    !isKnownBot &&
    secFetchMode === "navigate" &&
    (secFetchDest === "document" || secFetchDest === null);
  const ipUserAgentHash =
    ip || userAgent
      ? createHash("sha256")
          .update(`${ip ?? ""}\n${userAgent ?? ""}`)
          .digest("hex")
      : null;

  const db = getDb();
  try {
    const prior = db
      .prepare("SELECT 1 FROM apply_clicks WHERE visitor_id = ? LIMIT 1")
      .get(visitorId);
    const firstClickForVisitor = prior ? 0 : 1;

    db.prepare(`
      INSERT INTO apply_clicks (
        click_id, visitor_id, created_at, source, target_url, request_url,
        ip, ip_user_agent_hash, user_agent, referer, host, forwarded_proto,
        cf_country, cf_ray, cf_colo, cf_visitor, accept, accept_language,
        sec_ch_ua, sec_ch_ua_mobile, sec_ch_ua_platform, sec_fetch_site,
        sec_fetch_mode, sec_fetch_dest, dnt, global_privacy_control, priority,
        likely_browser_navigation, known_bot, first_click_for_visitor,
        headers_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      clickId,
      visitorId,
      new Date().toISOString(),
      source,
      APPLICATION_FORM_URL,
      request.nextUrl.toString().slice(0, 4_096),
      ip,
      ipUserAgentHash,
      userAgent,
      cleanText(request.headers.get("referer"), 4_096),
      cleanText(request.headers.get("host"), 512),
      cleanText(request.headers.get("x-forwarded-proto"), 64),
      cleanText(request.headers.get("cf-ipcountry"), 64),
      cfRay,
      cloudflareColo(cfRay),
      cleanText(request.headers.get("cf-visitor"), 512),
      cleanText(request.headers.get("accept"), 2_048),
      cleanText(request.headers.get("accept-language"), 1_024),
      cleanText(request.headers.get("sec-ch-ua"), 2_048),
      cleanText(request.headers.get("sec-ch-ua-mobile"), 64),
      cleanText(request.headers.get("sec-ch-ua-platform"), 256),
      cleanText(request.headers.get("sec-fetch-site"), 64),
      secFetchMode,
      secFetchDest,
      cleanText(request.headers.get("dnt"), 16),
      cleanText(request.headers.get("sec-gpc"), 16),
      cleanText(request.headers.get("priority"), 128),
      likelyBrowserNavigation ? 1 : 0,
      isKnownBot ? 1 : 0,
      firstClickForVisitor,
      safeHeaders(request.headers),
    );

    return {
      clickId,
      visitorId,
      isNewVisitor: firstClickForVisitor === 1,
    };
  } finally {
    db.close();
  }
}
