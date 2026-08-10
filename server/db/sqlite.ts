import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DbAdapter, QueryResult } from "./adapter";
import { migrationFailed, pendingMigrations } from "./migrations";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    freibetrag REAL DEFAULT NULL,
    freibetrag_year INTEGER DEFAULT NULL,
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
    end_date TEXT DEFAULT NULL,
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

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transaction_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    due_date TEXT DEFAULT NULL,
    account_id INTEGER REFERENCES accounts(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * Kopiert die Datenbankdatei, bevor der erste anstehende Schritt einer Session läuft.
 * Ein Nutzer, dessen Migration bricht, hat keinen Weg zurück — das ist das Netz.
 * Kein Backup, wenn nichts anstünde.
 */
function backupBeforeMigration(db: Database.Database, dbPath: string, version: number): void {
  // WAL zuerst in die Hauptdatei schreiben, sonst kopieren wir einen veralteten Stand.
  db.pragma("wal_checkpoint(TRUNCATE)");
  const target = `${dbPath}.pre-v${version}.bak`;
  fs.copyFileSync(dbPath, target);
  console.log(`[DB] Backup vor Migration ${version} angelegt: ${target}`);
}

function runSqliteMigrations(db: Database.Database, dbPath: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const { v } = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get() as { v: number };
  const pending = pendingMigrations(Number(v));
  if (pending.length === 0) return;

  backupBeforeMigration(db, dbPath, pending[0].version);

  const mark = db.prepare("INSERT INTO schema_migrations (version) VALUES (?)");
  for (const step of pending) {
    // Schritt und Versionsmarke in *einer* Transaktion — es darf keinen Zustand
    // „Schritt lief, Marke fehlt" geben.
    const apply = db.transaction(() => {
      for (const sql of step.sqlite) db.exec(sql);
      mark.run(step.version);
    });
    try {
      apply();
    } catch (err) {
      throw migrationFailed(step, err);
    }
    console.log(`[DB] Migration ${step.version} angewendet: ${step.name}`);
  }
}

export function createSqliteAdapter(dbPath?: string): DbAdapter {
  const resolvedPath =
    dbPath || process.env.DATABASE_PATH || path.join(process.cwd(), "data", "finance.db");

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // ── Prä-Versions-Präambel (Bestand = Version 0) ──
  // Diese Zeilen sind der Zustand vor dem Migrationssystem. Sie bleiben stehen und
  // laufen weiter *vor* Schritt 1; nichts wird rückwirkend rekonstruiert. Neue
  // Schemaänderungen gehören ausschließlich nach `migrations.ts`.
  try { db.exec("ALTER TABLE expense_items ADD COLUMN end_date TEXT DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN freibetrag REAL DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN freibetrag_year INTEGER DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE categories ADD COLUMN budget_limit REAL DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN interest_rate REAL DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN interest_rate_until TEXT DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN actual_balance REAL DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN actual_balance_date TEXT DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE accounts ADD COLUMN interest_interval TEXT DEFAULT NULL"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE expense_items ADD COLUMN due_month INTEGER DEFAULT NULL"); } catch { /* already exists */ }

  // Multi-user migrations
  try { db.exec("ALTER TABLE accounts ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE categories ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE expense_items ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE income_sources ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE transaction_templates ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE goals ADD COLUMN user_id INTEGER REFERENCES users(id)"); } catch { /* already exists */ }

  // Indexes for user_id columns
  try { db.exec("CREATE INDEX idx_accounts_user ON accounts(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_categories_user ON categories(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_expense_items_user ON expense_items(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_income_sources_user ON income_sources(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_transactions_user ON transactions(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_transaction_templates_user ON transaction_templates(user_id)"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX idx_goals_user ON goals(user_id)"); } catch { /* already exists */ }

  runSqliteMigrations(db, resolvedPath);

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
