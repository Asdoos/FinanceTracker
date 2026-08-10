import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { hybridPredicate, visibleAccounts } from "../lib/visibility";

const router = Router();

const GoalCreateSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).optional(),
  color: z.string().min(1).optional(),
  dueDate: z.string().nullable().optional(),
  accountId: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});
const GoalPatchSchema = GoalCreateSchema.partial();

// GET /api/goals
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(
      `SELECT g.*, a.name AS acc_name, a.color AS acc_color
       FROM goals g
       LEFT JOIN accounts a ON a.id = g.account_id
       WHERE ${hybridPredicate("g", acc.shared)}
       ORDER BY g.created_at DESC`,
      [req.user!.id]
    );
    res.json(
      (rows as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        targetAmount: r.target_amount,
        currentAmount: r.current_amount,
        color: r.color,
        dueDate: r.due_date ?? null,
        accountId: r.account_id ?? null,
        account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
        note: r.note ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/goals
router.post("/", async (req, res, next) => {
  try {
    const parsed = GoalCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, targetAmount, currentAmount, color, dueDate, accountId, note } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      // eslint-disable-next-line no-restricted-syntax -- goals: user_id trägt den NULL-Zweig des hybriden Prädikats
      `INSERT INTO goals (name, target_amount, current_amount, color, due_date, account_id, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, targetAmount, currentAmount ?? 0, color ?? "#3b82f6", dueDate ?? null, accountId ?? null, note ?? null, req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/goals/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = GoalPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(`SELECT id FROM goals WHERE id = ? AND ${hybridPredicate("", acc.shared)}`, [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Goal not found" });

    const { name, targetAmount, currentAmount, color, dueDate, accountId, note } = parsed.data;
    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (targetAmount !== undefined) { fields.push("target_amount = ?"); values.push(targetAmount); }
    if (currentAmount !== undefined) { fields.push("current_amount = ?"); values.push(currentAmount); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (dueDate !== undefined) { fields.push("due_date = ?"); values.push(dueDate ?? null); }
    if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId ?? null); }
    if (note !== undefined) { fields.push("note = ?"); values.push(note ?? null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(`UPDATE goals SET ${fields.join(", ")} WHERE id = ? AND ${hybridPredicate("", acc.shared)}`, [...values, id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/goals/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const result = await db.run(`DELETE FROM goals WHERE id = ? AND ${hybridPredicate("", acc.shared)}`, [req.params.id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Goal not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
