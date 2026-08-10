import { Router } from "express";
import { getDb } from "../db";
import { accountIn, transactionReadPredicate, visibleAccounts } from "../lib/visibility";
import { EXCLUDE_TRANSFERS_SQL } from "../lib/transactions";
import { idList } from "../lib/visibility";

/**
 * Monat bzw. Tag eines lokalen Datums als `YYYY-MM` / `YYYY-MM-DD`.
 *
 * **Nicht über `toISOString()`:** das rechnet nach UTC um, und östlich von
 * Greenwich fällt der 1. eines Monats damit auf den Vormonat zurück. Die Monatsliste
 * des Budget-Vergleichs war dadurch um einen Monat verschoben — bei `months=1`
 * zeigte sie Juli statt August.
 */
const localMonth = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const localDay = (d: Date) => `${localMonth(d)}-${String(d.getDate()).padStart(2, "0")}`;

const router = Router();

// Zwei Varianten, weil die Queries teils mit, teils ohne Alias auf transactions gehen.
const readPredicate = transactionReadPredicate();
const readPredicateT = transactionReadPredicate("t");

/**
 * Der Raum, dessen Zeitreihe geliefert wird.
 *
 * `/api/summary` ist ein Snapshot und kann alle Räume auf einmal liefern;
 * `/api/stats` ist eine **Zeitreihe über zwei Endpoints** (Monate × Räume) — ein
 * Schnitt über zwei Listen im Client wäre hier nicht bildbar. Deshalb ein
 * Server-Parameter.
 *
 * Ein unbekannter Wert fällt auf „persönlich" **zurück statt 403**: die Seite soll
 * nicht scheitern, weil ein Link veraltet ist.
 */
function resolveRoom(raum: unknown, acc: { personal: number[]; shared: number[] }) {
  const id = typeof raum === "string" ? parseInt(raum, 10) : NaN;
  if (Number.isInteger(id) && acc.shared.includes(id)) {
    return { ids: [id], isShared: true as const };
  }
  return { ids: acc.personal, isShared: false as const };
}

