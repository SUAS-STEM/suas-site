import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { authDbPath } from "@/lib/authCore";

const DEFAULT_LEASE_SECONDS = 30 * 60;
const MIN_LEASE_SECONDS = 5 * 60;
const MAX_LEASE_SECONDS = 2 * 60 * 60;

export type MissionPlannerLease = {
  principalId: string;
  principalName: string;
  clientIp: string;
  createdAt: string;
  expiresAt: string;
  lastConnectedAt: string | null;
  connectionCount: number;
};

function leaseSeconds() {
  const configured = Number(process.env.SITL_WS_LEASE_SECONDS || DEFAULT_LEASE_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_LEASE_SECONDS;
  return Math.max(MIN_LEASE_SECONDS, Math.min(MAX_LEASE_SECONDS, Math.floor(configured)));
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function openDb() {
  const db = new Database(authDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sitl_ws_leases (
      principal_id TEXT PRIMARY KEY,
      principal_name TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      last_connected_at TEXT,
      connection_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sitl_ws_leases_token
      ON sitl_ws_leases(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sitl_ws_leases_ip_expiry
      ON sitl_ws_leases(client_ip, expires_at);
  `);
  return db;
}

function mapLease(row: Record<string, unknown> | undefined): MissionPlannerLease | null {
  if (!row) return null;
  return {
    principalId: String(row.principal_id),
    principalName: String(row.principal_name),
    clientIp: String(row.client_ip),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    lastConnectedAt: row.last_connected_at ? String(row.last_connected_at) : null,
    connectionCount: Number(row.connection_count || 0),
  };
}

export function createMissionPlannerAccess(principal: { id: string; name: string }, clientIp: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + leaseSeconds() * 1000).toISOString();
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO sitl_ws_leases
        (principal_id, principal_name, client_ip, token_hash, created_at, expires_at, revoked_at, last_connected_at, connection_count)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0)
      ON CONFLICT(principal_id) DO UPDATE SET
        principal_name = excluded.principal_name,
        client_ip = excluded.client_ip,
        token_hash = excluded.token_hash,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        revoked_at = NULL,
        last_connected_at = NULL,
        connection_count = 0
    `).run(principal.id, principal.name, clientIp, hashToken(token), createdAt, expiresAt);
    return { token, lease: getMissionPlannerAccess(principal.id) };
  } finally {
    db.close();
  }
}

export function getMissionPlannerAccess(principalId: string) {
  const db = openDb();
  try {
    const row = db.prepare(`
      SELECT * FROM sitl_ws_leases
      WHERE principal_id = ? AND revoked_at IS NULL AND expires_at > ?
    `).get(principalId, new Date().toISOString()) as Record<string, unknown> | undefined;
    return mapLease(row);
  } finally {
    db.close();
  }
}

export function revokeMissionPlannerAccess(principalId: string) {
  const db = openDb();
  try {
    return db.prepare(`
      UPDATE sitl_ws_leases SET revoked_at = ?
      WHERE principal_id = ? AND revoked_at IS NULL
    `).run(new Date().toISOString(), principalId).changes > 0;
  } finally {
    db.close();
  }
}

export function missionPlannerAccessConfig() {
  const origin = (process.env.SITL_PUBLIC_ORIGIN || "https://dev.suasstem.org").replace(/\/$/, "");
  const websocketOrigin = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return {
    websocketOrigin,
    leaseSeconds: leaseSeconds(),
  };
}
