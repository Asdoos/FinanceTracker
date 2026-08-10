import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { signedAmount } from "../lib/transactions";

const router = Router();

const TransactionCreateSchema = z.object({
  date: z.string().min(10),
  label: z.string().min(1),
  amount: z.number().positive(),
  // eslint-disable-next-line no-restricted-syntax -- die Typ-Achse der API; hier stehen die Namen zwangsläufig
  type: z.enum(["income", "expense", "transfer"]),
  categoryId: z.number().int().nullable().optional(),
  accountId: z.number().int(),
  counterAccountId: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});
const TransactionPatchSchema = TransactionCreateSchema.omit({ date: true }).partial().extend({
  date: z.string().min(10).optional(),
});

const isTransfer = (type: string) => type === "transfer";

/**
 * Prüft die Konto-Bindung einer Buchung und liefert die Werte, die geschrieben
 * werden dürfen.
 *
 * Ein Transfer trägt **keine** Kategorie — das ist keine Präferenz, sondern eine
 * Modell-Konsequenz: er hat zwei Konten in möglicherweise verschiedenen
 * Kategorienräumen, die Frage „aus welchem Raum" hat keine Antwort. Deshalb
 * serverseitig erzwungen und nicht bloß im Formular ausgelassen.
 */
async function resolveAccounts(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  type: string,
  accountId: number,
  counterAccountId: number | null | undefined,
  categoryId: number | null | undefined
): Promise<{ error: string } | { counterAccountId: number | null; categoryId: number | null }> {
  if (!isTransfer(type)) {
    if (counterAccountId != null) {
      return { error: "Ein Gegenkonto gibt es nur bei Übertragungen." };
    }
    return { counterAccountId: null, categoryId: categoryId ?? null };
  }

  if (counterAccountId == null) {
    return { error: "Eine Übertragung braucht ein Gegenkonto." };
  }
  if (counterAccountId === accountId) {
    // Keine Richtungs-Einschränkung — aber Quelle und Ziel *identisch* ist keine
    // Richtung, sondern eine Zeile, die die Vorzeichen-Regel nicht abbilden kann:
    // sie zählt als reiner Abfluss und würde den Kontostand still halbieren.
    return { error: "Quelle und Ziel einer Übertragung müssen verschiedene Konten sein." };
  }

  // Beide Konten müssen dem Nutzer gehören (in v0.26 wird daraus „beide im
  // Sichtbarkeitsraum").
  const { rows } = await db.query(
    "SELECT id FROM accounts WHERE user_id = ? AND (id = ? OR id = ?)",
    [userId, accountId, counterAccountId]
  );
  if (rows.length < 2) {
    return { error: "Beide Konten einer Übertragung müssen dir gehören." };
  }

  return { counterAccountId, categoryId: null };
}

/**
 * Laufender Saldo je Zeile, gerechnet **vom Anker** — dem zuletzt abgeglichenen
 * Kontostand, der für das *Ende* seines Stichtags gilt.
 *
 * Bis zur ältesten Buchung durchgerechnet: bräche die Reihe am Ankertag ab,
 * würde ein Abgleich die Darstellung der Vergangenheit löschen. Ohne Anker bleibt
 * die Spalte leer — eine Rechnung ab 0 wäre eine andere Größe unter demselben Namen
 * und nähme den Anlass, je abzugleichen.
 */
function runningBalances(rows: any[], accountId: number, anchor: number, anchorDate: string): Map<number, number> {
  const result = new Map<number, number>();
  const ascending = [...rows].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
  );

  // Rückwärts vom Anker durch alles, was am Stichtag oder davor liegt.
  const upToAnchor = ascending.filter((r) => String(r.date) <= anchorDate);
  let balance = anchor;
  for (let i = upToAnchor.length - 1; i >= 0; i--) {
    result.set(Number(upToAnchor[i].id), balance);
    balance -= signedAmount(upToAnchor[i], accountId);
  }

  // Vorwärts vom Anker durch alles danach.
  balance = anchor;
  for (const row of ascending.filter((r) => String(r.date) > anchorDate)) {
    balance += signedAmount(row, accountId);
    result.set(Number(row.id), balance);
  }

  return result;
}

