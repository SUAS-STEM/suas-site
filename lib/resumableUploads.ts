import { randomUUID } from "node:crypto";
import { open, readFile, readdir, rename, rm, stat, statfs, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UploadCategory } from "@/lib/devUploads";

const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const STAGING_RESERVE_BYTES = 1024 * 1024 * 1024;

export const UPLOAD_CHUNK_BYTES = DEFAULT_CHUNK_BYTES;

export type UploadSessionResult = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  uploadedAt: string;
  uploaderName: string;
  status: "ready" | "pending" | "error";
  category: UploadCategory;
  folderPath: string;
};

export type UploadSession = {
  id: string;
  releaseStoreId: string;
  releaseStoreName: string;
  category: UploadCategory;
  folderPath: string;
  originalName: string;
  storedName: string;
  size: number;
  type: string;
  uploaderId: string;
  uploaderName: string;
  chunkSize: number;
  receivedBytes: number;
  createdAt: string;
  updatedAt: string;
  complete?: boolean;
  finalizing?: boolean;
  sha256?: string | null;
  result?: UploadSessionResult;
  duplicate?: boolean;
};

function stagingRoot() {
  if (process.env.DEV_UPLOAD_STAGING_ROOT) return process.env.DEV_UPLOAD_STAGING_ROOT;
  if (process.env.DEV_FILE_METADATA_DB) {
    return path.join(path.dirname(process.env.DEV_FILE_METADATA_DB), "upload-staging");
  }
  if (process.env.NODE_ENV === "production") return "/home/pi/suas-site-dev/data/upload-staging";
  return path.join(process.cwd(), "data", "upload-staging");
}

function sessionDirectory(id: string) {
  return path.join(stagingRoot(), id);
}

export function isUploadId(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function uploadPayloadPath(id: string) {
  return path.join(sessionDirectory(id), "payload.partial");
}

export async function createUploadSession(
  input: Omit<UploadSession, "id" | "receivedBytes" | "createdAt" | "updatedAt">,
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const session: UploadSession = {
    ...input,
    id,
    receivedBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
  const directory = sessionDirectory(id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const payload = await open(uploadPayloadPath(id), "wx", 0o600);
  await payload.close();
  await saveUploadSession(session);
  return session;
}

export async function getUploadSession(id: string): Promise<UploadSession | null> {
  try {
    const text = await readFile(path.join(sessionDirectory(id), "session.json"), "utf8");
    return JSON.parse(text) as UploadSession;
  } catch {
    return null;
  }
}

export async function saveUploadSession(session: UploadSession) {
  session.updatedAt = new Date().toISOString();
  const directory = sessionDirectory(session.id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `session.${randomUUID()}.partial`);
  await writeFile(temporary, JSON.stringify(session), { mode: 0o600 });
  await rename(temporary, path.join(directory, "session.json"));
}

export async function removeUploadSessionFiles(id: string) {
  await rm(sessionDirectory(id), { recursive: true, force: true });
}

export async function cleanupExpiredUploadSessions(now = Date.now()) {
  const root = stagingRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.filter((entry) => entry.isDirectory() && isUploadId(entry.name)).map(async (entry) => {
    const directory = path.join(root, entry.name);
    const manifest = await getUploadSession(entry.name);
    const timestamp = manifest ? Date.parse(manifest.updatedAt) : (await stat(directory).catch(() => null))?.mtimeMs || now;
    if (Number.isFinite(timestamp) && now - timestamp > SESSION_TTL_MS) {
      await rm(directory, { recursive: true, force: true });
    }
  }));
}

export async function canStageUpload(bytes: number) {
  const root = stagingRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  let expectedActiveBytes = 0;
  let remainingActiveBytes = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isUploadId(entry.name)) continue;
    const session = await getUploadSession(entry.name);
    if (!session || session.complete) continue;
    expectedActiveBytes += session.size;
    remainingActiveBytes += Math.max(0, session.size - session.receivedBytes);
  }
  const configuredLimit = Number(process.env.SUAS_MAX_UPLOAD_STAGING_BYTES || 20 * 1000 * 1000 * 1000);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 20 * 1000 * 1000 * 1000;
  if (bytes > limit - expectedActiveBytes) return false;
  const filesystem = await statfs(root).catch(() => null);
  if (!filesystem) return false;
  const available = Number(filesystem.bavail) * Number(filesystem.bsize);
  return Number.isFinite(available) && available >= remainingActiveBytes + bytes + STAGING_RESERVE_BYTES;
}

let initLock = Promise.resolve();
export async function withUploadInitLock<T>(run: () => Promise<T>): Promise<T> {
  const previous = initLock;
  let release: () => void = () => {};
  initLock = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}
