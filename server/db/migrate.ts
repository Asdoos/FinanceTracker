import type { DbAdapter } from "./adapter";

export interface MigrationResult {
  tables: Record<string, number>;
  totalRows: number;
}

/**
 * Tabelle → Spalte, die den Nutzer trägt.
 *
 * Die Uneinheitlichkeit ist **Absicht** (siehe CLAUDE.md): auf den vier
 * kontogebundenen Tabellen heißt die Spalte seit v0.26 `created_by` und trägt nur
 * noch Urheberschaft; `accounts`, `categories` und `goals` behalten `user_id`,
 * weil die Spalte dort echten Besitz bzw. den Sichtbarkeitsschlüssel für den
 * NULL-Zweig des hybriden Prädikats bedeutet.
 *
 * Die Liste ist **zweierlei**: das Register für die Adoption verwaister Daten im Setup
 * *und* die Löschliste beim Entfernen eines Nutzers (`server/routes/auth.ts`). Ein
 * Eintrag heißt deshalb immer beides — „diese Tabelle wird beim Nutzer-Löschen nach
 * Urheber geleert".
 *
 * Genau daran hängt, dass **`salary_components` hier fehlt**: auf einem
 * Gemeinschaftskonto darf jedes Mitglied die Zeilen des anderen ändern, Mitglied B kann
 * also einen Posten an A's Gehalt hängen. Stünde die Tabelle in der Liste, risse B's
 * Löschung **einzelne Posten aus einem weiterbestehenden Gehalt**, und dessen Summe
 * änderte sich still — genau das zu verhindern ist der Zweck der Klammer. Der
 * Normalfall ist von `ON DELETE CASCADE` am Gehalt vollständig gedeckt; der Eintrag
 * brächte nur den Sonderfall, der schadet.
 */
export const USER_COLUMNS: Record<string, string> = {
  accounts: "user_id",
  categories: "user_id",
  goals: "user_id",
  expense_items: "created_by",
  income_sources: "created_by",
  // Deckungsgleich mit income_sources: wer geht, nimmt seine Einnahmen mit, auch die
  // auf einem Gemeinschaftskonto. Die Bestandteile folgen über die Kaskade.
  salaries: "created_by",
  transactions: "created_by",
  transaction_templates: "created_by",
};

const TABLES = Object.keys(USER_COLUMNS);

/**
 * Assigns all existing orphaned data to the given user.
 * Called from POST /api/auth/setup after creating the admin user.
 */
export async function migrateOrphanedData(
  db: DbAdapter,
  userId: number
): Promise<MigrationResult> {
  const result: MigrationResult = { tables: {}, totalRows: 0 };

  for (const table of TABLES) {
    const column = USER_COLUMNS[table];
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM ${table} WHERE ${column} IS NULL`
    );
    const count = Number(rows[0].count);

    if (count > 0) {
      await db.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} IS NULL`, [
        userId,
      ]);
      result.tables[table] = count;
      result.totalRows += count;
    }
  }

  return result;
}
