import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.SPONSOR_DB_PATH || path.join(process.cwd(), "data", "sponsors.db");

function getDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

export async function POST(req: Request) {
  const { name, email, message } = await req.json();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO sponsors (name, email, message, created_at) VALUES (?, ?, ?, ?)"
    ).run(name, email, message, new Date().toISOString());
  } finally {
    db.close();
  }

  return NextResponse.json({ ok: true });
}
