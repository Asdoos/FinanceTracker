import { Router } from "express";
import { getDb } from "../db";
import { EXCLUDE_TRANSFERS_SQL, signedAmount } from "../lib/transactions";
import { MEMBERSHIP_FIELDS } from "../lib/members";

const router = Router();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

// GET /api/summary
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const userId = req.user!.id;

    const { rows: expenses } = await db.query("SELECT * FROM expense_items WHERE created_by = ?", [userId]);
    const { rows: incomes } = await db.query("SELECT * FROM income_sources WHERE created_by = ?", [userId]);
    // Freibetrag und Default-Markierung stehen seit v0.26 an *meiner*
    // Mitgliedschaft, nicht mehr am Konto — flach mitgelesen.
    const { rows: accounts } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
      `SELECT a.*, ${MEMBERSHIP_FIELDS}
       FROM accounts a
       LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ?
       WHERE a.user_id = ?`,
      [userId, userId]
    );
    // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs (persönliche Kategorien haben kein Konto)
    const { rows: categories } = await db.query("SELECT * FROM categories WHERE user_id = ?", [userId]);

    // ── Current-month transaction sums ──
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const { rows: txRows } = await db.query(
      `SELECT type, SUM(amount) AS total FROM transactions WHERE created_by = ? AND date LIKE ? AND ${EXCLUDE_TRANSFERS_SQL} GROUP BY type`,
      [userId, `${currentMonth}-%`]
    );

    // ── All transactions for balance tracking ──
    // `counter_account_id` gehört zwingend dazu: ohne diese Spalte wäre der Zufluss
    // einer Übertragung auf dem Zielkonto unsichtbar und dessen Saldo dauerhaft falsch.
    const { rows: allTxRows } = await db.query(
      "SELECT account_id, counter_account_id, date, type, amount FROM transactions WHERE created_by = ?",
      [userId]
    );
    const byType = (t: string) => txRows.find((r: any) => r.type === t)?.total ?? 0;
    // eslint-disable-next-line no-restricted-syntax -- Auslesen der nach `type` gruppierten SQL-Summe; Übertragungen stehen daneben in eigenen Kennzahlen
    const transactionExpensesThisMonth = byType("expense");
    // eslint-disable-next-line no-restricted-syntax -- wie oben
    const transactionIncomeThisMonth = byType("income");

    // ── Übertragungen des laufenden Monats — getrennt, nicht netto ──
    // 1.000 € raus und 1.000 € rein ist etwas anderes als keine Bewegung; netto
    // wäre beides 0 und die Umbuchung unsichtbar. Sie stehen bewusst **außerhalb**
    // von `totalMonthlyExpenses` und `rest`: `rest` speist sich aus der
    // Planungsebene und kann von einer Buchung per Konstruktion nicht berührt werden.
    const monthTransfers = allTxRows.filter(
      (tx: any) => tx.type === "transfer" && String(tx.date).startsWith(currentMonth)
    );
    const sumAmounts = (rows: any[]) => rows.reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    const accountIds = new Set(accounts.map((a: any) => Number(a.id)));
    const transactionTransfersOutThisMonth = sumAmounts(monthTransfers);
    const transactionTransfersInThisMonth = sumAmounts(
      monthTransfers.filter((tx: any) => accountIds.has(Number(tx.counter_account_id)))
    );

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

      const fb = account.member_freibetrag ?? 0;
      const fbActive = fb > 0 && (account.member_freibetrag_year == null || account.member_freibetrag_year >= currentYear);
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
        // `signedAmount` liefert 0 für Zeilen, die dieses Konto nicht berühren —
        // deshalb darf hier ungefiltert über beide Konto-Spalten reduziert werden.
        const netSince = allTxRows
          .filter((tx: any) => tx.date > refDate)
          .reduce((sum: number, tx: any) => sum + signedAmount(tx, Number(account.id)), 0);
        calculatedBalance = actualBalance + netSince;
        balanceDelta = netSince; // net movement since reference date
      }

      return {
        account: {
          id: account.id,
          name: account.name,
          color: account.color,
          description: account.description || undefined,
          isDefault: !!account.member_is_default,
          freibetrag: account.member_freibetrag ?? null,
          freibetragYear: account.member_freibetrag_year ?? null,
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
       WHERE created_by = ? AND type = 'expense' AND date LIKE ?
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
      transactionTransfersOutThisMonth,
      transactionTransfersInThisMonth,
      byAccount,
      byCategory,
      expenses: enrichedExpenses,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
