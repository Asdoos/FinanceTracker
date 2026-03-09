/**
 * Database adapter interface.
 * Abstracts SQLite and PostgreSQL behind a common async API.
 */
export interface QueryResult {
  rows: any[];
  changes: number;
  lastId: number;
}

export interface DbAdapter {
  /** SELECT queries — returns rows */
  query(sql: string, params?: any[]): Promise<QueryResult>;

  /** INSERT/UPDATE/DELETE — returns changes + lastId */
  run(sql: string, params?: any[]): Promise<QueryResult>;

  /** Execute raw SQL (e.g. schema migration) */
  exec(sql: string): Promise<void>;

  /** Close the connection */
  close(): Promise<void>;
}
