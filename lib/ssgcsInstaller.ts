import {
    createHash,
    createPublicKey,
    randomBytes,
    randomUUID,
    verify as verifySignature,
} from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { authDbPath, type AuthUser } from "@/lib/authCore";

const REQUEST_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const REQUEST_CLOCK_SKEW_SECONDS = 90;
const RELEASE_ROOT = process.env.SSGCS_RELEASE_ROOT || "/home/pi/ssgcs-private/releases";
const CHANNELS = new Set(["development", "production"]);
const INSTALL_HOST = "dev.suasstem.org";

type RequestRow = Record<string, unknown>;
type SessionRow = Record<string, unknown>;

function openDb() {
    const db = new Database(authDbPath());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(`
    CREATE TABLE IF NOT EXISTS ssgcs_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key_spki TEXT NOT NULL,
      hardware_id_hash TEXT NOT NULL,
      machine_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      UNIQUE(user_id, hardware_id_hash),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ssgcs_install_requests (
      id TEXT PRIMARY KEY,
      poll_token_hash TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      public_key_spki TEXT NOT NULL,
      hardware_id_hash TEXT NOT NULL,
      machine_name TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL,
      user_id TEXT,
      challenge TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      authorized_at TEXT,
      consumed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ssgcs_install_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (device_id) REFERENCES ssgcs_devices(id)
    );
    CREATE TABLE IF NOT EXISTS ssgcs_request_nonces (
      session_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      used_at TEXT NOT NULL,
      PRIMARY KEY (session_id, nonce),
      FOREIGN KEY (session_id) REFERENCES ssgcs_install_sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ssgcs_install_requests_poll ON ssgcs_install_requests(poll_token_hash);
    CREATE INDEX IF NOT EXISTS idx_ssgcs_install_sessions_token ON ssgcs_install_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_ssgcs_devices_user ON ssgcs_devices(user_id);
  `);
    return db;
}

function hash(value: string | Buffer) {
    return createHash("sha256").update(value).digest("hex");
}

function normalizeHardwareHash(value: unknown) {
    const text = String(value || "").toLowerCase();
    return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function normalizeMachineName(value: unknown) {
    return String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 120);
}

function parsePublicKey(value: unknown) {
    const encoded = String(value || "");
    if (!/^[A-Za-z0-9_-]{80,2048}$/.test(encoded)) return null;
    try {
        const der = Buffer.from(encoded, "base64url");
        const key = createPublicKey({ key: der, format: "der", type: "spki" });
        if (key.asymmetricKeyType !== "ec") return null;
        const details = key.asymmetricKeyDetails as { namedCurve?: string } | undefined;
        if (details?.namedCurve !== "prime256v1") return null;
        return { encoded: der.toString("base64url"), key, deviceId: hash(der) };
    } catch {
        return null;
    }
}

function parsePublicCoordinates(xValue: unknown, yValue: unknown) {
    const x = String(xValue || "");
    const y = String(yValue || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(x) || !/^[A-Za-z0-9_-]{43}$/.test(y)) return null;
    try {
        const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x, y }, format: "jwk" });
        const der = key.export({ type: "spki", format: "der" }) as Buffer;
        return { encoded: der.toString("base64url"), key, deviceId: hash(der) };
    } catch {
        return null;
    }
}

