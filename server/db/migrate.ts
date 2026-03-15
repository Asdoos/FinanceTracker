import type { DbAdapter } from "./adapter";

export interface MigrationResult {
  tables: Record<string, number>;
  totalRows: number;
}

const TABLES = [
  "accounts",
  "categories",
  "expense_items",
  "income_sources",
  "transactions",
  "transaction_templates",
  "goals",
];

/**
 * Assigns all existing data (user_id IS NULL) to the given user.
 * Called from POST /api/auth/setup after creating the admin user.
 */
export async function migrateOrphanedData(
  db: DbAdapter,
  userId: number
): Promise<MigrationResult> {
  const result: MigrationResult = { tables: {}, totalRows: 0 };

  for (const table of TABLES) {
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM ${table} WHERE user_id IS NULL`
    );
    const count = Number(rows[0].count);

    if (count > 0) {
      await db.run(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`, [
        userId,
      ]);
      result.tables[table] = count;
      result.totalRows += count;
    }
  }

  return result;
}
