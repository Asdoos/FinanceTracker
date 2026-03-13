import { Router } from "express";
import { getDb } from "../db";

const router = Router();

const SELECT_SQL = `
  SELECT t.id, t.label, t.amount, t.type, t.category_id, t.account_id, t.note,
         c.name AS cat_name, c.color AS cat_color,
         a.name AS acc_name, a.color AS acc_color
  FROM transaction_templates t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts   a ON a.id = t.account_id
`;

function mapRow(r: any) {
  return {
    id: r.id,
    label: r.label,
    amount: r.amount,
    type: r.type,
    categoryId: r.category_id,
    accountId: r.account_id,
    note: r.note || null,
    category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
    account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
  };
}

// GET /api/templates[?type=income|expense]
router.get("/", async (req, res) => {
  const db = await getDb();
  const { type } = req.query;
  let sql = SELECT_SQL;
  const params: any[] = [];
  if (type) {
    sql += " WHERE t.type = ?";
    params.push(type);
  }
  sql += " ORDER BY t.id DESC";
  const { rows } = await db.query(sql, params);
  res.json((rows as any[]).map(mapRow));
});

// POST /api/templates
router.post("/", async (req, res) => {
  const { label, amount, type, categoryId, accountId, note } = req.body;
  if (!label || amount == null || !type || !accountId) {
    return res.status(400).json({ error: "label, amount, type, accountId are required" });
  }
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO transaction_templates (label, amount, type, category_id, account_id, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [label, amount, type, categoryId || null, accountId, note || null]
  );
  res.status(201).json({ id: result.lastId });
});

// PATCH /api/templates/:id
router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const db = await getDb();
  const { rows } = await db.query("SELECT id FROM transaction_templates WHERE id = ?", [id]);
  if ((rows as any[]).length === 0) return res.status(404).json({ error: "Not found" });

  const fields: string[] = [];
  const values: any[] = [];
  const { label, amount, type, categoryId, accountId, note } = req.body;
  if (label !== undefined) { fields.push("label = ?"); values.push(label); }
  if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
  if (type !== undefined) { fields.push("type = ?"); values.push(type); }
  if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId || null); }
  if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
  if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  await db.run(`UPDATE transaction_templates SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
  res.json({ ok: true });
});

// DELETE /api/templates/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const db = await getDb();
  const result = await db.run("DELETE FROM transaction_templates WHERE id = ?", [id]);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