function cleanup(db: Database.Database) {
    const now = new Date().toISOString();
    const nonceCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM ssgcs_request_nonces WHERE used_at < ?").run(nonceCutoff);
    db.prepare("DELETE FROM ssgcs_install_requests WHERE expires_at < ? AND created_at < ?").run(
        now,
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
    db.prepare("DELETE FROM ssgcs_install_sessions WHERE expires_at < ? AND created_at < ?").run(
        now,
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
}

export function isInstallerHost(hostHeader: string | null) {
    const host = (hostHeader || "").trim().toLowerCase().replace(/:\d+$/, "");
    if (host === INSTALL_HOST) return true;
    return process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
}

export function startInstallRequest(input: Record<string, unknown>) {
    const publicKey =
        parsePublicCoordinates(input.publicKeyX, input.publicKeyY) ??
        parsePublicKey(input.publicKeySpki);
    const hardwareIdHash = normalizeHardwareHash(input.hardwareIdHash);
    if (!publicKey) throw new Error("A valid P-256 SPKI device public key is required");
    if (!hardwareIdHash) throw new Error("hardwareIdHash must be a SHA-256 hex digest");

    const id = randomUUID();
    const pollToken = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + REQUEST_TTL_MS);
    const db = openDb();
    try {
        cleanup(db);
        db.prepare(
            `
      INSERT INTO ssgcs_install_requests
        (id, poll_token_hash, device_id, public_key_spki, hardware_id_hash, machine_name, state, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `,
        ).run(
            id,
            hash(pollToken),
            publicKey.deviceId,
            publicKey.encoded,
            hardwareIdHash,
            normalizeMachineName(input.machineName),
            createdAt.toISOString(),
            expiresAt.toISOString(),
        );
    } finally {
        db.close();
    }
    return { id, pollToken, expiresAt: expiresAt.toISOString() };
}

function requestById(db: Database.Database, id: string) {
    return db.prepare("SELECT * FROM ssgcs_install_requests WHERE id = ?").get(id) as
        RequestRow | undefined;
}

function validPendingRequest(row: RequestRow | undefined) {
    return Boolean(row && String(row.expires_at) > new Date().toISOString() && !row.consumed_at);
}

export function installRequestForBrowser(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const db = openDb();
    try {
        const row = requestById(db, id);
        if (!validPendingRequest(row)) return null;
        return {
            id: String(row!.id),
            deviceId: String(row!.device_id),
            machineName: String(row!.machine_name || "This computer"),
            state: String(row!.state),
            expiresAt: String(row!.expires_at),
        };
    } finally {
        db.close();
    }
}

export function authorizeInstallRequest(id: string, user: AuthUser) {
    const db = openDb();
    try {
        const row = requestById(db, id);
        if (!validPendingRequest(row) || row!.state !== "pending")
            throw new Error("Install request is expired or unavailable");
        const deviceId = String(row!.device_id);
        const hardwareIdHash = String(row!.hardware_id_hash);
        const existing = db.prepare("SELECT * FROM ssgcs_devices WHERE id = ?").get(deviceId) as
            RequestRow | undefined;
        if (existing) {
            if (existing.revoked_at) throw new Error("This machine has been revoked");
            if (String(existing.user_id) !== user.id)
                throw new Error("This machine is enrolled to another account");
            if (String(existing.hardware_id_hash) !== hardwareIdHash)
                throw new Error(
                    "This machine's hardware identity changed; re-enrollment is required",
                );
            if (String(existing.public_key_spki) !== String(row!.public_key_spki))
                throw new Error("Device key mismatch");
        } else {
            const duplicateHardware = db
                .prepare(
                    "SELECT id FROM ssgcs_devices WHERE user_id = ? AND hardware_id_hash = ? AND revoked_at IS NULL",
                )
                .get(user.id, hardwareIdHash) as { id?: string } | undefined;
            if (duplicateHardware && duplicateHardware.id !== deviceId)
                throw new Error(
                    "This hardware identity is already enrolled with another device key",
                );
            const now = new Date().toISOString();
            db.prepare(
                `
        INSERT INTO ssgcs_devices (id, user_id, public_key_spki, hardware_id_hash, machine_name, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
            ).run(
                deviceId,
                user.id,
                String(row!.public_key_spki),
                hardwareIdHash,
                String(row!.machine_name || ""),
                now,
                now,
            );
        }
        const challenge = randomBytes(32).toString("base64url");
        const now = new Date().toISOString();
        db.prepare(
            "UPDATE ssgcs_install_requests SET state = 'authorized', user_id = ?, challenge = ?, authorized_at = ? WHERE id = ?",
        ).run(user.id, challenge, now, id);
        return { deviceId };
    } finally {
        db.close();
    }
}

export function pollInstallRequest(id: string, pollToken: string) {
    if (!pollToken || pollToken.length > 256) return null;
    const db = openDb();
    try {
        const row = db
            .prepare("SELECT * FROM ssgcs_install_requests WHERE id = ? AND poll_token_hash = ?")
            .get(id, hash(pollToken)) as RequestRow | undefined;
        if (!validPendingRequest(row)) return { state: "expired" as const };
        const state = String(row!.state);
        if (state === "authorized")
            return {
                state: "authorized" as const,
                challenge: String(row!.challenge),
                deviceId: String(row!.device_id),
            };
        return { state: state === "pending" ? ("pending" as const) : ("unavailable" as const) };
    } finally {
        db.close();
    }
}

function installProofMessage(row: RequestRow) {
    return [
        "SSGCS-INSTALL-V1",
        String(row.id),
        String(row.challenge),
        String(row.hardware_id_hash),
    ].join("\n");
}

function verifyDeviceSignature(publicKeySpki: string, message: string, signature: string) {
    try {
        const key = parsePublicKey(publicKeySpki);
        if (!key || !/^[A-Za-z0-9_-]{8,1024}$/.test(signature)) return false;
        const signatureBytes = Buffer.from(signature, "base64url");
        return verifySignature(
            "sha256",
            Buffer.from(message, "utf8"),
            { key: key.key, dsaEncoding: signatureBytes.length === 64 ? "ieee-p1363" : "der" },
            signatureBytes,
        );
    } catch {
        return false;
    }
}

export function exchangeInstallRequest(id: string, pollToken: string, signature: string) {
    const db = openDb();
    try {
        const row = db
            .prepare("SELECT * FROM ssgcs_install_requests WHERE id = ? AND poll_token_hash = ?")
            .get(id, hash(pollToken)) as RequestRow | undefined;
        if (
            !validPendingRequest(row) ||
            row!.state !== "authorized" ||
            !row!.challenge ||
            !row!.user_id
        )
            return null;
        if (
            !verifyDeviceSignature(
                String(row!.public_key_spki),
                installProofMessage(row!),
                signature,
            )
        )
            return null;
        const device = db
            .prepare(
                "SELECT * FROM ssgcs_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            )
            .get(String(row!.device_id), String(row!.user_id)) as RequestRow | undefined;
        if (!device || String(device.hardware_id_hash) !== String(row!.hardware_id_hash))
            return null;

        const token = randomBytes(32).toString("base64url");
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
        const sessionId = randomUUID();
        const transaction = db.transaction(() => {
            const claimed = db
                .prepare(
                    "UPDATE ssgcs_install_requests SET state = 'consumed', consumed_at = ? WHERE id = ? AND state = 'authorized' AND consumed_at IS NULL",
                )
                .run(now.toISOString(), id);
            if (claimed.changes !== 1) throw new Error("Install request was already consumed");
            db.prepare(
                `
        INSERT INTO ssgcs_install_sessions (id, token_hash, user_id, device_id, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
            ).run(
                sessionId,
                hash(token),
                String(row!.user_id),
                String(row!.device_id),
                now.toISOString(),
                expiresAt.toISOString(),
                now.toISOString(),
            );
            db.prepare("UPDATE ssgcs_devices SET last_seen_at = ? WHERE id = ?").run(
                now.toISOString(),
                String(row!.device_id),
            );
        });
        try {
            transaction();
        } catch {
            return null;
        }
        return { token, deviceId: String(row!.device_id), expiresAt: expiresAt.toISOString() };
    } finally {
        db.close();
    }
}

function requestProofMessage(
    method: string,
    target: string,
    timestamp: string,
    nonce: string,
    token: string,
) {
    return ["SSGCS-REQUEST-V1", method.toUpperCase(), target, timestamp, nonce, hash(token)].join(
        "\n",
    );
}

export function authorizeInstallerRequest(input: {
    token: string;
    method: string;
    target: string;
    timestamp: string;
    nonce: string;
    signature: string;
}) {
    if (!input.token || input.token.length > 256) return null;
    if (!/^[0-9]{10,13}$/.test(input.timestamp)) return null;
    const timestamp = Number(input.timestamp);
    const epochSeconds = timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
    if (Math.abs(Math.floor(Date.now() / 1000) - epochSeconds) > REQUEST_CLOCK_SKEW_SECONDS)
        return null;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)) return null;

    const db = openDb();
    try {
        cleanup(db);
        const row = db
            .prepare(
                `
      SELECT s.*, d.public_key_spki, d.hardware_id_hash, d.revoked_at AS device_revoked, u.status AS user_status
      FROM ssgcs_install_sessions s
      JOIN ssgcs_devices d ON d.id = s.device_id
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL
    `,
            )
            .get(hash(input.token)) as SessionRow | undefined;
        if (
            !row ||
            String(row.expires_at) <= new Date().toISOString() ||
            row.device_revoked ||
            row.user_status !== "approved"
        )
            return null;
        const message = requestProofMessage(
            input.method,
            input.target,
            input.timestamp,
            input.nonce,
            input.token,
        );
        if (!verifyDeviceSignature(String(row.public_key_spki), message, input.signature))
            return null;
        try {
            db.prepare(
                "INSERT INTO ssgcs_request_nonces (session_id, nonce, used_at) VALUES (?, ?, ?)",
            ).run(String(row.id), input.nonce, new Date().toISOString());
        } catch (cause) {
            if (cause instanceof Error && cause.message.includes("UNIQUE constraint failed"))
                return null;
            throw cause;
        }
        db.prepare("UPDATE ssgcs_install_sessions SET last_seen_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            String(row.id),
        );
        return {
            sessionId: String(row.id),
            userId: String(row.user_id),
            deviceId: String(row.device_id),
            expiresAt: String(row.expires_at),
        };
    } finally {
        db.close();
    }
}

