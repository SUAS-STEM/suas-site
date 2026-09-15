import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_STITCH_SETTINGS, STITCH_SETTING_VALUES } from "@/lib/stitchSettings";
import type { StitchSettings } from "@/lib/stitchSettings";

export { DEFAULT_STITCH_SETTINGS, STITCH_SETTING_VALUES } from "@/lib/stitchSettings";
export type { StitchSettings } from "@/lib/stitchSettings";

export const JOB_ROOT = "/data/stitch/jobs";
export const MAX_FILES_PER_JOB = 200;
export const MAX_FILE_BYTES = 80 * 1024 * 1024;
export const MAX_JOB_BYTES = 800 * 1024 * 1024;
export const UNSTARTED_RETENTION_MS = 24 * 60 * 60 * 1000;
export const STALE_STARTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export type StitchFileMeta = { name: string; storedName: string; size: number; type: string; exif?: Record<string, unknown> | null };
export type StitchJobMeta = { id: string; token: string; createdAt: string; startedAt?: string | null; settings?: StitchSettings; files: StitchFileMeta[]; totalBytes: number };

export function normalizeStitchSettings(input: unknown): StitchSettings {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const featureQuality = value.featureQuality;
  const pcQuality = value.pcQuality;
  const resolution = Number(value.orthophotoResolution);
  if (!STITCH_SETTING_VALUES.featureQuality.includes(featureQuality as StitchSettings["featureQuality"])) throw new Error("Invalid feature quality");
  if (!STITCH_SETTING_VALUES.pcQuality.includes(pcQuality as StitchSettings["pcQuality"])) throw new Error("Invalid point-cloud quality");
  if (!STITCH_SETTING_VALUES.orthophotoResolution.includes(resolution as StitchSettings["orthophotoResolution"])) throw new Error("Invalid orthophoto resolution");
  return { featureQuality: featureQuality as StitchSettings["featureQuality"], pcQuality: pcQuality as StitchSettings["pcQuality"], orthophotoResolution: resolution as StitchSettings["orthophotoResolution"] };
}

export function safeJobId(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error("Invalid job id");
  return id;
}
export function jobDir(id: string) { return path.join(JOB_ROOT, safeJobId(id)); }
export function metaPath(id: string) { return path.join(jobDir(id), "meta.json"); }
export async function readJob(id: string): Promise<StitchJobMeta> {
  const meta = JSON.parse(await readFile(metaPath(id), "utf8")) as StitchJobMeta;
  if (!meta || meta.id !== id || !Array.isArray(meta.files) || typeof meta.totalBytes !== "number") {
    throw new Error("Invalid stitch job metadata");
  }
  return meta;
}
export async function writeJob(meta: StitchJobMeta) {
  await mkdir(jobDir(meta.id), { recursive: true, mode: 0o700 });
  await writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2) + "\n", { mode: 0o600 });
}
export function sanitizeFilename(name: string) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "_").slice(0, 180);
  return base || "image.jpg";
}

export async function cleanupStaleJobs(protectedId?: string) {
  await mkdir(JOB_ROOT, { recursive: true, mode: 0o700 });
  const now = Date.now();
  let entries;
  try {
    entries = await readdir(JOB_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || entry.name === protectedId || !/^[a-zA-Z0-9_-]{8,80}$/.test(entry.name)) return;
    const directory = path.join(JOB_ROOT, entry.name);
    try {
      const meta = JSON.parse(await readFile(path.join(directory, "meta.json"), "utf8")) as StitchJobMeta;
      const created = Date.parse(meta.createdAt);
      if (!Number.isFinite(created)) return;
      const age = now - created;
      const limit = meta.startedAt ? STALE_STARTED_RETENTION_MS : UNSTARTED_RETENTION_MS;
      if (age > limit) await rm(directory, { recursive: true, force: true });
    } catch {
      try {
        const info = await stat(directory);
        if (now - info.mtimeMs > UNSTARTED_RETENTION_MS) await rm(directory, { recursive: true, force: true });
      } catch { /* another request may be creating the job */ }
    }
  }));
}
