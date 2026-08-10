import { Router } from "express";
import { getDb } from "../db";
import { accountIn, transactionReadPredicate, visibleAccounts } from "../lib/visibility";
import { EXCLUDE_TRANSFERS_SQL } from "../lib/transactions";

const router = Router();

// Zwei Varianten, weil die Queries teils mit, teils ohne Alias auf transactions gehen.
const readPredicate = transactionReadPredicate();
const readPredicateT = transactionReadPredicate("t");

// GET /api/stats?months=12  (0 = all time)
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const monthsRaw = parseInt(req.query.months as string);
    const months = isNaN(monthsRaw) ? 12 : monthsRaw;

    // Compute cutoff date for "last N months" (0 = no limit)
    let cutoff: string | null = null;
    if (months > 0) {
      const now = new Date();
      cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
        .toISOString()
        .slice(0, 10);
    }

    // ── 1. Monthly totals ───────────────────────────────────────────────
    const monthlyParams: any[] = [];
    // Übertragungen fallen auf SQL-Ebene heraus. Der `else`-Zweig unten machte
    // bisher alles Unbekannte zur Ausgabe — ein Transfer wäre dort stillschweigend
    // gelandet.
    let monthlyWhere = `WHERE ${readPredicate(acc.all)} AND ${EXCLUDE_TRANSFERS_SQL}`;
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
    let catWhere = `WHERE t.type = 'expense' AND ${readPredicateT(acc.all)}`;
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
    const today = new Date().toISOString().slice(0, 10);
    const { rows: recurExp } = await db.query(
      `SELECT amount, type FROM expense_items WHERE ${accountIn("account_id", acc.all)} AND is_active AND (end_date IS NULL OR end_date >= ?)`,
      [today]
    );
    const { rows: recurInc } = await db.query(
      `SELECT amount, type FROM income_sources WHERE ${accountIn("account_id", acc.all)} AND is_active`,
      []
    );
    const toMonthly = (amount: number, t: string) => t === "annual" ? amount / 12 : amount;
    const monthlyRecurringExpenses = (recurExp as any[]).reduce((s, r) => s + toMonthly(Number(r.amount), r.type), 0);
    const monthlyRecurringIncome   = (recurInc as any[]).reduce((s, r) => s + toMonthly(Number(r.amount), r.type), 0);

    res.json({ monthly, byCategory, totalIncome, totalExpenses, months, monthlyRecurringExpenses, monthlyRecurringIncome });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/budget-comparison?months=6
router.get("/budget-comparison", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const monthsRaw = parseInt(req.query.months as string);
    const months = isNaN(monthsRaw) || monthsRaw <= 0 ? 6 : monthsRaw;

    // Build list of YYYY-MM strings for the last N months
    const now = new Date();
    const monthList: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthList.push(d.toISOString().slice(0, 7));
    }

    // Actual totals from transactions, grouped by month
    const { rows: txRows } = await db.query(
      `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
       FROM transactions
       WHERE ${readPredicate(acc.all)} AND substr(date, 1, 7) >= ? AND ${EXCLUDE_TRANSFERS_SQL}
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
      `SELECT amount, type, end_date FROM expense_items WHERE ${accountIn("account_id", acc.all)} AND is_active`,
      []
    );
    const { rows: incItems } = await db.query(
      `SELECT amount, type FROM income_sources WHERE ${accountIn("account_id", acc.all)} AND is_active`,
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
