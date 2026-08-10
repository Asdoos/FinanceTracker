import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { BOOL_PARAM } from "../db/sql";
import { ensureOwnerMembership, MEMBERSHIP_FIELDS } from "../lib/members";

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

/**
 * Setzt die Default-Markierung aller *anderen* Mitgliedschaften des Nutzers zurück.
 *
 * `is_default` ist seit v0.26 eine **persönliche Präferenz an der Mitgliedschaft**,
 * nicht mehr eine Eigenschaft des Kontos — zwei Mitglieder desselben
 * Gemeinschaftskontos dürfen es unterschiedlich sehen.
 *
 * Läuft immer **vor** dem Setzen des neuen Defaults: bricht der zweite Schritt ab,
 * hat der Nutzer kein Default-Konto — was die Invariante „höchstens eines" erfüllt.
 * Umgekehrte Reihenfolge könnte zwei hinterlassen und den partiellen Unique-Index
 * verletzen.
 */
async function clearOtherDefaults(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  exceptAccountId?: string | number
): Promise<void> {
  if (exceptAccountId !== undefined) {
    await db.run(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
      `UPDATE account_members SET is_default = ${BOOL_PARAM} WHERE user_id = ? AND account_id <> ?`,
      [0, userId, exceptAccountId]
    );
  } else {
    await db.run(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
      `UPDATE account_members SET is_default = ${BOOL_PARAM} WHERE user_id = ?`,
      [0, userId]
    );
  }
}

/**
 * Konto-Zeile plus **meine** Mitgliedschaftswerte, flach zusammengeführt.
 *
 * Die flache Variante lässt jede Lesestelle im Frontend und im MCP unverändert.
 * Preis: dieselben Feldnamen bedeuten jetzt „mein Wert" — siehe CLAUDE.md.
 */
function accountPayload(r: any) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    description: r.description || undefined,
    isShared: !!r.is_shared,
    isDefault: !!r.member_is_default,
    freibetrag: r.member_freibetrag ?? null,
    freibetragYear: r.member_freibetrag_year ?? null,
    interestRate: r.interest_rate ?? null,
    interestRateUntil: r.interest_rate_until ?? null,
    actualBalance: r.actual_balance ?? null,
    actualBalanceDate: r.actual_balance_date ?? null,
    interestInterval: r.interest_interval ?? null,
  };
}

// GET /api/accounts
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
      `SELECT a.*, ${MEMBERSHIP_FIELDS}
       FROM accounts a
       LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ?
       WHERE a.user_id = ?
       ORDER BY a.id`,
      [req.user!.id, req.user!.id]
    );
    res.json(rows.map(accountPayload));
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
    if (isDefault) await clearOtherDefaults(db, req.user!.id);
    const result = await db.run(
      // eslint-disable-next-line no-restricted-syntax -- Besitz-Spalte auf accounts, siehe CLAUDE.md
      "INSERT INTO accounts (name, color, description, interest_rate, interest_rate_until, interest_interval, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, color, description || null, interestRate ?? null, interestRateUntil ?? null, interestInterval ?? null, req.user!.id]
    );

    // Eine der drei Stellen, an denen die Owner-Mitgliedschaft hergestellt wird —
    // sie ist eine Invariante, kein einmaliger Backfill.
    await ensureOwnerMembership(db, result.lastId, req.user!.id);
    await db.run(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
      `UPDATE account_members SET freibetrag = ?, freibetrag_year = ?, is_default = ${BOOL_PARAM}
       WHERE account_id = ? AND user_id = ?`,
      [freibetrag ?? null, freibetragYear ?? null, isDefault ? 1 : 0, result.lastId, req.user!.id]
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
    // eslint-disable-next-line no-restricted-syntax -- Besitz-Spalte; das Sichtbarkeitsprädikat folgt in Phase B
    const { rows } = await db.query("SELECT id FROM accounts WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Account not found" });

    // ── Ein Endpunkt, zwei Ziele: Stammdaten ans Konto, ──────────────────────
    const fields: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (color !== undefined) { fields.push("color = ?"); values.push(color); }
    if (description !== undefined) { fields.push("description = ?"); values.push(description || null); }
    if (interestRate !== undefined) { fields.push("interest_rate = ?"); values.push(interestRate ?? null); }
    if (interestRateUntil !== undefined) { fields.push("interest_rate_until = ?"); values.push(interestRateUntil ?? null); }
    if (actualBalance !== undefined) { fields.push("actual_balance = ?"); values.push(actualBalance ?? null); }
    if (actualBalanceDate !== undefined) { fields.push("actual_balance_date = ?"); values.push(actualBalanceDate ?? null); }
    if (interestInterval !== undefined) { fields.push("interest_interval = ?"); values.push(interestInterval ?? null); }
    // Der Saldo-Anker hält seinen Urheber — am Gemeinschaftskonto verschiebt ein
    // Abgleich sonst stillschweigend fremde Zahlen.
    if (actualBalance !== undefined) { fields.push("actual_balance_by = ?"); values.push(req.user!.id); }

    // ── … und die persönlichen Werte in *meine* Mitgliedschaft ──────────────
    const memberFields: string[] = [];
    const memberValues: any[] = [];
    if (freibetrag !== undefined) { memberFields.push("freibetrag = ?"); memberValues.push(freibetrag ?? null); }
    if (freibetragYear !== undefined) { memberFields.push("freibetrag_year = ?"); memberValues.push(freibetragYear ?? null); }
    if (isDefault !== undefined) { memberFields.push(`is_default = ${BOOL_PARAM}`); memberValues.push(isDefault ? 1 : 0); }

    if (fields.length === 0 && memberFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (isDefault) await clearOtherDefaults(db, req.user!.id, id);

    if (fields.length > 0) {
      await db.run(
        // eslint-disable-next-line no-restricted-syntax -- Besitz-Spalte; das Sichtbarkeitsprädikat folgt in Phase B
        `UPDATE accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
        [...values, id, req.user!.id]
      );
    }
    if (memberFields.length > 0) {
      await db.run(
        // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
        `UPDATE account_members SET ${memberFields.join(", ")} WHERE account_id = ? AND user_id = ?`,
        [...memberValues, id, req.user!.id]
      );
    }
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

    // Bewusst **ohne** Urheber-Filter: sonst zählt der Check die Fixkosten des
    // Partners nicht und lässt ein Konto löschen, an dem noch Daten hängen.
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

    // eslint-disable-next-line no-restricted-syntax -- Besitz-Spalte; Owner-Vorbehalt folgt in Phase B
    const result = await db.run("DELETE FROM accounts WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (result.changes === 0) return res.status(404).json({ error: "Account not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
