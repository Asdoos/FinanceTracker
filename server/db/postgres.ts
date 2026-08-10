import pg from "pg";
import type { DbAdapter, QueryResult } from "./adapter";
import { migrationFailed, pendingMigrations } from "./migrations";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual')),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS income_sources (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('monthly', 'annual')),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transaction_templates (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    target_amount DOUBLE PRECISION NOT NULL,
    current_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    due_date TEXT DEFAULT NULL,
    account_id INTEGER REFERENCES accounts(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function runPostgresMigrations(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await client.query("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations");
  const pending = pendingMigrations(Number(rows[0].v));
  if (pending.length === 0) return;

  // Auf PostgreSQL gibt es kein automatisches Datei-Backup — der Hinweis auf
  // `pg_dump` steht in den Release-Notes.
  console.log(`[DB] ${pending.length} Migration(en) anstehend — vor dem Update wird pg_dump empfohlen.`);

  for (const step of pending) {
    // PostgreSQL kann DDL transaktional: Schritt und Versionsmarke committen gemeinsam.
    await client.query("BEGIN");
    try {
      for (const sql of step.postgres) await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [step.version]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw migrationFailed(step, err);
    }
    console.log(`[DB] Migration ${step.version} angewendet: ${step.name}`);
  }
}

/**
 * Convert `?` placeholders to PostgreSQL `$1, $2, ...` format.
 */
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function createPostgresAdapter(
  connectionString?: string
): Promise<DbAdapter> {
  const url = connectionString || process.env.DATABASE_URL!;
  const pool = new pg.Pool({ connectionString: url });

  // Test connection + run migrations
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    // ── Prä-Versions-Präambel (Bestand = Version 0) ──
    // Zustand vor dem Migrationssystem. Bleibt stehen, läuft weiter *vor* Schritt 1.
    // Neue Schemaänderungen gehören ausschließlich nach `migrations.ts`.
    try { await client.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_limit DOUBLE PRECISION DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate DOUBLE PRECISION DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate_until TEXT DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS actual_balance DOUBLE PRECISION DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS actual_balance_date DATE DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS due_month INTEGER DEFAULT NULL"); } catch { /* already exists */ }

    // Multi-user migrations
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE transaction_templates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }
    try { await client.query("ALTER TABLE goals ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"); } catch { /* ignore */ }

    // Indexes
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_expense_items_user ON expense_items(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_income_sources_user ON income_sources(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_transaction_templates_user ON transaction_templates(user_id)"); } catch { /* ignore */ }
    try { await client.query("CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)"); } catch { /* ignore */ }

    await runPostgresMigrations(client);

    console.log(`[DB] PostgreSQL connected: ${url.replace(/\/\/.*@/, "//***@")}`);
  } finally {
    client.release();
  }

  return {
    async query(sql: string, params: any[] = []): Promise<QueryResult> {
      const pgSql = convertPlaceholders(sql);
      const result = await pool.query(pgSql, params);
      return { rows: result.rows, changes: result.rowCount ?? 0, lastId: 0 };
    },

    async run(sql: string, params: any[] = []): Promise<QueryResult> {
      // For INSERT statements, append RETURNING id to get the last inserted ID
      let pgSql = convertPlaceholders(sql);
      const isInsert = /^\s*INSERT\s/i.test(pgSql);
      if (isInsert && !/RETURNING/i.test(pgSql)) {
        pgSql += " RETURNING id";
      }

      const result = await pool.query(pgSql, params);
      return {
        rows: result.rows,
        changes: result.rowCount ?? 0,
        lastId: isInsert && result.rows.length > 0 ? result.rows[0].id : 0,
      };
    },

    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
