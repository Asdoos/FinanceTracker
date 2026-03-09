import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/expenses
router.get("/", async (_req, res) => {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT
       e.*,
       c.name  AS cat_name,
       c.color AS cat_color,
       a.name  AS acc_name,
       a.color AS acc_color
     FROM expense_items e
     LEFT JOIN categories c ON c.id = e.category_id
     LEFT JOIN accounts   a ON a.id = e.account_id
     ORDER BY e.id`
  );

  // Compute total for shareOfTotal
  const totalMonthly = rows
    .filter((r: any) => r.is_active)
    .reduce(
      (sum: number, r: any) =>
        sum + (r.type === "annual" ? r.amount / 12 : r.amount),
      0
    );

  res.json(
    rows.map((r: any) => {
      const monthlyAmount = r.type === "annual" ? r.amount / 12 : r.amount;
      return {
        id: r.id,
        label: r.label,
        amount: r.amount,
        type: r.type,
        categoryId: r.category_id,
        accountId: r.account_id,
        isActive: !!r.is_active,
        note: r.note || undefined,
        endDate: r.end_date || null,
        monthlyAmount,
        shareOfTotal:
          totalMonthly > 0 ? (monthlyAmount / totalMonthly) * 100 : 0,
        category: r.cat_name
          ? { id: r.category_id, name: r.cat_name, color: r.cat_color }
          : null,
        account: r.acc_name
          ? { id: r.account_id, name: r.acc_name, color: r.acc_color }
          : null,
      };
    })
  );
});

// POST /api/expenses
router.post("/", async (req, res) => {
  const { label, amount, type, categoryId, accountId, isActive, note, endDate } = req.body;
  if (!label || amount == null || !type || !categoryId || !accountId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO expense_items (label, amount, type, category_id, account_id, is_active, note, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [label, amount, type, categoryId, accountId, isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null, endDate || null]
  );
  res.status(201).json({ id: result.lastId });
});

// PATCH /api/expenses/:id
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { label, amount, type, categoryId, accountId, isActive, note, endDate } = req.body;

  const db = await getDb();
  const { rows } = await db.query("SELECT id FROM expense_items WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "Expense not found" });

  const fields: string[] = [];
  const values: any[] = [];

  if (label !== undefined) { fields.push("label = ?"); values.push(label); }
  if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
  if (type !== undefined) { fields.push("type = ?"); values.push(type); }
  if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId); }
  if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
  if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
  if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
  if (endDate !== undefined) { fields.push("end_date = ?"); values.push(endDate || null); }

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  await db.run(
    `UPDATE expense_items SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id]
  );
  res.json({ ok: true });
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  const db = await getDb();
  const result = await db.run("DELETE FROM expense_items WHERE id = ?", [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Expense not found" });
  res.json({ ok: true });
});

export default router;
