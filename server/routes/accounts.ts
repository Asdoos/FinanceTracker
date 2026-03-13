import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/accounts
router.get("/", async (_req, res) => {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM accounts ORDER BY id");
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
    }))
  );
});

// POST /api/accounts
router.post("/", async (req, res) => {
  const { name, color, description, isDefault, freibetrag, freibetragYear, interestRate, interestRateUntil } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO accounts (name, color, description, is_default, freibetrag, freibetrag_year, interest_rate, interest_rate_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [name, color, description || null, isDefault ? 1 : 0, freibetrag ?? null, freibetragYear ?? null, interestRate ?? null, interestRateUntil ?? null]
  );
  res.status(201).json({ id: result.lastId });
});

// PATCH /api/accounts/:id
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, color, description, isDefault, freibetrag, freibetragYear, interestRate, interestRateUntil, actualBalance, actualBalanceDate } = req.body;

  const db = await getDb();
  const { rows } = await db.query("SELECT id FROM accounts WHERE id = ?", [id]);
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

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  await db.run(
    `UPDATE accounts SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id]
  );
  res.json({ ok: true });
});

// DELETE /api/accounts/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const { rows: expRows } = await db.query(
    "SELECT COUNT(*) as c FROM expense_items WHERE account_id = ?", [id]
  );
  const { rows: incRows } = await db.query(
    "SELECT COUNT(*) as c FROM income_sources WHERE account_id = ?", [id]
  );

  if (Number(expRows[0].c) > 0 || Number(incRows[0].c) > 0) {
    return res.status(409).json({
      error: "Konto kann nicht gelöscht werden, da noch Ausgaben oder Einnahmen darauf verweisen.",
    });
  }

  const result = await db.run("DELETE FROM accounts WHERE id = ?", [id]);
  if (result.changes === 0) return res.status(404).json({ error: "Account not found" });
  res.json({ ok: true });
});

export default router;
