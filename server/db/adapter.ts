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

  /**
   * Führt `fn` in **einer** Datenbank-Transaktion aus: alles oder nichts.
   *
   * Während `fn` läuft, gehen `query` und `run` desselben Adapters über dieselbe
   * Verbindung — auf PostgreSQL zwingend, weil ein `BEGIN` auf dem Pool sonst auf
   * einer anderen Verbindung landen könnte als die folgenden Statements und die
   * Transaktion damit wirkungslos wäre.
   *
   * Nicht verschachtelbar.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /** Close the connection */
  close(): Promise<void>;
}
