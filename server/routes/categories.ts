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
router.get("/", async (_req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM categories ORDER BY id");
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
      "INSERT INTO categories (name, color, icon, budget_limit) VALUES (?, ?, ?, ?)",
      [name, color, icon || null, budget ?? null]
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
    const { rows } = await db.query("SELECT id FROM categories WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Category not found" });

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (icon !== undefined) { fields.push("icon = ?"); values.push(icon || null); }
    if (budget !== undefined) { fields.push("budget_limit = ?"); values.push(budget ?? null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`,
      [...values, id]
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

    const { rows } = await db.query(
      "SELECT COUNT(*) as c FROM expense_items WHERE category_id = ?", [id]
    );

    if (Number(rows[0].c) > 0) {
      return res.status(409).json({
        error: "Kategorie kann nicht gelöscht werden, da noch Ausgaben darauf verweisen.",
      });
    }

    const result = await db.run("DELETE FROM categories WHERE id = ?", [id]);
    if (result.changes === 0) return res.status(404).json({ error: "Category not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
