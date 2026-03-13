import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/stats?months=12  (0 = all time)
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
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
    let monthlyWhere = "";
    if (cutoff) {
      monthlyWhere = "WHERE date >= ?";
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
    let catWhere = "WHERE t.type = 'expense'";
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

    res.json({ monthly, byCategory, totalIncome, totalExpenses, months });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
