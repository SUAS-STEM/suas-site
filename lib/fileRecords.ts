import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isUploadCategory, type UploadCategory } from "@/lib/devUploads";

const DB_PATH = process.env.DEV_FILE_METADATA_DB ||
  (process.env.NODE_ENV === "production" && existsSync("/home/pi/suas-site-dev/data")
    ? "/home/pi/suas-site-dev/data/file-records.db"
    : path.join(process.cwd(), "data", "file-records.db"));

export type CloudFileStatus = "local" | "pending" | "uploaded" | "failed" | "not_configured";

export type FileRecord = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  uploadedAt: string;
  category: UploadCategory;
  uploaderId: string;
  uploaderName: string;
  cloudStatus: CloudFileStatus;
  cloudError: string | null;
};

function openDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  try { chmodSync(path.dirname(DB_PATH), 0o700); } catch { /* Best effort on non-POSIX development filesystems. */ }
  const db = new Database(DB_PATH);
  try { chmodSync(DB_PATH, 0o600); } catch { /* Best effort on non-POSIX development filesystems. */ }
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_records (
      name TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      category TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      uploader_name TEXT NOT NULL,
      cloud_status TEXT NOT NULL DEFAULT 'not_configured',
      cloud_error TEXT
    )
  `);
  return db;
}

function mapRow(row: Record<string, unknown>): FileRecord {
  const category = String(row.category);
  return {
    name: String(row.name),
    originalName: String(row.original_name),
    size: Number(row.size),
    type: String(row.type),
    modifiedAt: String(row.modified_at),
    uploadedAt: String(row.uploaded_at),
    category: isUploadCategory(category) ? category : "work",
    uploaderId: String(row.uploader_id),
    uploaderName: String(row.uploader_name),
    cloudStatus: row.cloud_status as CloudFileStatus,
    cloudError: row.cloud_error ? String(row.cloud_error) : null,
  };
}

export function saveFileRecord(record: FileRecord) {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO file_records
        (name, original_name, size, type, modified_at, uploaded_at, category, uploader_id, uploader_name, cloud_status, cloud_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        original_name = excluded.original_name,
        size = excluded.size,
        type = excluded.type,
        modified_at = excluded.modified_at,
        category = excluded.category,
        uploader_id = excluded.uploader_id,
        uploader_name = excluded.uploader_name,
        cloud_status = excluded.cloud_status,
        cloud_error = excluded.cloud_error
    `).run(
      record.name,
      record.originalName,
      record.size,
      record.type,
      record.modifiedAt,
      record.uploadedAt,
      record.category,
      record.uploaderId,
      record.uploaderName,
      record.cloudStatus,
      record.cloudError,
    );
  } finally {
    db.close();
  }
}

export function listFileRecords() {
  const db = openDb();
  try {
    return (db.prepare("SELECT * FROM file_records ORDER BY uploaded_at DESC, name ASC").all() as Array<Record<string, unknown>>).map(mapRow);
  } finally {
    db.close();
  }
}

export function getFileRecord(name: string) {
  const db = openDb();
  try {
    const row = db.prepare("SELECT * FROM file_records WHERE name = ?").get(name) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function updateCloudStatus(name: string, status: CloudFileStatus, error: string | null = null) {
  const db = openDb();
  try {
    db.prepare("UPDATE file_records SET cloud_status = ?, cloud_error = ? WHERE name = ?").run(status, error, name);
  } finally {
    db.close();
  }
}

export function deleteFileRecord(name: string) {
  const db = openDb();
  try {
    db.prepare("DELETE FROM file_records WHERE name = ?").run(name);
  } finally {
    db.close();
  }
}
