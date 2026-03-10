import pg from "pg";
import type { DbAdapter, QueryResult } from "./adapter";

const SCHEMA = `
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
`;

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
    // Migrations for existing databases
    try { await client.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_limit DOUBLE PRECISION DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate DOUBLE PRECISION DEFAULT NULL"); } catch { /* already exists */ }
    try { await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate_until TEXT DEFAULT NULL"); } catch { /* already exists */ }
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