// GET /api/transactions?accountId=&type=&month=
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const { type, month } = req.query;
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string, 10) : null;

    let sql = `
      SELECT
        t.*,
        c.name  AS cat_name,
        c.color AS cat_color,
        a.name  AS acc_name,
        a.color AS acc_color,
        ca.name  AS counter_name,
        ca.color AS counter_color
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts   a ON a.id = t.account_id
      LEFT JOIN accounts  ca ON ca.id = t.counter_account_id
      WHERE t.user_id = ?
    `;
    const params: any[] = [req.user!.id];

    if (accountId !== null && !isNaN(accountId)) {
      // Beide Spalten: eine Übertragung erscheint im Auszug *beider* Konten.
      sql += " AND (t.account_id = ? OR t.counter_account_id = ?)";
      params.push(accountId, accountId);
    }
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

    // Der laufende Saldo trägt genau dann einen Wert, wenn die Liste der
    // lückenlose Auszug *eines* Kontos ist: ein Konto gewählt, keine Verengung
    // auf Typ oder Monat. Such- und Kategoriefilter bleiben clientseitig und
    // schalten die Spalte dort aus — der Client rechnet nicht.
    let balances = new Map<number, number>();
    const gaplessStatement = accountId !== null && !isNaN(accountId) && !type && !month;
    if (gaplessStatement) {
      const { rows: accRows } = await db.query(
        "SELECT actual_balance, actual_balance_date FROM accounts WHERE id = ? AND user_id = ?",
        [accountId, req.user!.id]
      );
      const anchor = accRows[0]?.actual_balance;
      if (anchor !== null && anchor !== undefined) {
        balances = runningBalances(
          rows,
          accountId,
          Number(anchor),
          accRows[0].actual_balance_date ?? ""
        );
      }
    }

    res.json(
      rows.map((r: any) => ({
        id: r.id,
        date: r.date,
        label: r.label,
        amount: r.amount,
        type: r.type,
        categoryId: r.category_id,
        accountId: r.account_id,
        counterAccountId: r.counter_account_id ?? null,
        note: r.note || undefined,
        category: r.cat_name
          ? { id: r.category_id, name: r.cat_name, color: r.cat_color }
          : null,
        account: r.acc_name
          ? { id: r.account_id, name: r.acc_name, color: r.acc_color }
          : null,
        counterAccount: r.counter_name
          ? { id: r.counter_account_id, name: r.counter_name, color: r.counter_color }
          : null,
        // Nur im lückenlosen Auszug gesetzt, sonst null.
        runningBalance: balances.get(Number(r.id)) ?? null,
        // Vorzeichen aus Sicht des gewählten Kontos — eine Übertragung steht im
        // Auszug beider Konten, mit umgekehrtem Vorzeichen, aber als *eine* Buchung.
        signedAmount:
          accountId !== null && !isNaN(accountId) ? signedAmount(r, accountId) : null,
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
    const { date, label, amount, type, categoryId, accountId, counterAccountId, note } = parsed.data;

    const db = await getDb();
    const resolved = await resolveAccounts(db, req.user!.id, type, accountId, counterAccountId, categoryId);
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });

    const result = await db.run(
      `INSERT INTO transactions (date, label, amount, type, category_id, account_id, counter_account_id, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, label, amount, type, resolved.categoryId, accountId, resolved.counterAccountId, note || null, req.user!.id]
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
    const { date, label, amount, type, categoryId, accountId, counterAccountId, note } = parsed.data;

    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM transactions WHERE id = ? AND user_id = ?", [id, req.user!.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Transaction not found" });
    const current = rows[0];

    // Gegen den *zusammengeführten* Zustand prüfen, nicht gegen die Nutzlast: sonst
    // könnte ein Teil-Patch eine Zeile in eine Form bringen, die POST nie erlaubt hätte.
    const mergedType = type ?? current.type;
    const mergedAccountId = accountId ?? Number(current.account_id);
    const mergedCounter = counterAccountId !== undefined ? counterAccountId : current.counter_account_id ?? null;
    const mergedCategory = categoryId !== undefined ? categoryId : current.category_id ?? null;
    const resolved = await resolveAccounts(
      db, req.user!.id, mergedType, mergedAccountId, mergedCounter, mergedCategory
    );
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });

    const fields: string[] = [];
    const values: any[] = [];

    if (date !== undefined) { fields.push("date = ?"); values.push(date); }
    if (label !== undefined) { fields.push("label = ?"); values.push(label); }
    if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
    if (type !== undefined) { fields.push("type = ?"); values.push(type); }
    if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
    if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
    // Kategorie und Gegenkonto kommen aus der Prüfung, nicht aus der Nutzlast — ein
    // Typwechsel muss sie auch dann bereinigen, wenn der Aufrufer sie nicht mitschickt.
    fields.push("category_id = ?"); values.push(resolved.categoryId);
    fields.push("counter_account_id = ?"); values.push(resolved.counterAccountId);

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
