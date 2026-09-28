import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DEV_ACCESS_DB ||
  (process.env.NODE_ENV === "production" && existsSync("/home/pi/suas-site-dev/data")
    ? "/home/pi/suas-site-dev/data/dev-access.db"
    : path.join(process.cwd(), "data", "dev-access.db"));

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_IDLE_TIMEOUT = 60 * 60 * 24 * 14;
const MAX_PENDING_USERS = 500;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  status: "pending" | "approved" | "denied";
  role: "member" | "admin";
  createdAt: string;
  reviewedAt: string | null;
};

type UserRow = Record<string, unknown>;

function openDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS trusted_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_trusted_sessions_token ON trusted_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_trusted_sessions_user ON trusted_sessions(user_id);
  `);
  return db;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    status: row.status === "approved" || row.status === "denied" ? row.status : "pending",
    role: row.role === "admin" ? "admin" : "member",
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function hashPassword(password: string, salt = randomBytes(16)) {
  const digest = scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string) {
  const [, saltText, digestText] = encoded.split("$");
  if (!saltText || !digestText) return false;
  try {
    const expected = Buffer.from(digestText, "base64url");
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.PASSWORD;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

export function signAccessCookie(user: AuthUser, expiresAt = Date.now() + SESSION_MAX_AGE * 1000) {
  const payload = Buffer.from(JSON.stringify({ v: 2, uid: user.id, role: user.role, exp: expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAccessCookie(value: string | undefined) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; uid?: string; role?: string; exp?: number };
    return parsed.v === 2 && parsed.uid && parsed.exp && parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function ensureBootstrapAdmin(db: Database.Database) {
  if (!process.env.PASSWORD) return;
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (count.count !== 0) return;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, display_name, password_hash, status, role, created_at, reviewed_at) VALUES (?, ?, ?, ?, 'approved', 'admin', ?, ?)")
    .run(randomUUID(), "admin", "Administrator", hashPassword(process.env.PASSWORD), now, now);
}

function getUserById(db: Database.Database, id: string) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function registerUser(usernameInput: string, password: string, displayName: string) {
  const username = normalizeUsername(usernameInput);
  if (!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(username)) throw new Error("Username must be 3-48 characters using letters, numbers, . _ or -");
  if (password.length < 10 || password.length > 256) throw new Error("Password must be 10-256 characters");
  const name = displayName.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Display name must be 2-80 characters");
  const db = openDb();
  try {
    ensureBootstrapAdmin(db);
    const pending = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'pending'").get() as { count: number };
    if (pending.count >= MAX_PENDING_USERS) throw new Error("The access queue is full; ask an administrator to review existing requests first");
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, username, name, hashPassword(password), now);
    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("UNIQUE constraint failed")) throw new Error("That username is already registered");
    throw cause;
  } finally {
    db.close();
  }
}

export function loginUser(usernameInput: string, password: string, deviceId: string, userAgent: string) {
  const username = normalizeUsername(usernameInput);
  const db = openDb();
  try {
    ensureBootstrapAdmin(db);
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
    if (!row || !verifyPassword(password, String(row.password_hash))) return { kind: "invalid" as const };
    const user = mapUser(row);
    if (user.status !== "approved") return { kind: user.status as "pending" | "denied", user };
    const token = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO trusted_sessions (id, user_id, token_hash, device_id, user_agent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), user.id, tokenHash(token), deviceId, userAgent.slice(0, 500), now, now);
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);
    return { kind: "approved" as const, user, token };
  } finally {
    db.close();
  }
}

export function userFromSessionToken(token: string | undefined) {
  if (!token) return null;
  const db = openDb();
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_IDLE_TIMEOUT * 1000).toISOString();
    const row = db.prepare("SELECT u.*, s.id AS session_id FROM trusted_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.last_seen_at > ?")
      .get(tokenHash(token), cutoff) as UserRow | undefined;
    if (!row) return null;
    const user = mapUser(row);
    if (user.status !== "approved") return null;
    db.prepare("UPDATE trusted_sessions SET last_seen_at = ? WHERE id = ?").run(now.toISOString(), String(row.session_id));
    return user;
  } finally {
    db.close();
  }
}

export function listUsers() {
  const db = openDb();
  try {
    ensureBootstrapAdmin(db);
    return (db.prepare("SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at ASC").all() as UserRow[]).map(mapUser);
  } finally {
    db.close();
  }
}

export function reviewUser(id: string, action: "approve" | "deny" | "revoke" | "make_admin") {
  const db = openDb();
  try {
    const row = db.prepare("SELECT status, role FROM users WHERE id = ?").get(id) as { status?: string; role?: string } | undefined;
    if (!row) return false;
    if (action === "make_admin") return db.prepare("UPDATE users SET role = 'admin' WHERE id = ? AND status = 'approved'").run(id).changes > 0;
    if (action === "approve") return db.prepare("UPDATE users SET status = 'approved', reviewed_at = ? WHERE id = ?").run(new Date().toISOString(), id).changes > 0;
    if (action === "deny") return db.prepare("UPDATE users SET status = 'denied', reviewed_at = ? WHERE id = ? AND role != 'admin'").run(new Date().toISOString(), id).changes > 0;
    if (row.role === "admin") return false;
    const now = new Date().toISOString();
    db.prepare("UPDATE users SET status = 'denied', reviewed_at = ? WHERE id = ?").run(now, id);
    db.prepare("UPDATE trusted_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, id);
    return true;
  } finally {
    db.close();
  }
}

export function sessionCookies(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, token: string, user: AuthUser) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
  response.cookies.set("suas_session", token, options);
  response.cookies.set("suas_auth", signAccessCookie(user), options);
}

export function clearSessionCookies(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }) {
  for (const name of ["suas_session", "suas_auth", "dev_auth", "dev_device", "dev_admin"]) response.cookies.set(name, "", { path: "/", maxAge: 0 });
}

export function authDbPath() {
  return DB_PATH;
}
