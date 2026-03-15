import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

const router = Router();

const ExpenseCreateSchema = z.object({
  label: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["monthly", "annual"]),
  categoryId: z.number().int().nullable().optional(),
  accountId: z.number().int(),
  isActive: z.boolean().optional(),
  note: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  dueMonth: z.number().int().min(1).max(12).nullable().optional(),
});
const ExpensePatchSchema = ExpenseCreateSchema.partial();

// GET /api/expenses
router.get("/", async (req, res, next) => {
  try {
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
       WHERE e.user_id = ?
       ORDER BY e.id`,
      [req.user!.id]
    );

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
          dueMonth: r.due_month ?? null,
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
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses
router.post("/", async (req, res, next) => {
  try {
    const parsed = ExpenseCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { label, amount, type, categoryId, accountId, isActive, note, endDate, dueMonth } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO expense_items (label, amount, type, category_id, account_id, is_active, note, end_date, due_month, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [label, amount, type, categoryId, accountId, isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null, endDate || null, dueMonth ?? null, req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/expenses/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = ExpensePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { label, amount, type, categoryId, accountId, isActive, note, endDate, dueMonth } = parsed.data;

    const db = await getDb();
    const { rows } = await db.query("SELECT id FROM expense_items WHERE id = ? AND user_id = ?", [id, req.user!.id]);
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
    if (dueMonth !== undefined) { fields.push("due_month = ?"); values.push(dueMonth ?? null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(
      `UPDATE expense_items SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.run("DELETE FROM expense_items WHERE id = ? AND user_id = ?", [req.params.id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Expense not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
