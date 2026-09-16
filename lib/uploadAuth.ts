import Database from "better-sqlite3";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

const COOKIE = "upload_auth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DB_PATH = process.env.UPLOAD_AUTH_DB ||
  (process.env.NODE_ENV === "production" && existsSync("/home/pi/suas-site-dev/data")
    ? "/home/pi/suas-site-dev/data/upload-users.db"
    : path.join(process.cwd(), "data", "upload-users.db"));

export type User = { id: string; name: string };
export type UploadRequest = { id: string; name: string; requestedAt: string };

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      passcode_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      reviewed_at TEXT
    )
  `);
  const columns = db.prepare("PRAGMA table_info(upload_users)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "status")) db.exec("ALTER TABLE upload_users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  if (!columns.some((column) => column.name === "reviewed_at")) db.exec("ALTER TABLE upload_users ADD COLUMN reviewed_at TEXT");
  return db;
}

function passcodeHash(passcode: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(passcode, salt, 64).toString("hex")}`;
}

function matchesPasscode(passcode: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(passcode, salt, 64);
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function secret() {
  return process.env.UPLOAD_AUTH_SECRET || process.env.PASSWORD || null;
}

function sessionToken(userId: string, expiresAt: number) {
  const key = secret();
  if (!key) return null;
  const value = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", key).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function userFromToken(token: string | undefined): User | null {
  const key = secret();
  if (!key || !token) return null;
  const [userId, expiresText, signature] = token.split(".");
  const expiresAt = Number(expiresText);
  if (!userId || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac("sha256", key).update(`${userId}.${expiresAt}`).digest("base64url");
  const givenBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (givenBytes.length !== expectedBytes.length || !timingSafeEqual(givenBytes, expectedBytes)) return null;

  const db = openDb();
  try {
    return (db.prepare("SELECT id, name FROM upload_users WHERE id = ? AND status = 'approved'").get(userId) as User | undefined) || null;
  } finally {
    db.close();
  }
}

export async function currentUploadUser() {
  const jar = await cookies();
  return userFromToken(jar.get(COOKIE)?.value);
}

export function publicUser(user: User) {
  return { id: user.id, name: user.name };
}

export function registerUploadUser(nameInput: string, passcode: string): UploadRequest {
  const name = nameInput.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Name must be between 2 and 80 characters");
  if (passcode.length < 6 || passcode.length > 128) throw new Error("Passcode must be between 6 and 128 characters");

  const db = openDb();
  try {
    const request: UploadRequest = { id: randomUUID(), name, requestedAt: new Date().toISOString() };
    db.prepare(`INSERT INTO upload_users (id, name, normalized_name, passcode_hash, created_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`)
      .run(request.id, request.name, name.toLowerCase(), passcodeHash(passcode), request.requestedAt);
    return request;
  } finally {
    db.close();
  }
}

export function loginUploadUser(nameInput: string, passcode: string) {
  const name = nameInput.trim();
  const db = openDb();
  try {
    const row = db.prepare("SELECT id, name, passcode_hash, status FROM upload_users WHERE normalized_name = ?").get(name.toLowerCase()) as (User & { passcode_hash: string; status: string }) | undefined;
    if (!row || !matchesPasscode(passcode, row.passcode_hash)) return null;
    if (row.status !== "approved") return { pending: true as const };
    db.prepare("UPDATE upload_users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    return { id: row.id, name: row.name };
  } finally {
    db.close();
  }
}

export function listPendingUploadRequests(): UploadRequest[] {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT id, name, created_at FROM upload_users WHERE status = 'pending' ORDER BY created_at ASC").all() as Array<{ id: string; name: string; created_at: string }>;
    return rows.map((row) => ({ id: row.id, name: row.name, requestedAt: row.created_at }));
  } finally {
    db.close();
  }
}

export function reviewUploadRequest(id: string, action: "approve" | "deny") {
  const db = openDb();
  try {
    if (action === "approve") {
      return db.prepare("UPDATE upload_users SET status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'").run(new Date().toISOString(), id).changes > 0;
    }
    return db.prepare("DELETE FROM upload_users WHERE id = ? AND status = 'pending'").run(id).changes > 0;
  } finally {
    db.close();
  }
}

export function setUploadSession(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = sessionToken(userId, expiresAt);
  if (!token) throw new Error("Upload login is not configured");
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearUploadSession(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }) {
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export { COOKIE };
