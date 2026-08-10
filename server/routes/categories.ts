import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { hybridPredicate, visibleAccounts } from "../lib/visibility";

const router = Router();

const CategoryCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().optional(),
  budget: z.number().nonnegative().nullable().optional(),
  // Ein Gemeinschaftskonto hat seinen eigenen Kategoriensatz. `null` heißt
  // persönlich — der NULL-Zweig des hybriden Prädikats.
  accountId: z.number().int().nullable().optional(),
});
const CategoryPatchSchema = CategoryCreateSchema.partial();

// GET /api/categories
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(`SELECT * FROM categories WHERE ${hybridPredicate("", acc.shared)} ORDER BY id`, [req.user!.id]);
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon || undefined,
        budget: r.budget_limit ?? null,
        // Der Raum der Kategorie: null = persönlich, sonst das Gemeinschaftskonto.
        accountId: r.account_id ?? null,
        budgetSetBy: r.budget_set_by ?? null,
        budgetSetAt: r.budget_set_at ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
router.post("/", async (req, res, next) => {
  try {
    const parsed = CategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, color, icon, budget, accountId } = parsed.data;
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    // Ein Kategoriensatz gehört entweder mir persönlich oder einem
    // Gemeinschaftskonto, das ich sehe. Etwas Drittes gibt es nicht.
    if (accountId != null && !acc.shared.includes(Number(accountId))) {
      return res.status(400).json({ error: "Dieses Gemeinschaftskonto siehst du nicht." });
    }
    const result = await db.run(
      // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist Urheber und zugleich Sichtbarkeitsschlüssel des NULL-Zweigs
      "INSERT INTO categories (name, color, icon, budget_limit, account_id, budget_set_by, budget_set_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, color, icon || null, budget ?? null, accountId ?? null,
       budget != null ? req.user!.id : null, budget != null ? new Date().toISOString() : null,
       req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/categories/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = CategoryPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, color, icon, budget } = parsed.data;

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(`SELECT id FROM categories WHERE id = ? AND ${hybridPredicate("", acc.shared)}`, [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Category not found" });

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (icon !== undefined) { fields.push("icon = ?"); values.push(icon || null); }
    if (budget !== undefined) {
      fields.push("budget_limit = ?"); values.push(budget ?? null);
      // Wer den Deckel gesetzt hat, steht am Gemeinschaftskonto in einer eigenen Spalte.
      fields.push("budget_set_by = ?"); values.push(budget != null ? req.user!.id : null);
      fields.push("budget_set_at = ?"); values.push(budget != null ? new Date().toISOString() : null);
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ? AND ${hybridPredicate("", acc.shared)}`,
      [...values, id, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);

    // Alle drei referenzierenden Tabellen zählen — eine Buchung oder Vorlage rutschte
    // bisher durch den Check und ließ den DELETE am Fremdschlüssel auflaufen (500 statt 409).
    // Bewusst **ohne** `user_id`-Filter: der Fremdschlüssel sieht fremde Verweise sehr wohl,
    // der alte Filter war der zweite Teil des Fehlers. (In v0.26 wird daraus die Regel
    // „urheberunabhängig blockieren".)
    const [{ rows: expRows }, { rows: txRows }, { rows: tplRows }] = await Promise.all([
      db.query("SELECT COUNT(*) as c FROM expense_items WHERE category_id = ?", [id]),
      db.query("SELECT COUNT(*) as c FROM transactions WHERE category_id = ?", [id]),
      db.query("SELECT COUNT(*) as c FROM transaction_templates WHERE category_id = ?", [id]),
    ]);
    const references =
      Number(expRows[0].c) + Number(txRows[0].c) + Number(tplRows[0].c);

    if (references > 0) {
      return res.status(409).json({
        error:
          "Kategorie kann nicht gelöscht werden, da noch Ausgaben, Buchungen oder Vorlagen darauf verweisen.",
      });
    }

    const result = await db.run(`DELETE FROM categories WHERE id = ? AND ${hybridPredicate("", acc.shared)}`, [id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Category not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
