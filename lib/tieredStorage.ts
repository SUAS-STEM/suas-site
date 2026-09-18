import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  deleteFileFromCloud,
  getStorageStatus as getCloudStorageStatus,
  streamFileFromCloud,
  syncStreamToCloudWithHash,
  type StorageStatus as CloudStorageStatus,
} from "@/lib/cloudStorage";
import { updateCloudStatus, type FileRecord } from "@/lib/fileRecords";

const GB = 1000 * 1000 * 1000;
const GIB = 1024 * 1024 * 1024;
const LOCAL_ROOT = process.env.DEV_LOCAL_STORAGE_ROOT ||
  (process.env.NODE_ENV === "production" && process.env.DEV_FILE_METADATA_DB
    ? path.join(path.dirname(process.env.DEV_FILE_METADATA_DB), "file-storage")
    : process.env.NODE_ENV === "production"
      ? "/home/pi/suas-site-dev/data/file-storage"
      : path.join(process.cwd(), "data", "file-storage"));

let reservedCloudBytes = 0;
let reservedLocalBytes = 0;

export type LocalStorageStatus = {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
};

export type TieredStorageStatus = {
  cloud: CloudStorageStatus["cloud"];
  local: LocalStorageStatus;
  combined: {
    configured: boolean;
    used: number | null;
    limit: number | null;
    remaining: number | null;
    message: string | null;
  };
};

export type StorageDestination = "cloud" | "local";

export type StorageReservation = {
  destinations: StorageDestination[];
  cloudBytes: number;
  localBytes: number;
};

function localLimitBytes() {
  const gb = Number(process.env.LOCAL_STORAGE_LIMIT_GB || 0);
  if (Number.isFinite(gb) && gb > 0) return Math.floor(gb * GB);
  const gib = Number(process.env.LOCAL_STORAGE_LIMIT_GIB || process.env.CLOUD_LOCAL_CACHE_LIMIT_GIB || 0);
  return Number.isFinite(gib) && gib > 0 ? Math.floor(gib * GIB) : null;
}

function localPath(record: Pick<FileRecord, "category" | "name">) {
  return path.join(LOCAL_ROOT, record.category, record.name);
}

async function localFiles() {
  const files: Array<{ path: string; size: number }> = [];
  try {
    const categories = await readdir(LOCAL_ROOT, { withFileTypes: true });
    for (const category of categories) {
      if (!category.isDirectory()) continue;
      const categoryPath = path.join(LOCAL_ROOT, category.name);
      for (const entry of await readdir(categoryPath, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.endsWith(".partial")) continue;
        const fullPath = path.join(categoryPath, entry.name);
        const info = await stat(fullPath);
        files.push({ path: fullPath, size: info.size });
      }
    }
  } catch {
    // A missing root simply means local storage is empty.
  }
  return files;
}

export async function getLocalStorageStatus(): Promise<LocalStorageStatus> {
  const limit = localLimitBytes();
  const used = (await localFiles()).reduce((sum, entry) => sum + entry.size, 0);
  return {
    enabled: limit != null,
    used,
    limit,
    remaining: limit == null ? null : Math.max(limit - used, 0),
  };
}

export async function getTieredStorageStatus(): Promise<TieredStorageStatus> {
  const [{ cloud }, local] = await Promise.all([getCloudStorageStatus(), getLocalStorageStatus()]);
  const limit = cloud.limit != null && local.limit != null ? cloud.limit + local.limit : null;
  const used = cloud.used != null ? cloud.used + local.used : null;
  const remaining = cloud.remaining != null && local.remaining != null ? cloud.remaining + local.remaining : null;
  const configured = cloud.configured || local.enabled;
  return {
    cloud,
    local,
    combined: {
      configured,
      used,
      limit,
      remaining,
      message: !configured
        ? "Storage is not configured on the server."
        : used == null || remaining == null
          ? "Storage usage is temporarily unavailable."
          : null,
    },
  };
}

export function reserveTieredUploads(sizes: number[], status: TieredStorageStatus): StorageReservation | null {
  let cloudRemaining = status.cloud.configured && status.cloud.remaining != null
    ? Math.max(status.cloud.remaining - reservedCloudBytes, 0)
    : 0;
  let localRemaining = status.local.enabled && status.local.remaining != null
    ? Math.max(status.local.remaining - reservedLocalBytes, 0)
    : 0;
  let cloudBytes = 0;
  let localBytes = 0;
  const destinations: StorageDestination[] = [];

  for (const size of sizes) {
    if (!Number.isFinite(size) || size < 0) return null;
    if (size <= cloudRemaining) {
      destinations.push("cloud");
      cloudRemaining -= size;
      cloudBytes += size;
    } else if (size <= localRemaining) {
      destinations.push("local");
      localRemaining -= size;
      localBytes += size;
    } else {
      return null;
    }
  }

  reservedCloudBytes += cloudBytes;
  reservedLocalBytes += localBytes;
  return { destinations, cloudBytes, localBytes };
}

export function releaseTieredUploads(reservation: StorageReservation) {
  reservedCloudBytes = Math.max(0, reservedCloudBytes - reservation.cloudBytes);
  reservedLocalBytes = Math.max(0, reservedLocalBytes - reservation.localBytes);
}

async function syncStreamToLocalWithHash(
  record: FileRecord,
  webStream: import("node:stream/web").ReadableStream,
  expectedSize: number,
) {
  const destination = localPath(record);
  const temporary = `${destination}.${randomUUID()}.partial`;
  try {
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const hash = createHash("sha256");
    const hashingStream = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(webStream),
      hashingStream,
      createWriteStream(temporary, { mode: 0o600 }),
    );
    const info = await stat(temporary);
    if (!info.isFile() || info.size !== expectedSize) throw new Error("Stored file size did not match the upload.");
    await rename(temporary, destination);
    updateCloudStatus(record.name, "local");
    return { status: "local" as const, sha256: hash.digest("hex") };
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "Local storage write failed.";
    updateCloudStatus(record.name, "failed", message);
    return { status: "failed" as const, sha256: null };
  }
}

export async function storeStreamWithHash(
  destination: StorageDestination,
  record: FileRecord,
  webStream: import("node:stream/web").ReadableStream,
  expectedSize: number,
) {
  return destination === "cloud"
    ? syncStreamToCloudWithHash(record, webStream, expectedSize)
    : syncStreamToLocalWithHash(record, webStream, expectedSize);
}

export function streamStoredFile(record: Pick<FileRecord, "category" | "name" | "cloudStatus">) {
  if (record.cloudStatus === "local") return { remoteStream: createReadStream(localPath(record)) };
  if (record.cloudStatus === "uploaded") return streamFileFromCloud(record);
  return null;
}

export async function deleteStoredFile(record: Pick<FileRecord, "category" | "name" | "cloudStatus">) {
  if (record.cloudStatus === "local") {
    try {
      await unlink(localPath(record));
      return true;
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      return code === "ENOENT";
    }
  }
  if (record.cloudStatus === "uploaded") return deleteFileFromCloud(record);
  return true;
}
