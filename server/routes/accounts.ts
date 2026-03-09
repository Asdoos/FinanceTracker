import { Router } from "express";
import db from "../db";

const router = Router();

// GET /api/accounts
router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY id").all();
  res.json(
    rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description || undefined,
      isDefault: !!r.is_default,
    }))
  );
});

// POST /api/accounts
router.post("/", (req, res) => {
  const { name, color, description, isDefault } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  const result = db
    .prepare(
      "INSERT INTO accounts (name, color, description, is_default) VALUES (?, ?, ?, ?)"
    )
    .run(name, color, description || null, isDefault ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/accounts/:id
router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { name, color, description, isDefault } = req.body;

  const existing = db.prepare("SELECT id FROM accounts WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Account not found" });

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { fields.push("name = ?"); values.push(name); }
  if (color !== undefined) { fields.push("color = ?"); values.push(color); }
  if (description !== undefined) { fields.push("description = ?"); values.push(description || null); }
  if (isDefault !== undefined) { fields.push("is_default = ?"); values.push(isDefault ? 1 : 0); }

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  db.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
    id
  );
  res.json({ ok: true });
});

// DELETE /api/accounts/:id
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  // Check for dependent records
  const expenseCount = db
    .prepare("SELECT COUNT(*) as c FROM expense_items WHERE account_id = ?")
    .get(id) as any;
  const incomeCount = db
    .prepare("SELECT COUNT(*) as c FROM income_sources WHERE account_id = ?")
    .get(id) as any;

  if (expenseCount.c > 0 || incomeCount.c > 0) {
    return res.status(409).json({
      error:
        "Konto kann nicht gelöscht werden, da noch Ausgaben oder Einnahmen darauf verweisen.",
    });
  }

  const result = db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Account not found" });
  res.json({ ok: true });
});

export default router;