// GET /api/stats?months=12  (0 = all time)
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const room = resolveRoom(req.query.raum, acc);
    const monthsRaw = parseInt(req.query.months as string);
    const months = isNaN(monthsRaw) ? 12 : monthsRaw;

    // Compute cutoff date for "last N months" (0 = no limit)
    let cutoff: string | null = null;
    if (months > 0) {
      const now = new Date();
      cutoff = localDay(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
    }

    // ── 1. Monthly totals ───────────────────────────────────────────────
    const monthlyParams: any[] = [];
    // Übertragungen fallen auf SQL-Ebene heraus. Der `else`-Zweig unten machte
    // bisher alles Unbekannte zur Ausgabe — ein Transfer wäre dort stillschweigend
    // gelandet.
    let monthlyWhere = `WHERE ${readPredicate(room.ids)} AND ${EXCLUDE_TRANSFERS_SQL}`;
    if (cutoff) {
      monthlyWhere += " AND date >= ?";
      monthlyParams.push(cutoff);
    }

    const { rows: monthlyRaw } = await db.query(
      `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
       FROM transactions
       ${monthlyWhere}
       GROUP BY substr(date, 1, 7), type
       ORDER BY month ASC`,
      monthlyParams
    );

    // Merge income/expense rows into one entry per month
    const monthMap = new Map<string, { income: number; expenses: number }>();
    for (const row of monthlyRaw as any[]) {
      if (!monthMap.has(row.month)) {
        monthMap.set(row.month, { income: 0, expenses: 0 });
      }
      const entry = monthMap.get(row.month)!;
      // eslint-disable-next-line no-restricted-syntax -- Auslesen einer nach `type` gruppierten SQL-Summe; Übertragungen sind bereits per WHERE ausgeschlossen und können den else-Zweig nicht mehr treffen
      if (row.type === "income") entry.income = Number(row.total);
      else entry.expenses = Number(row.total);
    }

    const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({
      month,
      income: v.income,
      expenses: v.expenses,
      net: v.income - v.expenses,
    }));

    // ── 2. Category breakdown (expenses only) ──────────────────────────
    const catParams: any[] = [];
    let catWhere = `WHERE t.type = 'expense' AND ${readPredicateT(room.ids)}`;
    if (cutoff) {
      catWhere += " AND t.date >= ?";
      catParams.push(cutoff);
    }

    const { rows: catRaw } = await db.query(
      `SELECT t.category_id,
              COALESCE(c.name, 'Ohne Kategorie') AS name,
              COALESCE(c.color, '#6b7280') AS color,
              SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       ${catWhere}
       GROUP BY t.category_id
       ORDER BY total DESC`,
      catParams
    );

    const byCategory = (catRaw as any[]).map((r) => ({
      categoryId: r.category_id ?? null,
      name: r.name,
      color: r.color,
      total: Number(r.total),
    }));

    const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
    const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0);

    // ── Recurring monthly baseline ───────────────────────────────────────
    const today = localDay(new Date());
    const { rows: recurExp } = await db.query(
      `SELECT amount, type FROM expense_items WHERE ${accountIn("account_id", room.ids)} AND is_active AND (end_date IS NULL OR end_date >= ?)`,
      [today]
    );
    const { rows: recurInc } = await db.query(
      `SELECT amount, type FROM income_sources WHERE ${accountIn("account_id", room.ids)} AND is_active`,
      []
    );
    const toMonthly = (amount: number, t: string) => t === "annual" ? amount / 12 : amount;
    const monthlyRecurringExpenses = (recurExp as any[]).reduce((s, r) => s + toMonthly(Number(r.amount), r.type), 0);
    const monthlyRecurringIncome   = (recurInc as any[]).reduce((s, r) => s + toMonthly(Number(r.amount), r.type), 0);

    // ── Übertragungen: **eine Netto-Serie, nur raumkreuzend** ──
    // Eine Umbuchung Giro→Tagesgeld hat beide Enden im selben Raum und ist reines
    // internes Umschichten, das herausfallen muss. Die Serie existiert, um die
    // Plan/Ist-Lücke des Dauerauftrags zu schließen, der auf der Planungsebene als
    // gewöhnliche Fixkostenposition steht.
    //
    // Sie fließt **nicht** in `net` und die Kopf-Kacheln: sonst stünde derselbe
    // Dauerauftrag zweimal in einer Zahl.
    const transferParams: any[] = [];
    let transferWhere = `WHERE type = 'transfer'
       AND (account_id IN ${idList(room.ids)} OR counter_account_id IN ${idList(room.ids)})
       AND NOT (account_id IN ${idList(room.ids)} AND counter_account_id IN ${idList(room.ids)})`;
    if (cutoff) { transferWhere += " AND date >= ?"; transferParams.push(cutoff); }
    const { rows: transferRows } = await db.query(
      `SELECT substr(date, 1, 7) AS month, account_id, counter_account_id, amount
       FROM transactions ${transferWhere}`,
      transferParams
    );
    const transferMap = new Map<string, number>();
    for (const r of transferRows as any[]) {
      // Netto aus Sicht des Raums: hinein positiv, hinaus negativ.
      const inbound = room.ids.includes(Number(r.counter_account_id));
      const delta = inbound ? Number(r.amount) : -Number(r.amount);
      transferMap.set(r.month, (transferMap.get(r.month) ?? 0) + delta);
    }
    const transfers = monthly.map((m) => ({
      month: m.month,
      net: Math.round((transferMap.get(m.month) ?? 0) * 100) / 100,
    }));

    res.json({
      monthly, byCategory, totalIncome, totalExpenses, months,
      monthlyRecurringExpenses, monthlyRecurringIncome,
      transfers,
      room: room.isShared ? room.ids[0] : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/budget-comparison?months=6
router.get("/budget-comparison", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    // Plan und Ist müssen aus **demselben** Raum kommen, sonst vergleicht die
    // Seite die WG-Miete gegen persönliche Buchungen.
    const room = resolveRoom(req.query.raum, acc);
    const monthsRaw = parseInt(req.query.months as string);
    const months = isNaN(monthsRaw) || monthsRaw <= 0 ? 6 : monthsRaw;

    // Build list of YYYY-MM strings for the last N months
    const now = new Date();
    const monthList: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthList.push(localMonth(d));
    }

    // Actual totals from transactions, grouped by month
    const { rows: txRows } = await db.query(
      `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
       FROM transactions
       WHERE ${readPredicate(room.ids)} AND substr(date, 1, 7) >= ? AND ${EXCLUDE_TRANSFERS_SQL}
       GROUP BY substr(date, 1, 7), type`,
      [monthList[0]]
    );
    const txMap = new Map<string, { income: number; expenses: number }>();
    for (const r of txRows as any[]) {
      if (!txMap.has(r.month)) txMap.set(r.month, { income: 0, expenses: 0 });
      const e = txMap.get(r.month)!;
      // eslint-disable-next-line no-restricted-syntax -- Auslesen einer nach `type` gruppierten SQL-Summe; Übertragungen sind bereits per WHERE ausgeschlossen und können den else-Zweig nicht mehr treffen
      if (r.type === "income") e.income = Number(r.total);
      else e.expenses = Number(r.total);
    }

    // Planned totals from recurring items (active, respecting end_date per month)
    const { rows: expItems } = await db.query(
      `SELECT amount, type, end_date FROM expense_items WHERE ${accountIn("account_id", room.ids)} AND is_active`,
      []
    );
    const { rows: incItems } = await db.query(
      `SELECT amount, type FROM income_sources WHERE ${accountIn("account_id", room.ids)} AND is_active`,
      []
    );
    const toMonthly = (amount: number, t: string) => t === "annual" ? amount / 12 : amount;

    const result = monthList.map((month) => {
      const plannedExpenses = (expItems as any[])
        .filter((r) => r.end_date == null || r.end_date >= month + "-01")
        .reduce((s: number, r: any) => s + toMonthly(Number(r.amount), r.type), 0);
      const plannedIncome = (incItems as any[])
        .reduce((s: number, r: any) => s + toMonthly(Number(r.amount), r.type), 0);
      const tx = txMap.get(month) ?? { income: 0, expenses: 0 };
      return {
        month,
        plannedExpenses: Math.round(plannedExpenses * 100) / 100,
        actualExpenses: tx.expenses,
        plannedIncome: Math.round(plannedIncome * 100) / 100,
        actualIncome: tx.income,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
