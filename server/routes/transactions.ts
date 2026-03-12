import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/transactions
router.get("/", async (req, res) => {
  const db = await getDb();
  const { type, month } = req.query;

  let sql = `
    SELECT
      t.*,
      c.name  AS cat_name,
      c.color AS cat_color,
      a.name  AS acc_name,
      a.color AS acc_color
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts   a ON a.id = t.account_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (type) {
    sql += " AND t.type = ?";
    params.push(type);
  }
  if (month) {
    sql += " AND t.date LIKE ?";
    params.push(`${month}-%`);
  }

  sql += " ORDER BY t.date DESC, t.id DESC";

  const { rows } = await db.query(sql, params);

  res.json(
    rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      label: r.label,
      amount: r.amount,
      type: r.type,
      categoryId: r.category_id,
      accountId: r.account_id,
      note: r.note || undefined,
      category: r.cat_name
        ? { id: r.category_id, name: r.cat_name, color: r.cat_color }
        : null,
      account: r.acc_name
        ? { id: r.account_id, name: r.acc_name, color: r.acc_color }
        : null,
    }))
  );
});

// POST /api/transactions
router.post("/", async (req, res) => {
  const { date, label, amount, type, categoryId, accountId, note } = req.body;
  if (!date || !label || amount == null || !type || !accountId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [date, label, amount, type, categoryId || null, accountId, note || null]
  );
  res.status(201).json({ id: result.lastId });
});

// PATCH /api/transactions/:id
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { date, label, amount, type, categoryId, accountId, note } = req.body;

  const db = await getDb();
  const { rows } = await db.query("SELECT id FROM transactions WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "Transaction not found" });

  const fields: string[] = [];
  const values: any[] = [];

  if (date !== undefined) { fields.push("date = ?"); values.push(date); }
  if (label !== undefined) { fields.push("label = ?"); values.push(label); }
  if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
  if (type !== undefined) { fields.push("type = ?"); values.push(type); }
  if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId || null); }
  if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
  if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  await db.run(
    `UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id]
  );
  res.json({ ok: true });
});

// DELETE /api/transactions/:id
router.delete("/:id", async (req, res) => {
  const db = await getDb();
  const result = await db.run("DELETE FROM transactions WHERE id = ?", [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Transaction not found" });
  res.json({ ok: true });
});

export default router;
