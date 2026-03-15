import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

const router = Router();

const AccountCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  freibetrag: z.number().nullable().optional(),
  freibetragYear: z.number().int().nullable().optional(),
  interestRate: z.number().nullable().optional(),
  interestRateUntil: z.string().nullable().optional(),
  interestInterval: z.string().nullable().optional(),
});
const AccountPatchSchema = AccountCreateSchema.extend({
  actualBalance: z.number().nullable().optional(),
  actualBalanceDate: z.string().nullable().optional(),
}).partial();

// GET /api/accounts
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM accounts WHERE user_id = ? ORDER BY id", [req.user!.id]);
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        description: r.description || undefined,
        isDefault: !!r.is_default,
        freibetrag: r.freibetrag ?? null,
        freibetragYear: r.freibetrag_year ?? null,
        interestRate: r.interest_rate ?? null,
        interestRateUntil: r.interest_rate_until ?? null,
        actualBalance: r.actual_balance ?? null,
        actualBalanceDate: r.actual_balance_date ?? null,
        interestInterval: r.interest_interval ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/accounts
router.post("/", async (req, res, next) => {
  try {
    const parsed = AccountCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, color, description, isDefault, freibetrag, freibetragYear, interestRate, interestRateUntil, interestInterval } = parsed.data;
    const db = await getDb();
    const result = await db.run(
      "INSERT INTO accounts (name, color, description, is_default, freibetrag, freibetrag_year, interest_rate, interest_rate_until, interest_interval, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [name, color, description || null, isDefault ? 1 : 0, freibetrag ?? null, freibetragYear ?? null, interestRate ?? null, interestRateUntil ?? null, interestInterval ?? null, req.user!.id]
    );
    res.status(201).json({ id: result.lastId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/accounts/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed = AccountPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, color, description, isDefault, freibetrag, freibetragYear, interestRate, interestRateUntil, actualBalance, actualBalanceDate, interestInterval } = parsed.data;

    const db = await getDb();
    const { rows } = await db.query("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Account not found" });

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (description !== undefined) { fields.push("description = ?"); values.push(description || null); }
    if (isDefault !== undefined) { fields.push("is_default = ?"); values.push(isDefault ? 1 : 0); }
    if (freibetrag !== undefined) { fields.push("freibetrag = ?"); values.push(freibetrag ?? null); }
    if (freibetragYear !== undefined) { fields.push("freibetrag_year = ?"); values.push(freibetragYear ?? null); }
    if (interestRate !== undefined) { fields.push("interest_rate = ?"); values.push(interestRate ?? null); }
    if (interestRateUntil !== undefined) { fields.push("interest_rate_until = ?"); values.push(interestRateUntil ?? null); }
    if (actualBalance !== undefined) { fields.push("actual_balance = ?"); values.push(actualBalance ?? null); }
    if (actualBalanceDate !== undefined) { fields.push("actual_balance_date = ?"); values.push(actualBalanceDate ?? null); }
    if (interestInterval !== undefined) { fields.push("interest_interval = ?"); values.push(interestInterval ?? null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    await db.run(
      `UPDATE accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/accounts/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const { rows: expRows } = await db.query(
      "SELECT COUNT(*) as c FROM expense_items WHERE account_id = ? AND user_id = ?", [id, req.user!.id]
    );
    const { rows: incRows } = await db.query(
      "SELECT COUNT(*) as c FROM income_sources WHERE account_id = ? AND user_id = ?", [id, req.user!.id]
    );

    if (Number(expRows[0].c) > 0 || Number(incRows[0].c) > 0) {
      return res.status(409).json({
        error: "Konto kann nicht gelöscht werden, da noch Ausgaben oder Einnahmen darauf verweisen.",
      });
    }

    const result = await db.run("DELETE FROM accounts WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Account not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
