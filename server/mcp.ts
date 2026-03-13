import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "http";
import { getDb } from "./db";

const sessions = new Map<string, SSEServerTransport>();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

function buildServer(): McpServer {
  const server = new McpServer({ name: "finance-tracker", version: "1.0.0" });

  // ── get_summary ─────────────────────────────────────────────────────────
  server.tool(
    "get_summary",
    "Returns monthly/annual totals, per-account and per-category breakdown, and enriched expense list",
    async () => {
      try {
        const db = await getDb();
        const { rows: expenses } = await db.query("SELECT * FROM expense_items");
        const { rows: incomes } = await db.query("SELECT * FROM income_sources");
        const { rows: accounts } = await db.query("SELECT * FROM accounts");
        const { rows: categories } = await db.query("SELECT * FROM categories");

        const accMap = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
        const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c]));

        const today = new Date().toISOString().slice(0, 10);
        const activeExpenses = expenses.filter(
          (e: any) => e.is_active && (!e.end_date || e.end_date >= today)
        );
        const activeIncomes = incomes.filter((i: any) => i.is_active);

        const totalMonthlyExpenses = activeExpenses.reduce(
          (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
        );
        const totalMonthlyIncome = activeIncomes.reduce(
          (sum: number, i: any) => sum + toMonthly(i.amount, i.type), 0
        );

        const currentYear = new Date().getFullYear();
        const byAccount = accounts.map((account: any) => {
          const accExp = activeExpenses.filter((e: any) => e.account_id === account.id);
          const accInc = activeIncomes.filter((i: any) => i.account_id === account.id);
          const monthlyExpenses = accExp.reduce((s: number, e: any) => s + toMonthly(e.amount, e.type), 0);
          const monthlyIncome = accInc.reduce((s: number, i: any) => s + toMonthly(i.amount, i.type), 0);
          const fb = account.freibetrag ?? 0;
          const fbActive = fb > 0 && (account.freibetrag_year === null || account.freibetrag_year >= currentYear);
          return {
            account: {
              id: account.id, name: account.name, color: account.color,
              isDefault: !!account.is_default,
              freibetrag: account.freibetrag ?? null,
              freibetragYear: account.freibetrag_year ?? null,
            },
            monthlyExpenses, monthlyIncome,
            rest: monthlyIncome - monthlyExpenses,
            freibetragMonthly: fbActive ? fb / 12 : 0,
          };
        });

        const totalFreibetrag = byAccount.reduce((s: number, a: any) => s + a.freibetragMonthly * 12, 0);

        const byCategory = categories.map((cat: any) => {
          const catExp = activeExpenses.filter((e: any) => e.category_id === cat.id);
          const monthly = catExp.reduce((s: number, e: any) => s + toMonthly(e.amount, e.type), 0);
          return {
            category: { id: cat.id, name: cat.name, color: cat.color, budget: cat.budget_limit ?? null },
            monthly,
            share: totalMonthlyExpenses > 0 ? (monthly / totalMonthlyExpenses) * 100 : 0,
            pctBudget: cat.budget_limit > 0 ? (monthly / cat.budget_limit) * 100 : null,
          };
        });

        const enrichedExpenses = activeExpenses.map((e: any) => ({
          id: e.id, label: e.label, amount: e.amount, type: e.type,
          monthlyAmount: toMonthly(e.amount, e.type),
          shareOfTotal: totalMonthlyExpenses > 0
            ? (toMonthly(e.amount, e.type) / totalMonthlyExpenses) * 100 : 0,
          category: catMap[e.category_id]
            ? { id: e.category_id, name: catMap[e.category_id].name } : null,
          account: accMap[e.account_id]
            ? { id: e.account_id, name: accMap[e.account_id].name } : null,
        }));

        return {
          content: [{
            type: "text" as const, text: JSON.stringify({
              totalMonthlyExpenses, totalMonthlyIncome,
              totalAnnualExpenses: totalMonthlyExpenses * 12,
              totalAnnualIncome: totalMonthlyIncome * 12,
              rest: totalMonthlyIncome - totalMonthlyExpenses,
              totalFreibetrag, byAccount, byCategory, expenses: enrichedExpenses,
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_expenses ──────────────────────────────────────────────────────
  server.tool(
    "list_expenses",
    "List all expense items with category and account info",
    { activeOnly: z.boolean().optional().describe("If true, only return active (non-expired) expenses") },
    async ({ activeOnly }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query(
          `SELECT e.*, c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color
           FROM expense_items e
           LEFT JOIN categories c ON c.id = e.category_id
           LEFT JOIN accounts   a ON a.id = e.account_id
           ORDER BY e.id`
        );
        const today = new Date().toISOString().slice(0, 10);
        const filtered = activeOnly
          ? rows.filter((r: any) => r.is_active && (!r.end_date || r.end_date >= today))
          : rows;
        const totalMonthly = filtered
          .filter((r: any) => r.is_active)
          .reduce((sum: number, r: any) => sum + (r.type === "annual" ? r.amount / 12 : r.amount), 0);
        const result = filtered.map((r: any) => {
          const monthlyAmount = r.type === "annual" ? r.amount / 12 : r.amount;
          return {
            id: r.id, label: r.label, amount: r.amount, type: r.type,
            categoryId: r.category_id, accountId: r.account_id,
            isActive: !!r.is_active, note: r.note || null, endDate: r.end_date || null,
            monthlyAmount,
            shareOfTotal: totalMonthly > 0 ? (monthlyAmount / totalMonthly) * 100 : 0,
            category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
            account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
          };
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_income ────────────────────────────────────────────────────────
  server.tool(
    "list_income",
    "List all income sources with account info",
    { activeOnly: z.boolean().optional().describe("If true, only return active income sources") },
    async ({ activeOnly }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query(
          `SELECT i.*, a.name AS acc_name, a.color AS acc_color
           FROM income_sources i
           LEFT JOIN accounts a ON a.id = i.account_id
           ORDER BY i.id`
        );
        const filtered = activeOnly ? rows.filter((r: any) => r.is_active) : rows;
        const result = filtered.map((r: any) => ({
          id: r.id, label: r.label, amount: r.amount, type: r.type,
          accountId: r.account_id, isActive: !!r.is_active, note: r.note || null,
          monthlyAmount: r.type === "annual" ? r.amount / 12 : r.amount,
          account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_accounts ──────────────────────────────────────────────────────
  server.tool("list_accounts", "List all accounts", async () => {
    try {
      const db = await getDb();
      const { rows } = await db.query("SELECT * FROM accounts ORDER BY id");
      const result = rows.map((r: any) => ({
        id: r.id, name: r.name, color: r.color,
        description: r.description || null, isDefault: !!r.is_default,
        freibetrag: r.freibetrag ?? null, freibetragYear: r.freibetrag_year ?? null,
        interestRate: r.interest_rate ?? null, interestRateUntil: r.interest_rate_until ?? null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  // ── list_categories ────────────────────────────────────────────────────
  server.tool("list_categories", "List all categories with budget info", async () => {
    try {
      const db = await getDb();
      const { rows } = await db.query("SELECT * FROM categories ORDER BY id");
      const result = rows.map((r: any) => ({
        id: r.id, name: r.name, color: r.color, icon: r.icon || null, budget: r.budget_limit ?? null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  // ── add_expense ────────────────────────────────────────────────────────
  server.tool(
    "add_expense",
    "Add a new expense item",
    {
      label: z.string().describe("Expense label/name"),
      amount: z.number().describe("Amount in the given type"),
      type: z.enum(["monthly", "annual"]).describe("Whether amount is monthly or annual"),
      categoryId: z.number().describe("Category ID"),
      accountId: z.number().describe("Account ID"),
      isActive: z.boolean().optional().describe("Whether the expense is active (default: true)"),
      note: z.string().optional().describe("Optional note"),
      endDate: z.string().optional().describe("Optional end date YYYY-MM-DD"),
    },
    async ({ label, amount, type, categoryId, accountId, isActive, note, endDate }) => {
      try {
        const db = await getDb();
        const result = await db.run(
          `INSERT INTO expense_items (label, amount, type, category_id, account_id, is_active, note, end_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [label, amount, type, categoryId, accountId,
            isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null, endDate || null]
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: result.lastId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── add_income ─────────────────────────────────────────────────────────
  server.tool(
    "add_income",
    "Add a new income source",
    {
      label: z.string().describe("Income label/name"),
      amount: z.number().describe("Amount in the given type"),
      type: z.enum(["monthly", "annual"]).describe("Whether amount is monthly or annual"),
      accountId: z.number().describe("Account ID"),
      isActive: z.boolean().optional().describe("Whether the income is active (default: true)"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ label, amount, type, accountId, isActive, note }) => {
      try {
        const db = await getDb();
        const result = await db.run(
          `INSERT INTO income_sources (label, amount, type, account_id, is_active, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [label, amount, type, accountId, isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null]
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: result.lastId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── update_expense ─────────────────────────────────────────────────────
  server.tool(
    "update_expense",
    "Update an existing expense item (only pass fields to change)",
    {
      id: z.number().describe("Expense ID"),
      label: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(["monthly", "annual"]).optional(),
      categoryId: z.number().optional(),
      accountId: z.number().optional(),
      isActive: z.boolean().optional(),
      note: z.string().optional(),
      endDate: z.string().optional().describe("YYYY-MM-DD or empty string to clear"),
    },
    async ({ id, label, amount, type, categoryId, accountId, isActive, note, endDate }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query("SELECT id FROM expense_items WHERE id = ?", [id]);
        if (rows.length === 0) return {
          content: [{ type: "text" as const, text: `Error: Expense ${id} not found` }], isError: true
        };
        const fields: string[] = [];
        const values: any[] = [];
        if (label !== undefined) { fields.push("label = ?"); values.push(label); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId); }
        if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
        if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (endDate !== undefined) { fields.push("end_date = ?"); values.push(endDate || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE expense_items SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── update_income ──────────────────────────────────────────────────────
  server.tool(
    "update_income",
    "Update an existing income source (only pass fields to change)",
    {
      id: z.number().describe("Income ID"),
      label: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(["monthly", "annual"]).optional(),
      accountId: z.number().optional(),
      isActive: z.boolean().optional(),
      note: z.string().optional(),
    },
    async ({ id, label, amount, type, accountId, isActive, note }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query("SELECT id FROM income_sources WHERE id = ?", [id]);
        if (rows.length === 0) return {
          content: [{ type: "text" as const, text: `Error: Income ${id} not found` }], isError: true
        };
        const fields: string[] = [];
        const values: any[] = [];
        if (label !== undefined) { fields.push("label = ?"); values.push(label); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
        if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE income_sources SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── delete_expense ─────────────────────────────────────────────────────
  server.tool(
    "delete_expense",
    "Delete an expense item by ID",
    { id: z.number().describe("Expense ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const result = await db.run("DELETE FROM expense_items WHERE id = ?", [id]);
        if (result.changes === 0) return {
          content: [{ type: "text" as const, text: `Error: Expense ${id} not found` }], isError: true
        };
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── delete_income ──────────────────────────────────────────────────────
  server.tool(
    "delete_income",
    "Delete an income source by ID",
    { id: z.number().describe("Income ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const result = await db.run("DELETE FROM income_sources WHERE id = ?", [id]);
        if (result.changes === 0) return {
          content: [{ type: "text" as const, text: `Error: Income ${id} not found` }], isError: true
        };
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_transactions ──────────────────────────────────────────────────
  server.tool(
    "list_transactions",
    "List one-time transactions with category and account info",
    {
      type: z.enum(["income", "expense"]).optional().describe("Filter by type"),
      month: z.string().optional().describe("Filter by month in YYYY-MM format"),
    },
    async ({ type, month }) => {
      try {
        const db = await getDb();
        let sql = `
          SELECT t.*, c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color
          FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN accounts   a ON a.id = t.account_id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (type) { sql += " AND t.type = ?"; params.push(type); }
        if (month) { sql += " AND t.date LIKE ?"; params.push(`${month}-%`); }
        sql += " ORDER BY t.date DESC, t.id DESC";
        const { rows } = await db.query(sql, params);
        const result = rows.map((r: any) => ({
          id: r.id, date: r.date, label: r.label, amount: r.amount, type: r.type,
          categoryId: r.category_id, accountId: r.account_id, note: r.note || null,
          category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
          account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── add_transaction ────────────────────────────────────────────────────
  server.tool(
    "add_transaction",
    "Add a one-time transaction (income or expense)",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      label: z.string().describe("Transaction label/description"),
      amount: z.number().describe("Amount (positive number)"),
      type: z.enum(["income", "expense"]).describe("Transaction type"),
      accountId: z.number().describe("Account ID"),
      categoryId: z.number().optional().describe("Category ID (optional, mainly for expenses)"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ date, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const result = await db.run(
          `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [date, label, amount, type, categoryId || null, accountId, note || null]
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: result.lastId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── update_transaction ─────────────────────────────────────────────────
  server.tool(
    "update_transaction",
    "Update an existing transaction (only pass fields to change)",
    {
      id: z.number().describe("Transaction ID"),
      date: z.string().optional(),
      label: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(["income", "expense"]).optional(),
      accountId: z.number().optional(),
      categoryId: z.number().optional().describe("Pass 0 to clear category"),
      note: z.string().optional(),
    },
    async ({ id, date, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query("SELECT id FROM transactions WHERE id = ?", [id]);
        if (rows.length === 0) return {
          content: [{ type: "text" as const, text: `Error: Transaction ${id} not found` }], isError: true
        };
        const fields: string[] = [];
        const values: any[] = [];
        if (date !== undefined) { fields.push("date = ?"); values.push(date); }
        if (label !== undefined) { fields.push("label = ?"); values.push(label); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
        if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId || null); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── delete_transaction ─────────────────────────────────────────────────
  server.tool(
    "delete_transaction",
    "Delete a transaction by ID",
    { id: z.number().describe("Transaction ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const result = await db.run("DELETE FROM transactions WHERE id = ?", [id]);
        if (result.changes === 0) return {
          content: [{ type: "text" as const, text: `Error: Transaction ${id} not found` }], isError: true
        };
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_templates ─────────────────────────────────────────────────────
  server.tool(
    "list_templates",
    "List all transaction templates with category and account info",
    { type: z.enum(["income", "expense"]).optional().describe("Filter by type") },
    async ({ type }) => {
      try {
        const db = await getDb();
        let sql = `
          SELECT t.id, t.label, t.amount, t.type, t.category_id, t.account_id, t.note,
                 c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color
          FROM transaction_templates t
          LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN accounts   a ON a.id = t.account_id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (type) { sql += " AND t.type = ?"; params.push(type); }
        sql += " ORDER BY t.id DESC";
        const { rows } = await db.query(sql, params);
        const result = (rows as any[]).map((r) => ({
          id: r.id, label: r.label, amount: r.amount, type: r.type,
          categoryId: r.category_id, accountId: r.account_id, note: r.note || null,
          category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
          account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── add_template ───────────────────────────────────────────────────────
  server.tool(
    "add_template",
    "Create a new transaction template (no date — use book_template to create a transaction from it)",
    {
      label: z.string().describe("Template label/name"),
      amount: z.number().describe("Default amount"),
      type: z.enum(["income", "expense"]).describe("Transaction type"),
      accountId: z.number().describe("Account ID"),
      categoryId: z.number().optional().describe("Category ID (optional)"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const result = await db.run(
          `INSERT INTO transaction_templates (label, amount, type, category_id, account_id, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [label, amount, type, categoryId || null, accountId, note || null]
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: result.lastId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── update_template ────────────────────────────────────────────────────
  server.tool(
    "update_template",
    "Update a transaction template (only pass fields to change)",
    {
      id: z.number().describe("Template ID"),
      label: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(["income", "expense"]).optional(),
      accountId: z.number().optional(),
      categoryId: z.number().optional().describe("Pass 0 to clear category"),
      note: z.string().optional(),
    },
    async ({ id, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query("SELECT id FROM transaction_templates WHERE id = ?", [id]);
        if ((rows as any[]).length === 0) return {
          content: [{ type: "text" as const, text: `Error: Template ${id} not found` }], isError: true
        };
        const fields: string[] = [];
        const values: any[] = [];
        if (label !== undefined) { fields.push("label = ?"); values.push(label); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
        if (categoryId !== undefined) { fields.push("category_id = ?"); values.push(categoryId || null); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE transaction_templates SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── delete_template ────────────────────────────────────────────────────
  server.tool(
    "delete_template",
    "Delete a transaction template by ID",
    { id: z.number().describe("Template ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const result = await db.run("DELETE FROM transaction_templates WHERE id = ?", [id]);
        if (result.changes === 0) return {
          content: [{ type: "text" as const, text: `Error: Template ${id} not found` }], isError: true
        };
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── book_template ──────────────────────────────────────────────────────
  server.tool(
    "book_template",
    "Book a transaction template for a specific date — creates a new transaction entry",
    {
      id: z.number().describe("Template ID to book"),
      date: z.string().describe("Booking date in YYYY-MM-DD format"),
    },
    async ({ id, date }) => {
      try {
        const db = await getDb();
        const { rows } = await db.query("SELECT * FROM transaction_templates WHERE id = ?", [id]);
        if ((rows as any[]).length === 0) return {
          content: [{ type: "text" as const, text: `Error: Template ${id} not found` }], isError: true
        };
        const tpl = (rows as any[])[0];
        const result = await db.run(
          `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [date, tpl.label, tpl.amount, tpl.type, tpl.category_id, tpl.account_id, tpl.note]
        );
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ id: result.lastId, date, label: tpl.label, amount: tpl.amount }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── get_stats ──────────────────────────────────────────────────────────
  server.tool(
    "get_stats",
    "Returns monthly income/expense statistics from one-time transactions, grouped by month and by category",
    { months: z.number().int().min(0).optional().describe("Last N months (0 = all time, default 12)") },
    async ({ months }) => {
      try {
        const db = await getDb();
        const n = months ?? 12;

        let cutoff: string | null = null;
        if (n > 0) {
          const now = new Date();
          cutoff = new Date(now.getFullYear(), now.getMonth() - n + 1, 1)
            .toISOString().slice(0, 10);
        }

        const monthlyParams: any[] = [];
        let monthlyWhere = "";
        if (cutoff) { monthlyWhere = "WHERE date >= ?"; monthlyParams.push(cutoff); }

        const { rows: monthlyRaw } = await db.query(
          `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
           FROM transactions ${monthlyWhere}
           GROUP BY substr(date, 1, 7), type ORDER BY month ASC`,
          monthlyParams
        );

        const monthMap = new Map<string, { income: number; expenses: number }>();
        for (const row of monthlyRaw as any[]) {
          if (!monthMap.has(row.month)) monthMap.set(row.month, { income: 0, expenses: 0 });
          const e = monthMap.get(row.month)!;
          if (row.type === "income") e.income = Number(row.total);
          else e.expenses = Number(row.total);
        }
        const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({
          month, income: v.income, expenses: v.expenses, net: v.income - v.expenses,
        }));

        const catParams: any[] = [];
        let catWhere = "WHERE t.type = 'expense'";
        if (cutoff) { catWhere += " AND t.date >= ?"; catParams.push(cutoff); }

        const { rows: catRaw } = await db.query(
          `SELECT t.category_id, COALESCE(c.name, 'Ohne Kategorie') AS name,
                  COALESCE(c.color, '#6b7280') AS color, SUM(t.amount) AS total
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           ${catWhere}
           GROUP BY t.category_id ORDER BY total DESC`,
          catParams
        );

        const byCategory = (catRaw as any[]).map((r) => ({
          categoryId: r.category_id ?? null, name: r.name, color: r.color, total: Number(r.total),
        }));

        const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
        const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ monthly, byCategory, totalIncome, totalExpenses, months: n }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── set_account_balance ────────────────────────────────────────────────
  server.tool(
    "set_account_balance",
    "Set the actual (real-world) account balance for an account. This creates a reference point; the app will then calculate the current expected balance by adding all transactions for this account since the reference date.",
    {
      id: z.number().describe("Account ID"),
      balance: z.number().describe("Actual account balance (as seen in the banking app)"),
      date: z.string().optional().describe("Reference date in YYYY-MM-DD format (defaults to today)"),
    },
    async ({ id, balance, date }) => {
      try {
        const db = await getDb();
        const refDate = date ?? new Date().toISOString().slice(0, 10);
        await db.run(
          "UPDATE accounts SET actual_balance = ?, actual_balance_date = ? WHERE id = ?",
          [balance, refDate, id]
        );
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ok: true, id, balance, date: refDate }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return server;
}

// ── SSE handler: GET /mcp/sse ──────────────────────────────────────────
export async function mcpSseHandler(req: IncomingMessage, res: ServerResponse) {
  const transport = new SSEServerTransport("/mcp/messages", res);
  const server = buildServer();

  transport.onclose = () => sessions.delete(transport.sessionId);
  transport.onerror = (err: Error) => {
    console.error("MCP SSE error:", err);
    sessions.delete(transport.sessionId);
  };

  sessions.set(transport.sessionId, transport);
  console.log(`MCP session opened: ${transport.sessionId}`);
  await server.connect(transport);
}

// ── Message handler: POST /mcp/messages ───────────────────────────────
export async function mcpMessageHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, "http://localhost");
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }
  await transport.handlePostMessage(req, res);
}
