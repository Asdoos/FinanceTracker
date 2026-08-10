import { Router } from "express";
import { getDb } from "../db";
import { EXCLUDE_TRANSFERS_SQL, signedAmount } from "../lib/transactions";
import { MEMBERSHIP_FIELDS } from "../lib/members";
import { accountIn, hybridPredicate, transactionReadPredicate, visibleAccounts } from "../lib/visibility";

const router = Router();

const readPredicate = transactionReadPredicate();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const monthlySum = (rows: any[]) => sum(rows, (r: any) => toMonthly(r.amount, r.type));

/**
 * GET /api/summary — die einzige Wahrheitsquelle des Dashboards.
 *
 * **Persönlich und gemeinschaftlich sind komplett getrennte Blöcke.** Die
 * Top-Level-Totals (`totalMonthlyExpenses`, `totalMonthlyIncome`, `rest`) enthalten
 * Gemeinschaftskonten **nicht**; die stehen in `sharedAccounts` — einer **Liste**,
 * ein Eintrag je Konto, kein Summenblock über alle. „Gemeinschaft" ist keine
 * Gegenpartei: die Mitgliederkreise unterscheiden sich, und auf Kategorien-Ebene
 * wäre eine Summe wegen disjunkter Räume gar nicht bildbar.
 */
