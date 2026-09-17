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
  sha256: string | null;
  cloudStatus: CloudFileStatus;
  cloudError: string | null;
};

export type ParamVersion = FileRecord & {
  versionName: string;
  notes: string | null;
  parameterCount: number;
  parameters: Record<string, string>;
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
      sha256 TEXT,
      cloud_status TEXT NOT NULL DEFAULT 'not_configured',
      cloud_error TEXT
    );
    CREATE TABLE IF NOT EXISTS param_versions (
      file_name TEXT PRIMARY KEY REFERENCES file_records(name) ON DELETE CASCADE,
      version_name TEXT NOT NULL,
      notes TEXT,
      parameter_count INTEGER NOT NULL,
      parameters_json TEXT NOT NULL
    )
  `);
  try { db.exec("ALTER TABLE file_records ADD COLUMN sha256 TEXT"); } catch { /* Column already exists on upgraded databases. */ }
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
    sha256: row.sha256 ? String(row.sha256) : null,
    cloudStatus: row.cloud_status as CloudFileStatus,
    cloudError: row.cloud_error ? String(row.cloud_error) : null,
  };
}

export function saveFileRecord(record: FileRecord) {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO file_records
        (name, original_name, size, type, modified_at, uploaded_at, category, uploader_id, uploader_name, sha256, cloud_status, cloud_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        original_name = excluded.original_name,
        size = excluded.size,
        type = excluded.type,
        modified_at = excluded.modified_at,
        category = excluded.category,
        uploader_id = excluded.uploader_id,
        uploader_name = excluded.uploader_name,
        sha256 = excluded.sha256,
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
      record.sha256,
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

export function findFileRecordByHash(sha256: string, excludeName?: string) {
  const db = openDb();
  try {
    const row = db.prepare(`SELECT * FROM file_records
      WHERE sha256 = ? AND cloud_status = 'uploaded' AND (? IS NULL OR name != ?)
      ORDER BY uploaded_at ASC LIMIT 1`).get(sha256, excludeName || null, excludeName || null) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function updateFileHash(name: string, sha256: string) {
  const db = openDb();
  try {
    db.prepare("UPDATE file_records SET sha256 = ? WHERE name = ?").run(sha256, name);
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

export function renameFileRecord(name: string, displayName: string) {
  const db = openDb();
  try {
    return db.prepare("UPDATE file_records SET original_name = ?, modified_at = ? WHERE name = ?")
      .run(displayName, new Date().toISOString(), name).changes > 0;
  } finally {
    db.close();
  }
}

function mapParamRow(row: Record<string, unknown>): ParamVersion {
  const file = mapRow(row);
  let parameters: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(row.parameters_json || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parameters = parsed as Record<string, string>;
  } catch { /* Keep a damaged legacy snapshot readable as an empty set. */ }
  return {
    ...file,
    versionName: String(row.version_name),
    notes: row.notes ? String(row.notes) : null,
    parameterCount: Number(row.parameter_count),
    parameters,
  };
}

export function saveParamVersion(record: FileRecord, versionName: string, notes: string | null, parameters: Record<string, string>) {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO param_versions (file_name, version_name, notes, parameter_count, parameters_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_name) DO UPDATE SET
        version_name = excluded.version_name,
        notes = excluded.notes,
        parameter_count = excluded.parameter_count,
        parameters_json = excluded.parameters_json
    `).run(record.name, versionName, notes, Object.keys(parameters).length, JSON.stringify(parameters));
  } finally {
    db.close();
  }
}

export function listParamVersions() {
  const db = openDb();
  try {
    return (db.prepare(`SELECT f.*, p.version_name, p.notes, p.parameter_count, p.parameters_json
      FROM param_versions p JOIN file_records f ON f.name = p.file_name
      ORDER BY f.uploaded_at DESC, f.name ASC`).all() as Array<Record<string, unknown>>).map(mapParamRow);
  } finally {
    db.close();
  }
}

export function getParamVersion(name: string) {
  const db = openDb();
  try {
    const row = db.prepare(`SELECT f.*, p.version_name, p.notes, p.parameter_count, p.parameters_json
      FROM param_versions p JOIN file_records f ON f.name = p.file_name WHERE f.name = ?`).get(name) as Record<string, unknown> | undefined;
    return row ? mapParamRow(row) : null;
  } finally {
    db.close();
  }
}

export function updateParamVersion(name: string, versionName: string, notes: string | null) {
  const db = openDb();
  try {
    const changed = db.prepare("UPDATE param_versions SET version_name = ?, notes = ? WHERE file_name = ?").run(versionName, notes, name).changes > 0;
    if (changed) db.prepare("UPDATE file_records SET modified_at = ? WHERE name = ?").run(new Date().toISOString(), name);
    return changed;
  } finally {
    db.close();
  }
}

export function deleteParamVersion(name: string) {
  const db = openDb();
  try {
    db.prepare("DELETE FROM param_versions WHERE file_name = ?").run(name);
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
