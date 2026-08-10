import { Router } from "express";
import { getDb } from "../db";

const router = Router();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

// GET /api/summary
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const userId = req.user!.id;

    const { rows: expenses } = await db.query("SELECT * FROM expense_items WHERE user_id = ?", [userId]);
    const { rows: incomes } = await db.query("SELECT * FROM income_sources WHERE user_id = ?", [userId]);
    const { rows: accounts } = await db.query("SELECT * FROM accounts WHERE user_id = ?", [userId]);
    const { rows: categories } = await db.query("SELECT * FROM categories WHERE user_id = ?", [userId]);

    // ── Current-month transaction sums ──
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const { rows: txRows } = await db.query(
      "SELECT type, SUM(amount) AS total FROM transactions WHERE user_id = ? AND date LIKE ? GROUP BY type",
      [userId, `${currentMonth}-%`]
    );

    // ── All transactions for balance tracking ──
    const { rows: allTxRows } = await db.query(
      "SELECT account_id, date, type, amount FROM transactions WHERE user_id = ?",
      [userId]
    );
    const transactionExpensesThisMonth =
      txRows.find((r: any) => r.type === "expense")?.total ?? 0;
    const transactionIncomeThisMonth =
      txRows.find((r: any) => r.type === "income")?.total ?? 0;

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
    const currentYear = new Date().getFullYear();
    const byAccount = accounts.map((account: any) => {
      const accExp = activeExpenses.filter((e: any) => e.account_id === account.id);
      const accInc = activeIncomes.filter((i: any) => i.account_id === account.id);

      const monthlyExpenses = accExp.reduce(
        (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
      );
      const monthlyIncome = accInc.reduce(
        (sum: number, i: any) => sum + toMonthly(i.amount, i.type), 0
      );

      const fb = account.freibetrag ?? 0;
      const fbActive = fb > 0 && (account.freibetrag_year === null || account.freibetrag_year >= currentYear);
      const freibetragMonthly = fbActive ? fb / 12 : 0;

      // ── Balance tracking ──
      let actualBalance: number | null = null;
      let actualBalanceDate: string | null = null;
      let calculatedBalance: number | null = null;
      let balanceDelta: number | null = null;

      if (account.actual_balance !== null && account.actual_balance !== undefined) {
        actualBalance = account.actual_balance;
        actualBalanceDate = account.actual_balance_date ?? null;
        // Ohne Ankerdatum zählen alle Buchungen — der leere String ist lexikalisch
        // kleiner als jedes Datum und bleibt das auch unter dem strikten Vergleich.
        const refDate = actualBalanceDate ?? "";
        // Strikt `>`: der Anker gilt für das **Ende** des genannten Tages. Buchungen
        // *am* Ankertag stecken bereits im abgelesenen Saldo — der bisherige `>=`
        // addierte sie ein zweites Mal.
        const netSince = allTxRows
          .filter((tx: any) => tx.account_id === account.id && tx.date > refDate)
          .reduce((sum: number, tx: any) =>
            sum + (tx.type === "income" ? tx.amount : -tx.amount), 0
          );
        calculatedBalance = actualBalance + netSince;
        balanceDelta = netSince; // net movement since reference date
      }

      return {
        account: {
          id: account.id,
          name: account.name,
          color: account.color,
          description: account.description || undefined,
          isDefault: !!account.is_default,
          freibetrag: account.freibetrag ?? null,
          freibetragYear: account.freibetrag_year ?? null,
        },
        monthlyExpenses,
        monthlyIncome,
        rest: monthlyIncome - monthlyExpenses,
        itemCount: accExp.length + accInc.length,
        freibetragMonthly,
        actualBalance,
        actualBalanceDate,
        calculatedBalance,
        balanceDelta,
      };
    });

    const totalFreibetrag = byAccount.reduce((s: number, a: any) => s + a.freibetragMonthly * 12, 0);

    // ── Per-category transaction totals for current month ──
    const { rows: catTxRows } = await db.query(
      `SELECT category_id, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ? AND type = 'expense' AND date LIKE ?
       GROUP BY category_id`,
      [userId, `${currentMonth}-%`]
    );
    const catTxMap: Record<string, number> = Object.fromEntries(
      (catTxRows as any[]).map((r: any) => [String(r.category_id ?? "null"), Number(r.total)])
    );

    // ── Per category breakdown ──
    const byCategory = categories.map((cat: any) => {
      const catExp = activeExpenses.filter((e: any) => e.category_id === cat.id);
      const monthly = catExp.reduce(
        (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
      );
      const share = totalMonthlyExpenses > 0 ? (monthly / totalMonthlyExpenses) * 100 : 0;
      const transactionMonthly = catTxMap[String(cat.id)] ?? 0;
      const totalMonthly = monthly + transactionMonthly;

      return {
        category: { id: cat.id, name: cat.name, color: cat.color,
                    budget: cat.budget_limit ?? null },
        monthly,
        transactionMonthly,
        share,
        itemCount: catExp.length,
        pctBudget: cat.budget_limit > 0
          ? (totalMonthly / cat.budget_limit) * 100
          : null,
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
      end_date: e.end_date || null,
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
      totalFreibetrag,
      transactionExpensesThisMonth,
      transactionIncomeThisMonth,
      byAccount,
      byCategory,
      expenses: enrichedExpenses,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
