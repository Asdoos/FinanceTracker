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
