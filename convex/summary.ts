import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const expenses = await ctx.db.query("expense_items").collect();
    const incomes = await ctx.db.query("income_sources").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const categories = await ctx.db.query("categories").collect();

    const accMap = Object.fromEntries(accounts.map((a) => [a._id, a]));
    const catMap = Object.fromEntries(categories.map((c) => [c._id, c]));

    // --- Monthly totals ---
    const activeExpenses = expenses.filter((e) => e.isActive);
    const activeIncomes = incomes.filter((i) => i.isActive);

    const toMonthly = (amount: number, type: string) =>
      type === "annual" ? amount / 12 : amount;

    const totalMonthlyExpenses = activeExpenses.reduce(
      (sum, e) => sum + toMonthly(e.amount, e.type),
      0
    );
    const totalMonthlyIncome = activeIncomes.reduce(
      (sum, i) => sum + toMonthly(i.amount, i.type),
      0
    );
    const rest = totalMonthlyIncome - totalMonthlyExpenses;

    // --- Per account breakdown ---
    const byAccount = accounts.map((account) => {
      const accExpenses = activeExpenses.filter(
        (e) => e.accountId === account._id
      );
      const accIncomes = activeIncomes.filter(
        (i) => i.accountId === account._id
      );

      const monthlyExpenses = accExpenses.reduce(
        (sum, e) => sum + toMonthly(e.amount, e.type),
        0
      );
      const monthlyIncome = accIncomes.reduce(
        (sum, i) => sum + toMonthly(i.amount, i.type),
        0
      );

      return {
        account,
        monthlyExpenses,
        monthlyIncome,
        rest: monthlyIncome - monthlyExpenses,
        itemCount: accExpenses.length,
      };
    });

    // --- Per category breakdown ---
    const byCategory = categories.map((cat) => {
      const catExpenses = activeExpenses.filter(
        (e) => e.categoryId === cat._id
      );
      const monthly = catExpenses.reduce(
        (sum, e) => sum + toMonthly(e.amount, e.type),
        0
      );
      const share =
        totalMonthlyExpenses > 0
          ? (monthly / totalMonthlyExpenses) * 100
          : 0;

      return {
        category: cat,
        monthly,
        share,
        itemCount: catExpenses.length,
      };
    });

    // --- Expense items enriched with share % ---
    const enrichedExpenses = activeExpenses.map((e) => ({
      ...e,
      category: catMap[e.categoryId] ?? null,
      account: accMap[e.accountId] ?? null,
      monthlyAmount: toMonthly(e.amount, e.type),
      shareOfTotal:
        totalMonthlyExpenses > 0
          ? (toMonthly(e.amount, e.type) / totalMonthlyExpenses) * 100
          : 0,
    }));

    return {
      totalMonthlyExpenses,
      totalMonthlyIncome,
      totalAnnualExpenses: totalMonthlyExpenses * 12,
      totalAnnualIncome: totalMonthlyIncome * 12,
      rest,
      byAccount,
      byCategory,
      expenses: enrichedExpenses,
    };
  },
});
