import { Router } from "express";
import db from "../db";

const router = Router();

// GET /api/categories
router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY id").all();
  res.json(
    rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon || undefined,
    }))
  );
});

// POST /api/categories
router.post("/", (req, res) => {
  const { name, color, icon } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  const result = db
    .prepare("INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)")
    .run(name, color, icon || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/categories/:id
router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { name, color, icon } = req.body;

  const existing = db.prepare("SELECT id FROM categories WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Category not found" });

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { fields.push("name = ?"); values.push(name); }
  if (color !== undefined) { fields.push("color = ?"); values.push(color); }
  if (icon !== undefined) { fields.push("icon = ?"); values.push(icon || null); }

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  db.prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
    id
  );
  res.json({ ok: true });
});

// DELETE /api/categories/:id
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  const expenseCount = db
    .prepare("SELECT COUNT(*) as c FROM expense_items WHERE category_id = ?")
    .get(id) as any;

  if (expenseCount.c > 0) {
    return res.status(409).json({
      error:
        "Kategorie kann nicht gelöscht werden, da noch Ausgaben darauf verweisen.",
    });
  }

  const result = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Category not found" });
  res.json({ ok: true });
});

export default router;
