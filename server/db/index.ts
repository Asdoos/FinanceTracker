import type { DbAdapter } from "./adapter";
import { createSqliteAdapter } from "./sqlite";

let _db: DbAdapter | null = null;
let _initPromise: Promise<DbAdapter> | null = null;

/**
 * Returns the database adapter singleton.
 * On first call, initializes either PostgreSQL or SQLite based on DATABASE_URL.
 */
export function getDb(): Promise<DbAdapter> {
  if (_db) return Promise.resolve(_db);
  if (_initPromise) return _initPromise;

  _initPromise = initDb();
  return _initPromise;
}

async function initDb(): Promise<DbAdapter> {
  if (process.env.DATABASE_URL) {
    // Dynamic import to avoid loading pg when using SQLite
    const { createPostgresAdapter } = await import("./postgres");
    _db = await createPostgresAdapter();
  } else {
    _db = createSqliteAdapter();
  }
  return _db;
}

export type { DbAdapter } from "./adapter";