router.get("/", async (req, res, next) => {
  try {
    const db = await getDb();
    const userId = req.user!.id;
    const acc = await visibleAccounts(db, userId);

    const { rows: expenses } = await db.query(
      `SELECT * FROM expense_items WHERE ${accountIn("account_id", acc.all)}`
    );
    const { rows: incomes } = await db.query(
      `SELECT * FROM income_sources WHERE ${accountIn("account_id", acc.all)}`
    );
    const { rows: accounts } = await db.query(
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist der Mitgliedsbezug selbst
      `SELECT a.*, ${MEMBERSHIP_FIELDS}
       FROM accounts a
       LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ?
       WHERE ${accountIn("a.id", acc.all)}`,
      [userId]
    );
    const { rows: categories } = await db.query(
      `SELECT * FROM categories WHERE ${hybridPredicate("", acc.shared)} ORDER BY id`,
      [userId]
    );

    // ── Buchungen des laufenden Monats ──
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { rows: txRows } = await db.query(
      `SELECT type, SUM(amount) AS total FROM transactions
       WHERE ${readPredicate(acc.all)} AND date LIKE ? AND ${EXCLUDE_TRANSFERS_SQL}
       GROUP BY type`,
      [`${currentMonth}-%`]
    );
    const { rows: allTxRows } = await db.query(
      `SELECT account_id, counter_account_id, date, type, amount FROM transactions
       WHERE ${readPredicate(acc.all)}`
    );

    const byType = (t: string) => txRows.find((r: any) => r.type === t)?.total ?? 0;
    // eslint-disable-next-line no-restricted-syntax -- Auslesen der nach `type` gruppierten SQL-Summe; Übertragungen stehen daneben in eigenen Kennzahlen
    const transactionExpensesThisMonth = byType("expense");
    // eslint-disable-next-line no-restricted-syntax -- wie oben
    const transactionIncomeThisMonth = byType("income");

    // Übertragungen getrennt, nicht netto: 1.000 € raus und 1.000 € rein ist etwas
    // anderes als keine Bewegung. Sie stehen außerhalb von `rest` — das speist sich
    // aus der Planungsebene und kann von einer Buchung nicht berührt werden.
    const monthTransfers = allTxRows.filter(
      (tx: any) => tx.type === "transfer" && String(tx.date).startsWith(currentMonth)
    );
    const visible = new Set(acc.all);
    const transactionTransfersOutThisMonth = sum(
      monthTransfers.filter((tx: any) => visible.has(Number(tx.account_id))),
      (tx: any) => Number(tx.amount)
    );
    const transactionTransfersInThisMonth = sum(
      monthTransfers.filter((tx: any) => visible.has(Number(tx.counter_account_id))),
      (tx: any) => Number(tx.amount)
    );

    const accMap = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
    const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c]));

    const today = new Date().toISOString().slice(0, 10);
    const activeExpenses = expenses.filter(
      (e: any) => e.is_active && (!e.end_date || e.end_date >= today)
    );
    const activeIncomes = incomes.filter((i: any) => i.is_active);

    const isShared = (accountId: number) => acc.shared.includes(Number(accountId));

    // ── Top-Level-Totals: **nur der persönliche Raum** ──
    const personalExpenses = activeExpenses.filter((e: any) => !isShared(e.account_id));
    const personalIncomes = activeIncomes.filter((i: any) => !isShared(i.account_id));
    const totalMonthlyExpenses = monthlySum(personalExpenses);
    const totalMonthlyIncome = monthlySum(personalIncomes);
    const rest = totalMonthlyIncome - totalMonthlyExpenses;

    // ── Per-Kategorie-Buchungssummen des Monats ──
    const { rows: catTxRows } = await db.query(
      `SELECT category_id, SUM(amount) AS total FROM transactions
       WHERE ${readPredicate(acc.all)} AND type = 'expense' AND date LIKE ?
       GROUP BY category_id`,
      [`${currentMonth}-%`]
    );
    const catTxMap: Record<string, number> = Object.fromEntries(
      (catTxRows as any[]).map((r: any) => [String(r.category_id ?? "null"), Number(r.total)])
    );

    /** Kategorien-Aufschlüsselung eines Raums, normiert auf dessen eigenen Nenner. */
    function categoryBreakdown(cats: any[], roomExpenses: any[], roomTotal: number) {
      return cats.map((cat: any) => {
        const catExp = roomExpenses.filter((e: any) => e.category_id === cat.id);
        const monthly = monthlySum(catExp);
        const transactionMonthly = catTxMap[String(cat.id)] ?? 0;
        const totalMonthly = monthly + transactionMonthly;
        return {
          category: { id: cat.id, name: cat.name, color: cat.color, budget: cat.budget_limit ?? null },
          monthly,
          transactionMonthly,
          share: roomTotal > 0 ? (monthly / roomTotal) * 100 : 0,
          itemCount: catExp.length,
          pctBudget: cat.budget_limit > 0 ? (totalMonthly / cat.budget_limit) * 100 : null,
        };
      });
    }

    /** Konto-Ebene — identisch für persönliche und gemeinschaftliche Einträge. */
    function accountEntry(account: any) {
      const accExp = activeExpenses.filter((e: any) => e.account_id === account.id);
      const accInc = activeIncomes.filter((i: any) => i.account_id === account.id);
      const monthlyExpenses = monthlySum(accExp);
      const monthlyIncome = monthlySum(accInc);

      const fb = account.member_freibetrag ?? 0;
      const currentYear = new Date().getFullYear();
      const fbActive =
        fb > 0 && (account.member_freibetrag_year == null || account.member_freibetrag_year >= currentYear);

      let actualBalance: number | null = null;
      let actualBalanceDate: string | null = null;
      let calculatedBalance: number | null = null;
      let balanceDelta: number | null = null;

      if (account.actual_balance !== null && account.actual_balance !== undefined) {
        actualBalance = account.actual_balance;
        actualBalanceDate = account.actual_balance_date ?? null;
        const refDate = actualBalanceDate ?? "";
        const netSince = sum(
          allTxRows.filter((tx: any) => tx.date > refDate),
          (tx: any) => signedAmount(tx, Number(account.id))
        );
        calculatedBalance = actualBalance + netSince;
        balanceDelta = netSince;
      }

      return {
        account: {
          id: account.id,
          name: account.name,
          color: account.color,
          description: account.description || undefined,
          isShared: !!account.is_shared,
          isDefault: !!account.member_is_default,
          freibetrag: account.member_freibetrag ?? null,
          freibetragYear: account.member_freibetrag_year ?? null,
        },
        monthlyExpenses,
        monthlyIncome,
        // Identisch gerechnet, im Gemeinschaftsblock aber als **monatlicher Bedarf**
        // zu lesen („monatlich zu decken: X €", nicht „Verlust") — ein negativer
        // Wert ist dort der Normalfall.
        rest: monthlyIncome - monthlyExpenses,
        itemCount: accExp.length + accInc.length,
        freibetragMonthly: fbActive ? fb / 12 : 0,
        actualBalance,
        actualBalanceDate,
        calculatedBalance,
        balanceDelta,
      };
    }

    const byAccount = accounts.filter((a: any) => !a.is_shared).map(accountEntry);

    // Ein `sharedAccounts`-Eintrag hat **dieselbe Konto-Ebene** wie ein
    // `byAccount`-Eintrag plus eigenes `byCategory`. Der Gemeinschaftsblock *ist*
    // dieser Eintrag — es gibt keine dritte Struktur.
    const sharedAccounts = accounts.filter((a: any) => a.is_shared).map((account: any) => {
      const roomExpenses = activeExpenses.filter((e: any) => e.account_id === account.id);
      const roomCats = categories.filter((c: any) => Number(c.account_id) === Number(account.id));
      return {
        ...accountEntry(account),
        byCategory: categoryBreakdown(roomCats, roomExpenses, monthlySum(roomExpenses)),
      };
    });

    // **Zwingend über meine Mitgliedschaften**, nicht mehr aus `byAccount` ableitbar:
    // sonst fiele der Freibetrag auf Gemeinschaftskonten stillschweigend aus der
    // 1.000-€-Warnung, weil `byAccount` ihn nicht mehr enthält.
    const totalFreibetrag =
      sum(byAccount, (a: any) => a.freibetragMonthly * 12) +
      sum(sharedAccounts, (a: any) => a.freibetragMonthly * 12);

    const personalCats = categories.filter((c: any) => c.account_id == null);
    const byCategory = categoryBreakdown(personalCats, personalExpenses, totalMonthlyExpenses);

    // **Eine** Liste über alle sichtbaren Fixkosten: `/expenses` ist die
    // CRUD-Oberfläche und müsste zwei Listen sofort wieder zusammenfügen.
    // `shareOfTotal` normiert auf den Nenner des **eigenen** Raums — eine
    // persönliche Position auf die persönliche Summe, eine WG-Position auf die
    // Summe dieses Kontos. Nur innerhalb eines Raums vergleichbar.
    const roomTotals = new Map<string, number>();
    roomTotals.set("personal", totalMonthlyExpenses);
    for (const s of sharedAccounts) {
      roomTotals.set(
        String(s.account.id),
        monthlySum(activeExpenses.filter((e: any) => e.account_id === s.account.id))
      );
    }
    const enrichedExpenses = activeExpenses.map((e: any) => {
      const roomKey = isShared(e.account_id) ? String(e.account_id) : "personal";
      const denominator = roomTotals.get(roomKey) ?? 0;
      const monthlyAmount = toMonthly(e.amount, e.type);
      return {
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
          ? {
              id: e.account_id,
              name: accMap[e.account_id].name,
              color: accMap[e.account_id].color,
              isShared: !!accMap[e.account_id].is_shared,
            }
          : null,
        monthlyAmount,
        shareOfTotal: denominator > 0 ? (monthlyAmount / denominator) * 100 : 0,
      };
    });

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
      sharedAccounts,
      byCategory,
      expenses: enrichedExpenses,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
