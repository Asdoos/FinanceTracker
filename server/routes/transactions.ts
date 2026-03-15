import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

const router = Router();

const TransactionCreateSchema = z.object({
  date: z.string().min(10),
  label: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  categoryId: z.number().int().nullable().optional(),
  accountId: z.number().int(),
  note: z.string().nullable().optional(),
});
const TransactionPatchSchema = TransactionCreateSchema.omit({ date: true }).partial().extend({
  date: z.string().min(10).optional(),
});

// GET /api/transactions
router.get("/", async (req, res, next) => {
  try {
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
      WHERE t.user_id = ?
    `;
    const params: any[] = [req.user!.id];

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
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions
router.post("/", async (req, res, next) => {
  try {
    const parsed = TransactionCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { date, label, amount, type, categoryId, accountId, note } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, label, amount, type, categoryId || null, accountId, note || null, req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/transactions/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = TransactionPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { date, label, amount, type, categoryId, accountId, note } = parsed.data;

    const db = await getDb();
    const { rows } = await db.query("SELECT id FROM transactions WHERE id = ? AND user_id = ?", [id, req.user!.id]);
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
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/transactions/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.run("DELETE FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Transaction not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
