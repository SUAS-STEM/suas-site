import Database from "better-sqlite3";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DEV_ACCESS_DB ||
  (process.env.NODE_ENV === "production" && existsSync("/home/pi/suas-site-dev/data")
    ? "/home/pi/suas-site-dev/data/dev-access.db"
    : path.join(process.cwd(), "data", "dev-access.db"));

export type DeviceAccessRequest = {
  id: string;
  deviceId: string;
  name: string;
  userAgent: string;
  requestedAt: string;
  status: "pending" | "approved" | "denied";
  reviewedAt: string | null;
  role: "member" | "admin";
  phrase: string;
};

function openDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_access_requests (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      phrase TEXT NOT NULL DEFAULT ''
    )
  `);
  const columns = db.prepare("PRAGMA table_info(device_access_requests)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "role")) db.exec("ALTER TABLE device_access_requests ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  if (!columns.some((column) => column.name === "phrase")) db.exec("ALTER TABLE device_access_requests ADD COLUMN phrase TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE device_access_requests SET phrase = printf('%06d', abs(random()) % 1000000) WHERE phrase NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'");
  return db;
}

function mapRow(row: Record<string, unknown>): DeviceAccessRequest {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    name: String(row.name),
    userAgent: String(row.user_agent || ""),
    requestedAt: String(row.requested_at),
    status: row.status as DeviceAccessRequest["status"],
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    role: row.role === "admin" ? "admin" : "member",
    phrase: String(row.phrase || ""),
  };
}

function newPhrase() {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

export function requestDeviceAccess(deviceId: string, name: string, userAgent: string) {
  const db = openDb();
  try {
    const existing = db.prepare("SELECT * FROM device_access_requests WHERE device_id = ?").get(deviceId) as Record<string, unknown> | undefined;
    if (existing) {
      if (existing.status === "approved") return mapRow(existing);
      db.prepare("UPDATE device_access_requests SET name = ?, user_agent = ?, requested_at = ?, status = 'pending', reviewed_at = NULL, phrase = ? WHERE device_id = ?")
        .run(name, userAgent, new Date().toISOString(), newPhrase(), deviceId);
      return mapRow(db.prepare("SELECT * FROM device_access_requests WHERE device_id = ?").get(deviceId) as Record<string, unknown>);
    }
    const request = {
      id: randomUUID(),
      deviceId,
      name,
      userAgent,
      requestedAt: new Date().toISOString(),
      phrase: newPhrase(),
    };
    db.prepare("INSERT INTO device_access_requests (id, device_id, name, user_agent, requested_at, phrase) VALUES (?, ?, ?, ?, ?, ?)")
      .run(request.id, request.deviceId, request.name, request.userAgent, request.requestedAt, request.phrase);
    return { ...request, status: "pending" as const, reviewedAt: null, role: "member" as const };
  } finally {
    db.close();
  }
}

export function getDeviceAccess(deviceId: string) {
  const db = openDb();
  try {
    const row = db.prepare("SELECT * FROM device_access_requests WHERE device_id = ?").get(deviceId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function listPendingDeviceAccessRequests() {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT * FROM device_access_requests WHERE status = 'pending' ORDER BY requested_at ASC").all() as Array<Record<string, unknown>>;
    return rows.map(mapRow);
  } finally {
    db.close();
  }
}

export function listApprovedDeviceAccessRequests() {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT * FROM device_access_requests WHERE status = 'approved' ORDER BY name COLLATE NOCASE ASC, requested_at ASC").all() as Array<Record<string, unknown>>;
    return rows.map(mapRow);
  } finally {
    db.close();
  }
}

export function getDeviceAccessByPhrase(phrase: string) {
  const db = openDb();
  try {
    const row = db.prepare("SELECT * FROM device_access_requests WHERE phrase = ? AND status = 'pending'").get(phrase) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function isPermanentAdmin(deviceId: string) {
  const request = getDeviceAccess(deviceId);
  return request?.status === "approved" && request.role === "admin";
}

export function promoteDevice(id: string) {
  const db = openDb();
  try {
    return db.prepare("UPDATE device_access_requests SET role = 'admin' WHERE id = ? AND status = 'approved' AND role != 'admin'").run(id).changes > 0;
  } finally {
    db.close();
  }
}

export function reviewDeviceAccessRequest(id: string, action: "approve" | "deny" | "kick") {
  const db = openDb();
  try {
    const row = db.prepare("SELECT status, role FROM device_access_requests WHERE id = ?").get(id) as { status?: string; role?: string } | undefined;
    if (!row) return false;
    if (action === "approve") {
      return db.prepare("UPDATE device_access_requests SET status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'")
        .run(new Date().toISOString(), id).changes > 0;
    }
    if (action === "kick" && row.role === "admin") return false;
    const status = action === "deny" ? "pending" : "approved";
    return db.prepare("UPDATE device_access_requests SET status = 'denied', reviewed_at = ? WHERE id = ? AND status = ?")
      .run(new Date().toISOString(), id, status).changes > 0;
  } finally {
    db.close();
  }
}
