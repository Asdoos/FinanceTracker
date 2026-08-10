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

  {
    version: 3,
    name: "account_members anlegen und befüllen",
    // Die Owner-Mitgliedschaft ist eine **Invariante, kein einmaliger Backfill**:
    // sie wird an allen drei Stellen hergestellt, an denen ein Konto eine user_id
    // bekommt (POST /api/accounts, dieser Schritt, die Setup-Route). Ohne die
    // Invariante verliert eine Installation aus der Vor-Auth-Zeit beim Upgrade
    // sämtliche Konten unsichtbar: der Backfill trifft nichts, die Versionsmarke
    // wird trotzdem gesetzt, und das spätere Setup erzeugt keine Zeilen.
    sqlite: [
      `CREATE TABLE account_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      "CREATE INDEX idx_account_members_account ON account_members(account_id)",
      "CREATE INDEX idx_account_members_user ON account_members(user_id)",
      "CREATE UNIQUE INDEX idx_account_members_pair ON account_members(account_id, user_id)",
      `INSERT INTO account_members (account_id, user_id, role, status)
         SELECT id, user_id, 'owner', 'active' FROM accounts WHERE user_id IS NOT NULL`,
    ],
    postgres: [
      `CREATE TABLE account_members (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      "CREATE INDEX idx_account_members_account ON account_members(account_id)",
      "CREATE INDEX idx_account_members_user ON account_members(user_id)",
      "CREATE UNIQUE INDEX idx_account_members_pair ON account_members(account_id, user_id)",
      `INSERT INTO account_members (account_id, user_id, role, status)
         SELECT id, user_id, 'owner', 'active' FROM accounts WHERE user_id IS NOT NULL`,
    ],
  },

  {
    version: 4,
    name: "categories: Konto-Bindung und Budget-Urheber",
    // Kein Backfill: alle heutigen Kategorien sind persönlich und bleiben NULL.
    // `budget_set_by`/`budget_set_at` speisen die Spalte „gesetzt von" der
    // Kategorien-Tabelle; Bestandszeilen bleiben leer.
    sqlite: [
      "ALTER TABLE categories ADD COLUMN account_id INTEGER REFERENCES accounts(id)",
      "ALTER TABLE categories ADD COLUMN budget_set_by INTEGER REFERENCES users(id)",
      "ALTER TABLE categories ADD COLUMN budget_set_at TEXT DEFAULT NULL",
      "CREATE INDEX idx_categories_account ON categories(account_id)",
    ],
    postgres: [
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id)",
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_set_by INTEGER REFERENCES users(id)",
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_set_at TIMESTAMPTZ DEFAULT NULL",
      "CREATE INDEX IF NOT EXISTS idx_categories_account ON categories(account_id)",
    ],
  },

  {
    version: 5,
    name: "accounts: Saldo-Urheber und is_shared",
    // `actual_balance_by` bleibt bei Bestandsdaten NULL — die UI trägt
    // „abgeglichen, aber unbekannt von wem". `is_shared` steuert den
    // Dashboard-Block, **nicht** die Sichtbarkeit; die kommt aus account_members.
    sqlite: [
      "ALTER TABLE accounts ADD COLUMN actual_balance_by INTEGER REFERENCES users(id)",
      "ALTER TABLE accounts ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0",
    ],
    postgres: [
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS actual_balance_by INTEGER REFERENCES users(id)",
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE",
    ],
  },

  {
    version: 6,
    name: "Stammdaten in die Mitgliedschaft umziehen",
    // Zwingend nach Schritt 3 — sonst gibt es keine Zielzeile.
    //
    // `is_default` wird beim Umzug **aufgeräumt, nicht blind kopiert**: je Nutzer
    // gewinnt die niedrigste Konto-ID. Wer keines hat, bekommt keines — die
    // Invariante ist „höchstens eines". Das Aufräumen ist Voraussetzung für den
    // partiellen Unique-Index, der sonst die Migration korrekt abbrechen würde.
    // Der Index existiert, weil eine Regel, die nur in der Route steht, genau die
    // Sorte Regel ist, die den heutigen Bug erzeugt hat.
    sqlite: [
      "ALTER TABLE account_members ADD COLUMN freibetrag REAL DEFAULT NULL",
      "ALTER TABLE account_members ADD COLUMN freibetrag_year INTEGER DEFAULT NULL",
      "ALTER TABLE account_members ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
      `UPDATE account_members SET
         freibetrag = (SELECT a.freibetrag FROM accounts a WHERE a.id = account_members.account_id),
         freibetrag_year = (SELECT a.freibetrag_year FROM accounts a WHERE a.id = account_members.account_id)
       WHERE role = 'owner'`,
      `UPDATE account_members SET is_default = 1
       WHERE (user_id, account_id) IN (
         SELECT am.user_id, MIN(am.account_id)
         FROM account_members am
         JOIN accounts a ON a.id = am.account_id
         WHERE a.is_default = 1
         GROUP BY am.user_id
       )`,
      "ALTER TABLE accounts DROP COLUMN freibetrag",
      "ALTER TABLE accounts DROP COLUMN freibetrag_year",
      "ALTER TABLE accounts DROP COLUMN is_default",
      "CREATE UNIQUE INDEX idx_account_members_default ON account_members(user_id) WHERE is_default = 1",
    ],
    postgres: [
      "ALTER TABLE account_members ADD COLUMN IF NOT EXISTS freibetrag DOUBLE PRECISION DEFAULT NULL",
      "ALTER TABLE account_members ADD COLUMN IF NOT EXISTS freibetrag_year INTEGER DEFAULT NULL",
      "ALTER TABLE account_members ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE",
      `UPDATE account_members SET
         freibetrag = a.freibetrag,
         freibetrag_year = a.freibetrag_year
       FROM accounts a WHERE a.id = account_members.account_id AND account_members.role = 'owner'`,
      `UPDATE account_members SET is_default = TRUE
       WHERE (user_id, account_id) IN (
         SELECT am.user_id, MIN(am.account_id)
         FROM account_members am
         JOIN accounts a ON a.id = am.account_id
         WHERE a.is_default
         GROUP BY am.user_id
       )`,
      "ALTER TABLE accounts DROP COLUMN freibetrag",
      "ALTER TABLE accounts DROP COLUMN freibetrag_year",
      "ALTER TABLE accounts DROP COLUMN is_default",
      "CREATE UNIQUE INDEX idx_account_members_default ON account_members(user_id) WHERE is_default",
    ],
  },

  {
    version: 7,
    name: "user_id zu created_by umbenennen",
    // Der eigentliche Leck-Schutz, weil er die Fehlerklasse umdreht: eine
    // vergessene Stelle mit `WHERE user_id = ?` ist danach ein **SQL-Fehler**
    // statt einer Query, die still die falschen Zeilen liefert.
    //
    // `accounts`, `categories` und `goals` behalten **absichtlich** `user_id` —
    // dort bedeutet die Spalte echten Besitz bzw. ist Sichtbarkeitsschlüssel für
    // den NULL-Zweig des hybriden Prädikats. Die Uneinheitlichkeit ist gewollt
    // und in CLAUDE.md dokumentiert.
    sqlite: [
      "ALTER TABLE expense_items RENAME COLUMN user_id TO created_by",
      "ALTER TABLE income_sources RENAME COLUMN user_id TO created_by",
      "ALTER TABLE transactions RENAME COLUMN user_id TO created_by",
      "ALTER TABLE transaction_templates RENAME COLUMN user_id TO created_by",
    ],
    postgres: [
      "ALTER TABLE expense_items RENAME COLUMN user_id TO created_by",
      "ALTER TABLE income_sources RENAME COLUMN user_id TO created_by",
      "ALTER TABLE transactions RENAME COLUMN user_id TO created_by",
      "ALTER TABLE transaction_templates RENAME COLUMN user_id TO created_by",
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
