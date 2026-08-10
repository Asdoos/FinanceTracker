import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

const router = Router();

const CategoryCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().optional(),
  budget: z.number().nonnegative().nullable().optional(),
});
const CategoryPatchSchema = CategoryCreateSchema.partial();

// GET /api/categories
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
    const { rows } = await db.query("SELECT * FROM categories WHERE user_id = ? ORDER BY id", [req.user!.id]);
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon || undefined,
        budget: r.budget_limit ?? null,
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
    const { name, color, icon, budget } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
      "INSERT INTO categories (name, color, icon, budget_limit, user_id) VALUES (?, ?, ?, ?, ?)",
      [name, color, icon || null, budget ?? null, req.user!.id]
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
    // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
    const { rows } = await db.query("SELECT id FROM categories WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Category not found" });

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (icon !== undefined) { fields.push("icon = ?"); values.push(icon || null); }
    if (budget !== undefined) { fields.push("budget_limit = ?"); values.push(budget ?? null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(
      // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
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

    // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
    const result = await db.run("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Category not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