export function installerAuthHeaders(headers: Headers, method: string, target: string) {
    const authorization = headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    return authorizeInstallerRequest({
        token: match[1],
        method,
        target,
        timestamp: headers.get("x-ssgcs-timestamp") || "",
        nonce: headers.get("x-ssgcs-nonce") || "",
        signature: headers.get("x-ssgcs-signature") || "",
    });
}

function safeReleaseSegment(value: string) {
    return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value) ? value : null;
}

export async function currentRelease(channel: string) {
    if (!CHANNELS.has(channel)) return null;
    const currentPath = path.join(RELEASE_ROOT, channel, "current.json");
    try {
        const current = JSON.parse(await readFile(currentPath, "utf8")) as { version?: string };
        const version = safeReleaseSegment(String(current.version || ""));
        if (!version) return null;
        const releaseDir = path.resolve(RELEASE_ROOT, channel, version);
        const root = path.resolve(RELEASE_ROOT) + path.sep;
        if (!releaseDir.startsWith(root)) return null;
        return { channel, version, releaseDir };
    } catch {
        return null;
    }
}

export async function releaseManifest(channel: string) {
    const release = await currentRelease(channel);
    if (!release) return null;
    try {
        const manifestPath = path.join(release.releaseDir, "manifest.json");
        const signaturePath = path.join(release.releaseDir, "manifest.sig");
        const [manifest, signature] = await Promise.all([
            readFile(manifestPath),
            readFile(signaturePath, "utf8"),
        ]);
        return { ...release, manifest, signature: signature.trim() };
    } catch {
        return null;
    }
}

export async function releaseFile(channel: string, version: string, relativePath: string) {
    if (!CHANNELS.has(channel) || !safeReleaseSegment(version)) return null;
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized !== "payload.zip") return null;
    const releaseDir = path.resolve(RELEASE_ROOT, channel, version);
    const root = path.resolve(RELEASE_ROOT) + path.sep;
    if (!releaseDir.startsWith(root)) return null;
    const absolute = path.join(releaseDir, "payload.zip");
    try {
        const info = await stat(absolute);
        if (!info.isFile()) return null;
        return { absolute, size: info.size, name: path.basename(absolute) };
    } catch {
        return null;
    }
}

export function releaseRoot() {
    return RELEASE_ROOT;
}

export function ensureReleaseRoot() {
    if (!existsSync(RELEASE_ROOT)) mkdirSync(RELEASE_ROOT, { recursive: true, mode: 0o700 });
}
