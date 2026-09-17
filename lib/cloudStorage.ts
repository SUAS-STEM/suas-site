import { execFile, spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { updateCloudStatus, type FileRecord } from "@/lib/fileRecords";

const execFileAsync = promisify(execFile);
const GIB = 1024 * 1024 * 1024;
let cachedStatus: { expiresAt: number; value: StorageStatus } | null = null;
let reservedUploadBytes = 0;

export type StorageStatus = {
  cloud: {
    configured: boolean;
    provider: string;
    used: number | null;
    limit: number | null;
    remaining: number | null;
    message: string | null;
  };
};

/**
 * Reserve quota in this process before starting an upload. The cloud status
 * check is cached, so without a reservation two simultaneous requests could
 * both see the same remaining space and exceed the app's configured quota.
 */
export function reserveCloudUpload(bytes: number, remaining: number | null) {
  if (!Number.isFinite(bytes) || bytes < 0 || (remaining != null && remaining - reservedUploadBytes < bytes)) return false;
  reservedUploadBytes += bytes;
  return true;
}

export function releaseCloudUpload(bytes: number) {
  reservedUploadBytes = Math.max(0, reservedUploadBytes - Math.max(0, bytes));
}

export function cloudProviderName() {
  return process.env.CLOUD_PROVIDER?.trim() || "TeraBox";
}

function remoteName() {
  return process.env.CLOUD_RCLONE_REMOTE?.trim()
    || process.env.TERABOX_RCLONE_REMOTE?.trim()
    || process.env.CLOUD_REMOTE?.trim()
    || process.env.TERABOX_REMOTE?.trim()
    || "";
}

function remoteRoot() {
  return (process.env.CLOUD_REMOTE_ROOT || process.env.TERABOX_REMOTE_ROOT || "cloud").replace(/^\/+|\/+$/g, "");
}

function remotePath(record: Pick<FileRecord, "category" | "name">) {
  return `${remoteName()}:${remoteRoot()}/${record.category}/${record.name}`;
}

function configuredCloudLimitBytes() {
  const gib = Number(process.env.CLOUD_LIMIT_GIB || process.env.TERABOX_CLOUD_LIMIT_GIB || 0);
  return Number.isFinite(gib) && gib > 0 ? Math.floor(gib * GIB) : null;
}

async function rcloneJson(args: string[]) {
  const result = await execFileAsync("rclone", args, { maxBuffer: 1024 * 1024, timeout: 30_000 });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;
  const name = remoteName();
  const limitFromConfig = configuredCloudLimitBytes();
  const provider = cloudProviderName();
  if (!name) {
    const value = { cloud: { configured: false, provider, used: null, limit: limitFromConfig, remaining: null, message: `${provider} is not configured on the server. No local fallback is used.` } };
    cachedStatus = { expiresAt: Date.now() + 10_000, value };
    return value;
  }
  try {
    let info: Record<string, unknown> = {};
    try { info = await rcloneJson(["about", "--json", `${name}:${remoteRoot()}`]); } catch { /* Some backends do not implement about. */ }
    const size = await rcloneJson(["size", "--json", `${name}:${remoteRoot()}`]);
    const used = typeof info.used === "number" ? info.used : (typeof size.bytes === "number" ? size.bytes : null);
    const total = typeof info.total === "number" ? info.total : limitFromConfig;
    const free = typeof info.free === "number" ? info.free : (used != null && total != null ? Math.max(total - used, 0) : null);
    const value = { cloud: { configured: true as const, provider, used, limit: total, remaining: free, message: total == null ? "Set CLOUD_LIMIT_GIB to show the remaining quota." : null } };
    cachedStatus = { expiresAt: Date.now() + 10_000, value };
    return value;
  } catch (cause) {
    const value = { cloud: { configured: false as const, provider, used: null, limit: limitFromConfig, remaining: null, message: cause instanceof Error ? `${provider} status unavailable: ${cause.message}` : `${provider} status unavailable.` } };
    cachedStatus = { expiresAt: Date.now() + 5_000, value };
    return value;
  }
}

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<{ code: number | null; error: Error | null }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code, error: null }));
  });
}

export async function syncStreamToCloud(record: FileRecord, webStream: import("node:stream/web").ReadableStream, expectedSize: number) {
  return (await syncStreamToCloudWithHash(record, webStream, expectedSize)).status;
}

export async function syncStreamToCloudWithHash(record: FileRecord, webStream: import("node:stream/web").ReadableStream, expectedSize: number) {
  const name = remoteName();
  if (!name) {
    updateCloudStatus(record.name, "not_configured");
    return { status: "not_configured" as const, sha256: null };
  }
  const destination = remotePath(record);
  let child: ReturnType<typeof spawn> | null = null;
  try {
    await execFileAsync("rclone", ["mkdir", `${name}:${remoteRoot()}/${record.category}`], { timeout: 30_000 });
    child = spawn("rclone", ["rcat", destination, "--retries", "3", "--low-level-retries", "10"], { stdio: ["pipe", "pipe", "pipe"] });
    const stdin = child.stdin;
    if (!stdin) throw new Error(`${cloudProviderName()} upload process did not open stdin.`);
    const stderr: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exit = waitForExit(child);
    const hash = createHash("sha256");
    const hashingStream = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(webStream), hashingStream, stdin);
    const result = await exit;
    if (result.error) throw result.error;
    if (result.code !== 0) throw new Error(Buffer.concat(stderr).toString("utf8").trim() || `rclone exited with code ${result.code}`);
    const info = await rcloneJson(["size", "--json", destination]);
    if (Number(info.bytes) !== expectedSize) throw new Error(`${cloudProviderName()} size did not match the upload.`);
    updateCloudStatus(record.name, "uploaded");
    cachedStatus = null;
    return { status: "uploaded" as const, sha256: hash.digest("hex") };
  } catch (cause) {
    child?.kill();
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "Cloud upload failed.";
    updateCloudStatus(record.name, "failed", message);
    return { status: "failed" as const, sha256: null };
  }
}

export async function deleteFileFromCloud(record: Pick<FileRecord, "category" | "name">) {
  if (!remoteName()) return false;
  try {
    await execFileAsync("rclone", ["deletefile", remotePath(record), "--retries", "3", "--low-level-retries", "10"], { timeout: 30_000 });
    cachedStatus = null;
    return true;
  } catch {
    return false;
  }
}

export function streamFileFromCloud(record: Pick<FileRecord, "category" | "name">) {
  if (!remoteName()) return null;
  const child = spawn("rclone", ["cat", remotePath(record), "--retries", "3", "--low-level-retries", "10"], { stdio: ["ignore", "pipe", "pipe"] });
  return child.stdout ? { remoteStream: child.stdout } : null;
}
