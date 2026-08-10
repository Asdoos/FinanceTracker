/**
 * Versioniertes Migrationssystem.
 *
 * Der Bestand ist **Version 0**: alles, was die Adapter vor dem Aufruf des Runners
 * als `try { ALTER … } catch {}`-Präambel ausführen, bleibt dort stehen und wird
 * nicht rückwirkend rekonstruiert. Ab Schritt 1 gilt:
 *
 * - Jeder Schritt läuft **in einer Transaktion gemeinsam mit seiner Versionsmarke**.
 *   Es gibt keinen Zustand „Schritt lief, Marke fehlt".
 * - Beim ersten Fehler bricht der Start **hart** ab. Kein `catch {}`.
 * - Die Versionsnummern sind **engine-übergreifend**. Ein Schritt darf auf einer
 *   Engine leer sein (`[]`) — die Versionsmarke wird trotzdem gesetzt, sonst
 *   bedeutet Schritt N je Adapter etwas anderes.
 */

export interface MigrationStep {
  version: number;
  name: string;
  /** SQLite-Anweisungen. Leeres Array = auf dieser Engine nichts zu tun. */
  sqlite: string[];
  /** PostgreSQL-Anweisungen. Leeres Array = auf dieser Engine nichts zu tun. */
  postgres: string[];
  /**
   * Tabellen-Rebuild nach SQLite-Vorschrift: der Runner schaltet `foreign_keys`
   * **vor** der Transaktion aus und danach wieder ein (ein PRAGMA innerhalb einer
   * Transaktion ist wirkungslos) und prüft **vor dem Commit** per
   * `PRAGMA foreign_key_check`. Ohne diese Prüfung bliebe ein zerrissener
   * Fremdschlüssel still.
   */
  sqliteRebuild?: boolean;
}

export const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    name: "Postgres-Drift einebnen",
    // Die Präambel hat diese Spalten auf SQLite längst angelegt — leerer Schritt,
    // Versionsmarke trotzdem.
    sqlite: [],
    postgres: [
      "ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS end_date TEXT DEFAULT NULL",
      // freibetrag/freibetrag_year werden bewusst angelegt, obwohl v0.26 sie wieder
      // droppt: der sinnlose ADD vor dem DROP ist billiger als ein engine-abhängig
      // verzweigter Backfill-Schritt — genau diese Verzweigung ist die Ursache der
      // heutigen Drift.
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS freibetrag DOUBLE PRECISION DEFAULT NULL",
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS freibetrag_year INTEGER DEFAULT NULL",
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_interval TEXT DEFAULT NULL",
    ],
  },

  {
    version: 2,
    name: "transactions: Transfer-Typ und Gegenkonto",
    // Definiert über die **Zielform**, nicht über die Statements — beide Engines
    // erreichen dieselbe Form auf ihrem eigenen Weg:
    //   - `type` trägt CHECK (type IN ('income','expense','transfer')) — der CHECK
    //     bleibt und wächst, denn der MCP ist ein zweiter Schreibweg und die
    //     Datenbank die letzte Stelle, an der ein falscher Typ noch auffällt.
    //   - `counter_account_id` nullable, FK auf accounts(id). Bestandszeilen bleiben NULL.
    // Ausdrücklich nicht hier: created_by-Rename (v0.26), transaction_templates
    // (bleibt zweiwertig, spart den zweiten Rebuild), Backfill alter
    // Umbuchungs-Paare (wäre eine Heuristik mit irreversiblen Falschtreffern).
    sqliteRebuild: true,
    sqlite: [
      `CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        label TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
        category_id INTEGER REFERENCES categories(id),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        counter_account_id INTEGER REFERENCES accounts(id),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        user_id INTEGER REFERENCES users(id)
      )`,
      `INSERT INTO transactions_new (id, date, label, amount, type, category_id, account_id, note, created_at, user_id)
         SELECT id, date, label, amount, type, category_id, account_id, note, created_at, user_id FROM transactions`,
      "DROP TABLE transactions",
      "ALTER TABLE transactions_new RENAME TO transactions",
      // Der Index fiel mit der alten Tabelle; dazu die beiden Konto-Spalten, die
      // ab jetzt jede kontobezogene Abfrage anfasst.
      "CREATE INDEX idx_transactions_user ON transactions(user_id)",
      "CREATE INDEX idx_transactions_account ON transactions(account_id)",
      "CREATE INDEX idx_transactions_counter_account ON transactions(counter_account_id)",
    ],
    postgres: [
      "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check",
      "ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense', 'transfer'))",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counter_account_id INTEGER",
      "ALTER TABLE transactions ADD CONSTRAINT transactions_counter_account_fkey FOREIGN KEY (counter_account_id) REFERENCES accounts(id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_counter_account ON transactions(counter_account_id)",
    ],
  },
];

/** Höchste bekannte Zielversion — für Log- und Backup-Namen. */
export const TARGET_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

export function pendingMigrations(currentVersion: number): MigrationStep[] {
  return MIGRATIONS.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
}

export function migrationFailed(step: MigrationStep, err: unknown): Error {
  return new Error(
    `[DB] Migration ${step.version} ("${step.name}") fehlgeschlagen — der Server startet nicht. ` +
      `Die Datenbank steht unverändert auf Version ${step.version - 1}. Ursache: ${
        err instanceof Error ? err.message : String(err)
      }`
  );
}
