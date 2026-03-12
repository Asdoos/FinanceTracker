import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "http";
import { getDb } from "./db";

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

export async function setupMcp(): Promise<(req: IncomingMessage, res: ServerResponse) => void> {
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

  // ── HTTP transport ─────────────────────────────────────────────────────
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  console.log("MCP server ready at /mcp");

  return (req, res) => {
    const handle = (parsedBody?: unknown) => {
      transport.handleRequest(req as any, res as any, parsedBody).catch((err: any) => {
        console.error("MCP transport error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    };

    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        let parsedBody: unknown;
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (raw) parsedBody = JSON.parse(raw);
        } catch {}
        handle(parsedBody);
      });
    } else {
      handle();
    }
  };
}
