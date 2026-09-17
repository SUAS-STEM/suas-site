import path from "node:path";
import { existsSync } from "node:fs";

// The dev service runs from an immutable release directory, so keep uploaded
// files in the checkout's persistent data directory. Containers can override
// this with an env var and use their /data volume instead.
export const DEV_UPLOAD_DIR =
  process.env.SUAS_UPLOAD_DIR ||
  (process.env.NODE_ENV === "production" && existsSync("/home/pi/suas-site-dev/data")
    ? "/home/pi/suas-site-dev/data/uploads"
    : path.join(process.cwd(), "data", "uploads"));

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = 400 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 20;

export const UPLOAD_CATEGORIES = ["work", "thirdparty", "gallery"] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

export function isUploadCategory(value: string | null | undefined): value is UploadCategory {
  return !!value && UPLOAD_CATEGORIES.includes(value as UploadCategory);
}

export function uploadCategoryDir(category: UploadCategory) {
  return path.join(DEV_UPLOAD_DIR, category);
}

export function cleanOriginalName(name: string) {
  const cleaned = path
    .basename(name)
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return cleaned || "unnamed-file";
}

export function storedFileName(originalName: string) {
  return `${crypto.randomUUID()}__${cleanOriginalName(originalName)}`;
}

export function userStoredFileName(userId: string, originalName: string) {
  return `${userId}__${crypto.randomUUID()}__${cleanOriginalName(originalName)}`;
}

export function isStoredFileName(name: string) {
  return path.basename(name) === name && /^(?:[0-9a-f-]{36}__){1,2}[^/\\\r\n]+$/i.test(name);
}

export function originalNameFromStored(name: string) {
  const parts = name.split("__");
  return parts.length >= 3 ? parts.slice(2).join("__") : name.slice(38);
}

export function mimeTypeForName(name: string) {
  const extension = path.extname(name).toLowerCase();
  const types: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".zip": "application/zip",
  };
  return types[extension] || "application/octet-stream";
}
