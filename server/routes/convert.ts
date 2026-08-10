import { Router } from "express";
import { getDb } from "../db";
import { myRole } from "../lib/members";
import { createDefaultSharedCategory } from "../lib/coupling";

/**
 * Umwandlung eines bestehenden Kontos in ein Gemeinschaftskonto.
 *
 * **Eigener Endpoint statt `PATCH { isShared: true }`:** als Feld läge die
 * Umwandlung in derselben generischen Feldliste wie „Farbe ändern" und wäre
 * versehentlich auslösbar.
 *
 * **Rückwirkend fürs ganze Konto, kein Stichtag** — ein Stichtag zerlegte
 * gleichzeitig Sichtbarkeits-Prädikat, Saldo-Anker, laufenden Saldo und
 * Block-Zuordnung.
 *
 * **Einseitig — keine Rückwandlung.** Fremdes `created_by` würde sonst in
 * persönliche Totals sickern, die Kategorien-Kopie ist namentlich nicht umkehrbar,
 * und die überlebende `account_members`-Zeile wäre unbestimmt. Ein
 * Gemeinschaftskonto mit *einem* Mitglied ist stattdessen ein gültiger Zustand.
 *
 * **Kein MCP-Werkzeug** — auch nicht die lesende Vorschau. Ein Werkzeug, dessen
 * Sicherheitsmechanismus die UI ist, bekommt keinen zweiten Eingang.
 */
const router = Router();

/** Kategorien, die auf diesem Konto tatsächlich benutzt werden. */
async function usedCategories(db: Awaited<ReturnType<typeof getDb>>, accountId: string) {
  const { rows } = await db.query(
    `SELECT DISTINCT c.id, c.name, c.color, c.icon, c.budget_limit
     FROM categories c
     WHERE c.id IN (
       SELECT category_id FROM expense_items WHERE account_id = ? AND category_id IS NOT NULL
       UNION
       SELECT category_id FROM transactions WHERE account_id = ? AND category_id IS NOT NULL
       UNION
       SELECT category_id FROM transaction_templates WHERE account_id = ? AND category_id IS NOT NULL
     )
     ORDER BY c.id`,
    [accountId, accountId, accountId]
  );
  return rows as any[];
}

// ── GET /api/accounts/:id/convert-preview ────────────────────────────────────
// „deine Historie wird sichtbar" ist abstrakt, „1.284 Buchungen seit 03.2021" ist
// es nicht. Die Aktion ist die einzige der Map ohne Backup-Netz — das
// automatische Datei-Backup hängt am Deployment und greift hier nicht.
router.get("/accounts/:id/convert-preview", async (req, res, next) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const role = await myRole(db, id, req.user!.id);
    if (role === null) return res.status(404).json({ error: "Account not found" });
    if (role !== "owner") {
      return res.status(403).json({ error: "Nur der Eigentümer kann dieses Konto umwandeln." });
    }

    const { rows: accRows } = await db.query("SELECT is_shared FROM accounts WHERE id = ?", [id]);
    if (accRows[0]?.is_shared) {
      return res.status(409).json({ error: "Dieses Konto ist bereits ein Gemeinschaftskonto." });
    }

    const count = async (sql: string, params: any[]) => Number((await db.query(sql, params)).rows[0].c);
    const [transactions, expenses, incomes, goals] = await Promise.all([
      count("SELECT COUNT(*) AS c FROM transactions WHERE account_id = ? OR counter_account_id = ?", [id, id]),
      count("SELECT COUNT(*) AS c FROM expense_items WHERE account_id = ?", [id]),
      count("SELECT COUNT(*) AS c FROM income_sources WHERE account_id = ?", [id]),
      count("SELECT COUNT(*) AS c FROM goals WHERE account_id = ?", [id]),
    ]);
    const { rows: oldest } = await db.query(
      "SELECT MIN(date) AS d FROM transactions WHERE account_id = ?",
      [id]
    );
    const cats = await usedCategories(db, id);

    res.json({
      transactions,
      expenses,
      incomes,
      goals,
      oldestTransaction: oldest[0]?.d ?? null,
      // `budget_limit` wird bewusst **nicht** mitkopiert: sonst würden aus einem
      // Deckel von 400 € stillschweigend 800 €, und beide Fortschrittsbalken
      // stünden entspannt bei 50 %.
      categories: cats.map((c) => ({
        name: c.name,
        budgetLost: c.budget_limit != null ? Number(c.budget_limit) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/accounts/:id/convert-to-shared ─────────────────────────────────
router.post("/accounts/:id/convert-to-shared", async (req, res, next) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const role = await myRole(db, id, req.user!.id);
    if (role === null) return res.status(404).json({ error: "Account not found" });
    if (role !== "owner") {
      return res.status(403).json({ error: "Nur der Eigentümer kann dieses Konto umwandeln." });
    }

    const { rows: accRows } = await db.query("SELECT is_shared FROM accounts WHERE id = ?", [id]);
    if (accRows[0]?.is_shared) {
      return res.status(409).json({ error: "Dieses Konto ist bereits ein Gemeinschaftskonto." });
    }

    const cats = await usedCategories(db, id);

    // **Atomar**: Flag setzen, Kategorien kopieren und drei Tabellen umhängen
    // gehören zusammen. Bräche der Lauf in der Mitte ab, stünde die halbe Kopie
    // im Kategoriensatz und ein Teil der Zeilen zeigte noch auf die Originale —
    // und diese Aktion hat als einzige der Map kein Backup-Netz.
    const copied = await db.transaction(async () => {
      // Kopiert werden **nur die tatsächlich benutzten** Kategorien; die Originale
      // bleiben stehen und bedienen die übrigen Konten weiter. Die Spaltung der
      // Kategorie-Historie *ist* die beschlossene Block-Trennung, kein Nebeneffekt.
      const mapping = new Map<number, number>();
      for (const c of cats) {
        const created = await db.run(
          // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist Urheber; die Sichtbarkeit dieser Kopie kommt aus account_id
          "INSERT INTO categories (name, color, icon, budget_limit, account_id, user_id) VALUES (?, ?, ?, NULL, ?, ?)",
          [c.name, c.color, c.icon ?? null, id, req.user!.id]
        );
        mapping.set(Number(c.id), Number(created.lastId));
      }
      if (cats.length === 0) {
        // Leeres Ergebnis fällt auf „Sonstiges" zurück — ohne mindestens eine
        // Kategorie ließe sich keine Fixkostenposition anlegen.
        await createDefaultSharedCategory(db, Number(id), req.user!.id);
      }

      // Zeilen mit `category_id IS NULL` bleiben NULL.
      for (const [oldId, newId] of mapping) {
        for (const table of ["expense_items", "transactions", "transaction_templates"]) {
          await db.run(
            `UPDATE ${table} SET category_id = ? WHERE account_id = ? AND category_id = ?`,
            [newId, id, oldId]
          );
        }
      }

      await db.run("UPDATE accounts SET is_shared = (1 = 1) WHERE id = ?", [id]);
      return cats.length;
    });

    res.json({ ok: true, copiedCategories: copied });
  } catch (err) {
    next(err);
  }
});

export default router;
