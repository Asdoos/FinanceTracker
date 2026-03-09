import { Router } from "express";
import db from "../db";

const router = Router();

// GET /api/income
router.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         i.*,
         a.name  AS acc_name,
         a.color AS acc_color
       FROM income_sources i
       LEFT JOIN accounts a ON a.id = i.account_id
       ORDER BY i.id`
    )
    .all() as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      amount: r.amount,
      type: r.type,
      accountId: r.account_id,
      isActive: !!r.is_active,
      note: r.note || undefined,
      monthlyAmount: r.type === "annual" ? r.amount / 12 : r.amount,
      account: r.acc_name
        ? { id: r.account_id, name: r.acc_name, color: r.acc_color }
        : null,
    }))
  );
});

// POST /api/income
router.post("/", (req, res) => {
  const { label, amount, type, accountId, isActive, note } = req.body;
  if (!label || amount == null || !type || !accountId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const result = db
    .prepare(
      `INSERT INTO income_sources (label, amount, type, account_id, is_active, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      label,
      amount,
      type,
      accountId,
      isActive !== undefined ? (isActive ? 1 : 0) : 1,
      note || null
    );
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/income/:id
router.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { label, amount, type, accountId, isActive, note } = req.body;

  const existing = db
    .prepare("SELECT id FROM income_sources WHERE id = ?")
    .get(id);
  if (!existing) return res.status(404).json({ error: "Income not found" });

  const fields: string[] = [];
  const values: any[] = [];

  if (label !== undefined) { fields.push("label = ?"); values.push(label); }
  if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
  if (type !== undefined) { fields.push("type = ?"); values.push(type); }
  if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
  if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
  if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }

  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  db.prepare(
    `UPDATE income_sources SET ${fields.join(", ")} WHERE id = ?`
  ).run(...values, id);
  res.json({ ok: true });
});

// DELETE /api/income/:id
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM income_sources WHERE id = ?")
    .run(req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: "Income not found" });
  res.json({ ok: true });
});

export default router;
