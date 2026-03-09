import { Router } from "express";
import { getDb } from "../db";

const router = Router();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

// GET /api/summary
router.get("/", async (_req, res) => {
  const db = await getDb();

  const { rows: expenses } = await db.query("SELECT * FROM expense_items");
  const { rows: incomes } = await db.query("SELECT * FROM income_sources");
  const { rows: accounts } = await db.query("SELECT * FROM accounts");
  const { rows: categories } = await db.query("SELECT * FROM categories");

  const accMap = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c]));

  // ── Monthly totals ──
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const activeExpenses = expenses.filter((e: any) =>
    e.is_active && (!e.end_date || e.end_date >= today)
  );
  const activeIncomes = incomes.filter((i: any) => i.is_active);

  const totalMonthlyExpenses = activeExpenses.reduce(
    (sum: number, e: any) => sum + toMonthly(e.amount, e.type),
    0
  );
  const totalMonthlyIncome = activeIncomes.reduce(
    (sum: number, i: any) => sum + toMonthly(i.amount, i.type),
    0
  );
  const rest = totalMonthlyIncome - totalMonthlyExpenses;

  // ── Per account breakdown ──
  const byAccount = accounts.map((account: any) => {
    const accExp = activeExpenses.filter((e: any) => e.account_id === account.id);
    const accInc = activeIncomes.filter((i: any) => i.account_id === account.id);

    const monthlyExpenses = accExp.reduce(
      (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
    );
    const monthlyIncome = accInc.reduce(
      (sum: number, i: any) => sum + toMonthly(i.amount, i.type), 0
    );

    return {
      account: {
        id: account.id,
        name: account.name,
        color: account.color,
        description: account.description || undefined,
        isDefault: !!account.is_default,
      },
      monthlyExpenses,
      monthlyIncome,
      rest: monthlyIncome - monthlyExpenses,
      itemCount: accExp.length + accInc.length,
    };
  });

  // ── Per category breakdown ──
  const byCategory = categories.map((cat: any) => {
    const catExp = activeExpenses.filter((e: any) => e.category_id === cat.id);
    const monthly = catExp.reduce(
      (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
    );
    const share = totalMonthlyExpenses > 0 ? (monthly / totalMonthlyExpenses) * 100 : 0;

    return {
      category: { id: cat.id, name: cat.name, color: cat.color },
      monthly,
      share,
      itemCount: catExp.length,
    };
  });

  // ── Enriched expense items ──
  const enrichedExpenses = activeExpenses.map((e: any) => ({
    id: e.id,
    label: e.label,
    amount: e.amount,
    type: e.type,
    categoryId: e.category_id,
    accountId: e.account_id,
    isActive: !!e.is_active,
    note: e.note || undefined,
    category: catMap[e.category_id]
      ? { id: e.category_id, name: catMap[e.category_id].name, color: catMap[e.category_id].color }
      : null,
    account: accMap[e.account_id]
      ? { id: e.account_id, name: accMap[e.account_id].name, color: accMap[e.account_id].color }
      : null,
    monthlyAmount: toMonthly(e.amount, e.type),
    shareOfTotal: totalMonthlyExpenses > 0
      ? (toMonthly(e.amount, e.type) / totalMonthlyExpenses) * 100
      : 0,
  }));

  res.json({
    totalMonthlyExpenses,
    totalMonthlyIncome,
    totalAnnualExpenses: totalMonthlyExpenses * 12,
    totalAnnualIncome: totalMonthlyIncome * 12,
    rest,
    byAccount,
    byCategory,
    expenses: enrichedExpenses,
  });
});

export default router;
