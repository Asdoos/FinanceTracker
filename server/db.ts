import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "finance.db");

// Ensure directory exists
import fs from "fs";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Performance pragmas
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema migration ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    icon TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual')),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual')),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
