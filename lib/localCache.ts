import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { streamFileFromCloud } from "@/lib/cloudStorage";
import type { FileRecord } from "@/lib/fileRecords";

const GIB = 1024 * 1024 * 1024;
const CACHE_ROOT = process.env.DEV_LOCAL_CACHE_ROOT ||
  (process.env.NODE_ENV === "production" && process.env.DEV_FILE_METADATA_DB
    ? path.join(path.dirname(process.env.DEV_FILE_METADATA_DB), "file-cache")
    : process.env.NODE_ENV === "production"
      ? "/home/pi/suas-site-dev/data/file-cache"
      : path.join(process.cwd(), "data", "file-cache"));

function localLimitBytes() {
  const gib = Number(process.env.CLOUD_LOCAL_CACHE_LIMIT_GIB || 0);
  return Number.isFinite(gib) && gib > 0 ? Math.floor(gib * GIB) : null;
}

function cacheFileName(record: Pick<FileRecord, "category" | "name">) {
  return `${record.category}__${record.name}`;
}

function cachePath(record: Pick<FileRecord, "category" | "name">) {
  return path.join(CACHE_ROOT, cacheFileName(record));
}

async function fileSize(filePath: string) {
  try {
    const value = await stat(filePath);
    return value.isFile() ? value.size : 0;
  } catch {
    return 0;
  }
}

async function cacheEntries() {
  try {
    const entries = await readdir(CACHE_ROOT, { withFileTypes: true });
    const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const fullPath = path.join(CACHE_ROOT, entry.name);
      const info = await stat(fullPath);
      return { path: fullPath, size: info.size, accessedAt: info.atimeMs || info.mtimeMs };
    }));
    return files.sort((a, b) => a.accessedAt - b.accessedAt);
  } catch {
    return [];
  }
}

export async function getLocalCacheStatus() {
  const limit = localLimitBytes();
  const entries = await cacheEntries();
  const used = entries.reduce((sum, entry) => sum + entry.size, 0);
  return {
    enabled: limit != null,
    used,
    limit,
    remaining: limit == null ? null : Math.max(limit - used, 0),
    message: limit == null ? "Set CLOUD_LOCAL_CACHE_LIMIT_GIB to enable Pi caching." : null,
  };
}

export async function isLocallyCached(record: Pick<FileRecord, "category" | "name" | "size">) {
  return (await fileSize(cachePath(record))) === record.size && record.size > 0;
}

export function streamFileFromLocal(record: Pick<FileRecord, "category" | "name">) {
  return createReadStream(cachePath(record));
}

export async function removeLocalCache(record: Pick<FileRecord, "category" | "name">) {
  try { await unlink(cachePath(record)); } catch { /* Already absent. */ }
}

async function makeRoom(bytesNeeded: number, existingBytes: number, existingPath: string) {
  const limit = localLimitBytes();
  if (limit == null || bytesNeeded > limit) return false;
  let status = await getLocalCacheStatus();
  if ((status.used - existingBytes) + bytesNeeded <= limit) return true;
  for (const entry of await cacheEntries()) {
    if ((status.used - existingBytes) + bytesNeeded <= limit) break;
    if (entry.path === existingPath) continue;
    await unlink(entry.path).catch(() => undefined);
    status = await getLocalCacheStatus();
  }
  return (status.used - existingBytes) + bytesNeeded <= limit;
}

export async function cacheFileFromCloud(record: FileRecord) {
  const limit = localLimitBytes();
  if (limit == null) return { ok: false, message: "Pi cache is disabled. Set CLOUD_LOCAL_CACHE_LIMIT_GIB first." };
  if (record.cloudStatus !== "uploaded") return { ok: false, message: "The B2 copy is not ready yet." };
  await mkdir(CACHE_ROOT, { recursive: true, mode: 0o700 });
  const destination = cachePath(record);
  const existingBytes = await fileSize(destination);
  if (existingBytes === record.size && record.size > 0) return { ok: true, message: null };
  if (!(await makeRoom(record.size, existingBytes, destination))) return { ok: false, message: "The Pi cache quota is full or this file is larger than the cache limit." };
  const remote = streamFileFromCloud(record);
  if (!remote) return { ok: false, message: "Cloud storage is not configured." };
  const temporary = `${destination}.${randomUUID()}.partial`;
  try {
    await pipeline(remote.remoteStream, createWriteStream(temporary, { mode: 0o600 }));
    const copied = await fileSize(temporary);
    if (copied !== record.size) throw new Error("Cached file size did not match the cloud copy.");
    await rename(temporary, destination);
    return { ok: true, message: null };
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    return { ok: false, message: cause instanceof Error ? cause.message : "Could not cache file on the Pi." };
  }
}
