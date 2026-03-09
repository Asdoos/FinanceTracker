import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DbAdapter, QueryResult } from "./adapter";

const SCHEMA = `
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
`;

export function createSqliteAdapter(dbPath?: string): DbAdapter {
  const resolvedPath =
    dbPath || process.env.DATABASE_PATH || path.join(process.cwd(), "data", "finance.db");

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  console.log(`[DB] SQLite connected: ${resolvedPath}`);

  return {
    async query(sql: string, params: any[] = []): Promise<QueryResult> {
      const rows = db.prepare(sql).all(...params);
      return { rows, changes: 0, lastId: 0 };
    },

    async run(sql: string, params: any[] = []): Promise<QueryResult> {
      const result = db.prepare(sql).run(...params);
      return {
        rows: [],
        changes: result.changes,
        lastId: Number(result.lastInsertRowid),
      };
    },

    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
