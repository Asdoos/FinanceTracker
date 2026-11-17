import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
import { getDb } from "./db";
import { BOOL_PARAM } from "./db/sql";
import { EXCLUDE_TRANSFERS_SQL, signedAmount } from "./lib/transactions";
import { MEMBERSHIP_FIELDS } from "./lib/members";
import { accountIn, hybridPredicate, transactionReadPredicate, visibleAccounts } from "./lib/visibility";
import { checkTransactionWritable, creatorNames, transferView } from "./lib/masking";
import { checkAccountAndCategory } from "./lib/coupling";
import {
  SalaryComponentInput,
  checkDerivation,
  checkLabel,
  loadSalaries,
  monthlySalaryTotal,
  resolveComponentPatch,
  salaryPayload,
  selectVisibleComponents,
} from "./lib/salary";
import { SALARY_COMPONENT_KINDS } from "../shared/salaryCatalog";

const sessions = new Map<string, SSEServerTransport>();

const toMonthly = (amount: number, type: string) =>
  type === "annual" ? amount / 12 : amount;

/**
 * Ändern und Löschen von Übertragungen bleibt der Oberfläche vorbehalten.
 *
 * Sonst müsste der MCP die Schreibrecht-Differenzierung aus Ticket 12 an einem
 * zweiten Schreibweg nachbauen — mit dem Risiko, dass die beiden Wege auseinander
 * driften. Angelegt werden dürfen Transfers über `add_transfer`.
 */
function refuseTransfer(currentType: string, nextType?: string) {
  if (currentType !== "transfer" && nextType !== "transfer") return null;
  return {
    content: [{
      type: "text" as const,
      text: "Error: Übertragungen können derzeit nur in der Oberfläche bearbeitet werden.",
    }],
    isError: true,
  };
}

const readPredicate = transactionReadPredicate();
const readPredicateT = transactionReadPredicate("t");

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function buildServer(userId: number): McpServer {
  // 2.0.0, weil `list_income` seine **Form** ändert (Array → Objekt). Rein kosmetisch,
  // aber die einzige Stelle, an der ein Klient den Bruch sehen kann.
  const server = new McpServer({ name: "finance-tracker", version: "2.0.0" });

  // ── get_summary ─────────────────────────────────────────────────────────
  server.tool(
    "get_summary",
    "Returns the user's PERSONAL finances: monthly/annual totals, per-account and per-category breakdown, enriched expense list. " +
      "IMPORTANT: the top-level totals (totalMonthlyExpenses, totalMonthlyIncome, rest) EXCLUDE shared accounts. " +
      "Shared accounts are listed separately under sharedAccounts, each with its own totals and its own byCategory — " +
      "never add them to the personal totals, they are a separate space with different members.",
    async () => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows: expenses } = await db.query(`SELECT * FROM expense_items WHERE ${accountIn("account_id", acc.all)}`);
        const { rows: incomes } = await db.query(`SELECT * FROM income_sources WHERE ${accountIn("account_id", acc.all)}`);
        // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst
        const { rows: accounts } = await db.query(`SELECT a.*, ${MEMBERSHIP_FIELDS}
           FROM accounts a
           LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ?
           WHERE ${accountIn("a.id", acc.all)}`, [userId]);
        const { rows: categories } = await db.query(`SELECT * FROM categories WHERE ${hybridPredicate("", acc.shared)}`, [userId]);
        const salaries = await loadSalaries(db, acc.all);

        const accMap = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
        const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c]));

        const today = new Date().toISOString().slice(0, 10);
        const activeExpenses = expenses.filter(
          (e: any) => e.is_active && (!e.end_date || e.end_date >= today)
        );
        const activeIncomes = incomes.filter((i: any) => i.is_active);

        // Top-Level-Totals **ohne** Gemeinschaftskonten — genau das, was die
        // Toolbeschreibung verspricht. Die geteilten Räume stehen darunter einzeln.
        const isSharedAccount = (accountId: number) => acc.shared.includes(Number(accountId));
        const personalExpenses = activeExpenses.filter((e: any) => !isSharedAccount(e.account_id));
        const personalIncomes = activeIncomes.filter((i: any) => !isSharedAccount(i.account_id));
        const totalMonthlyExpenses = personalExpenses.reduce(
          (sum: number, e: any) => sum + toMonthly(e.amount, e.type), 0
        );
        // Die Gehaltsposten gehören in **jede** dieser Summen: für ein Sprachmodell ist
        // eine plausible falsche Zahl schlimmer als eine fehlende Liste, weil es sie
        // zuversichtlich weitermeldet.
        const salaryMonthly = (predicate: (accountId: number) => boolean) =>
          salaries
            .filter((s) => predicate(Number(s.account_id)))
            .reduce((sum: number, s) => sum + monthlySalaryTotal(s, s.components), 0);
        const totalMonthlyIncome =
          personalIncomes.reduce((sum: number, i: any) => sum + toMonthly(i.amount, i.type), 0) +
          salaryMonthly((id) => !isSharedAccount(id));

        const currentYear = new Date().getFullYear();
        const accountEntry = (account: any) => {
          const accExp = activeExpenses.filter((e: any) => e.account_id === account.id);
          const accInc = activeIncomes.filter((i: any) => i.account_id === account.id);
          const monthlyExpenses = accExp.reduce((s: number, e: any) => s + toMonthly(e.amount, e.type), 0);
          const monthlyIncome =
            accInc.reduce((s: number, i: any) => s + toMonthly(i.amount, i.type), 0) +
            salaryMonthly((id) => id === Number(account.id));
          const fb = account.member_freibetrag ?? 0;
          const fbActive = fb > 0 && (account.member_freibetrag_year == null || account.member_freibetrag_year >= currentYear);
          return {
            account: {
              id: account.id, name: account.name, color: account.color,
              isDefault: !!account.member_is_default,
              freibetrag: account.member_freibetrag ?? null,
              freibetragYear: account.member_freibetrag_year ?? null,
            },
            monthlyExpenses, monthlyIncome,
            rest: monthlyIncome - monthlyExpenses,
            freibetragMonthly: fbActive ? fb / 12 : 0,
          };
        };
        // Strukturell getrennt, nicht per Flag: eine flache Liste, in der die Miete
        // des Gemeinschaftskontos neben der eigenen Handyrechnung steht, wird vom
        // Modell zu „deinen Fixkosten" addiert.
        const byAccount = accounts.filter((a: any) => !a.is_shared).map(accountEntry);
        const sharedAccounts = accounts.filter((a: any) => a.is_shared).map((account: any) => ({
          ...accountEntry(account),
          byCategory: categories
            .filter((c: any) => Number(c.account_id) === Number(account.id))
            .map((cat: any) => {
              const catExp = activeExpenses.filter(
                (e: any) => e.category_id === cat.id && e.account_id === account.id
              );
              return {
                category: { id: cat.id, name: cat.name, color: cat.color, budget: cat.budget_limit ?? null },
                monthly: catExp.reduce((s: number, e: any) => s + toMonthly(e.amount, e.type), 0),
              };
            }),
        }));

        // Über **meine Mitgliedschaften**, nicht aus byAccount — sonst fiele der
        // Freibetrag auf Gemeinschaftskonten aus der Warnung.
        const totalFreibetrag = [...byAccount, ...sharedAccounts].reduce(
          (s: number, a: any) => s + a.freibetragMonthly * 12, 0
        );

        // Nur der persönliche Kategoriensatz: die Räume sind disjunkt, eine Summe
        // über beide wäre nicht bildbar.
        const byCategory = categories.filter((c: any) => c.account_id == null).map((cat: any) => {
          const catExp = personalExpenses.filter((e: any) => e.category_id === cat.id);
          const monthly = catExp.reduce((s: number, e: any) => s + toMonthly(e.amount, e.type), 0);
          return {
            category: { id: cat.id, name: cat.name, color: cat.color, budget: cat.budget_limit ?? null },
            monthly,
            share: totalMonthlyExpenses > 0 ? (monthly / totalMonthlyExpenses) * 100 : 0,
            pctBudget: cat.budget_limit > 0 ? (monthly / cat.budget_limit) * 100 : null,
          };
        });

        // Eine Liste, aber jede Zeile trägt ihren Raum — und shareOfTotal ist auf
        // den Nenner des **eigenen** Raums normiert, nicht auf die persönliche Summe.
        const roomTotal = (accountId: number) =>
          isSharedAccount(accountId)
            ? activeExpenses
                .filter((x: any) => x.account_id === accountId)
                .reduce((s: number, x: any) => s + toMonthly(x.amount, x.type), 0)
            : totalMonthlyExpenses;
        const enrichedExpenses = activeExpenses.map((e: any) => ({
          id: e.id, label: e.label, amount: e.amount, type: e.type,
          isShared: isSharedAccount(e.account_id),
          monthlyAmount: toMonthly(e.amount, e.type),
          shareOfTotal: roomTotal(e.account_id) > 0
            ? (toMonthly(e.amount, e.type) / roomTotal(e.account_id)) * 100 : 0,
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
              totalFreibetrag, byAccount, sharedAccounts, byCategory, expenses: enrichedExpenses,
              salaries: salaries.map((s) =>
                salaryPayload(
                  s,
                  accMap[s.account_id]
                    ? { id: s.account_id, name: accMap[s.account_id].name }
                    : null
                )
              ),
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
    "List all visible expense items — personal AND shared. Each row carries isShared; rows on shared accounts also carry createdBy. Do not sum across the two without saying so.",
    { activeOnly: z.boolean().optional().describe("If true, only return active (non-expired) expenses") },
    async ({ activeOnly }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(
          `SELECT e.*, c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color, a.is_shared AS acc_shared
           FROM expense_items e
           LEFT JOIN categories c ON c.id = e.category_id
           LEFT JOIN accounts   a ON a.id = e.account_id
           WHERE ${accountIn("e.account_id", acc.all)}
           ORDER BY e.id`,
          []
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
    "List all visible income: { incomeSources, salaries }. Both are income — to get total income you MUST add salaries; each salary carries monthlyAmount (the sum of its active components, do not also add the components separately). " +
      "IDs from the two lists are SEPARATE sequences and must never be mixed: an id from incomeSources belongs only to update_income/delete_income, an id from salaries only to update_salary/delete_salary, and component ids only to the *_salary_component tools. " +
      "Each row carries isShared; rows on shared accounts also carry createdBy.",
    { activeOnly: z.boolean().optional().describe("If true, only return active income sources and salaries") },
    async ({ activeOnly }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(
          `SELECT i.*, a.name AS acc_name, a.color AS acc_color, a.is_shared AS acc_shared
           FROM income_sources i
           LEFT JOIN accounts a ON a.id = i.account_id
           WHERE ${accountIn("i.account_id", acc.all)}
           ORDER BY i.id`,
          []
        );
        const filtered = activeOnly ? rows.filter((r: any) => r.is_active) : rows;
        const incomeSources = filtered.map((r: any) => ({
          id: r.id, label: r.label, amount: r.amount, type: r.type,
          accountId: r.account_id, isActive: !!r.is_active, note: r.note || null,
          monthlyAmount: r.type === "annual" ? r.amount / 12 : r.amount,
          account: r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
        }));

        // **Zwei benannte Felder statt einer gemischten Liste.** Ein nacktes Array
        // verschwiege das Gehalt (das Modell berichtet zuversichtlich eine falsche
        // Summe), eine gemischte Liste erzeugte die ID-Kollision (das Modell ruft
        // irgendwann `delete_income(id=3)` auf und meint das Gehalt). Benannte Felder
        // machen beides unmöglich.
        const loaded = await loadSalaries(db, acc.all);
        const salaries = loaded
          .filter((s) => (activeOnly ? !!s.is_active : true))
          .map((s) => salaryPayload(s));

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ incomeSources, salaries }, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_accounts ──────────────────────────────────────────────────────
  server.tool("list_accounts", "List all visible accounts. isShared marks a shared account; freibetrag and isDefault carry YOUR value, not a shared one.", async () => {
    try {
      const db = await getDb();
      const acc = await visibleAccounts(db, userId);
      // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst
      const { rows } = await db.query(`SELECT a.*, ${MEMBERSHIP_FIELDS}
         FROM accounts a
         LEFT JOIN account_members m ON m.account_id = a.id AND m.user_id = ?
         WHERE ${accountIn("a.id", acc.all)} ORDER BY a.id`, [userId]);
      const result = rows.map((r: any) => ({
        id: r.id, name: r.name, color: r.color,
        description: r.description || null, isDefault: !!r.member_is_default,
        freibetrag: r.member_freibetrag ?? null, freibetragYear: r.member_freibetrag_year ?? null,
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
      const acc = await visibleAccounts(db, userId);
      const { rows } = await db.query(`SELECT * FROM categories WHERE ${hybridPredicate("", acc.shared)} ORDER BY id`, [userId]);
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
        const acc = await visibleAccounts(db, userId);
        // Ein API-Key ist derselbe Datenabfluss wie die UI: dieselbe Prüfung auf
        // Konto-Sichtbarkeit und Kategorie-Raum, aus derselben Helper-Funktion.
        const coupling = await checkAccountAndCategory(db, userId, acc, accountId, categoryId);
        if (coupling) return {
          content: [{ type: "text" as const, text: `Error: ${coupling}` }], isError: true
        };
        const result = await db.run(
          `INSERT INTO expense_items (label, amount, type, category_id, account_id, is_active, note, end_date, created_by)
           VALUES (?, ?, ?, ?, ?, ${BOOL_PARAM}, ?, ?, ?)`,
          [label, amount, type, categoryId, accountId,
            isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null, endDate || null, userId]
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
        const acc = await visibleAccounts(db, userId);
        // Ein API-Key ist derselbe Datenabfluss wie die UI: dieselbe Prüfung auf
        // Konto-Sichtbarkeit und Kategorie-Raum, aus derselben Helper-Funktion.
        const coupling = await checkAccountAndCategory(db, userId, acc, accountId, null);
        if (coupling) return {
          content: [{ type: "text" as const, text: `Error: ${coupling}` }], isError: true
        };
        const result = await db.run(
          `INSERT INTO income_sources (label, amount, type, account_id, is_active, note, created_by)
           VALUES (?, ?, ?, ?, ${BOOL_PARAM}, ?, ?)`,
          [label, amount, type, accountId, isActive !== undefined ? (isActive ? 1 : 0) : 1, note || null, userId]
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
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(`SELECT id FROM expense_items WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
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
        if (isActive !== undefined) { fields.push(`is_active = ${BOOL_PARAM}`); values.push(isActive ? 1 : 0); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (endDate !== undefined) { fields.push("end_date = ?"); values.push(endDate || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE expense_items SET ${fields.join(", ")} WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [...values, id]);
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
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(`SELECT id FROM income_sources WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
        if (rows.length === 0) return {
          content: [{ type: "text" as const, text: `Error: Income ${id} not found` }], isError: true
        };
        const fields: string[] = [];
        const values: any[] = [];
        if (label !== undefined) { fields.push("label = ?"); values.push(label); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (accountId !== undefined) { fields.push("account_id = ?"); values.push(accountId); }
        if (isActive !== undefined) { fields.push(`is_active = ${BOOL_PARAM}`); values.push(isActive ? 1 : 0); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (fields.length === 0) return {
          content: [{ type: "text" as const, text: "No fields to update" }], isError: true
        };
        await db.run(`UPDATE income_sources SET ${fields.join(", ")} WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [...values, id]);
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
        const acc = await visibleAccounts(db, userId);
        const result = await db.run(`DELETE FROM expense_items WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
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
        const acc = await visibleAccounts(db, userId);
        const result = await db.run(`DELETE FROM income_sources WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
        if (result.changes === 0) return {
          content: [{ type: "text" as const, text: `Error: Income ${id} not found` }], isError: true
        };
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── Gehalt ─────────────────────────────────────────────────────────────
  // Sechs Werkzeuge, **kein `list_salaries`** (das Lesen erledigt `list_income`) und
  // ausdrücklich **kein `set_salary_components(salaryId, components[])`**, obwohl es
  // drei Werkzeuge spart: das ist die Lese-Ändern-Schreiben-Falle, bei einem Modell
  // sogar schärfer als in der UI — es schickt zuverlässig die Liste zurück, die es
  // *vorher* gelesen hat, und überschreibt damit still die Posten des anderen
  // Mitglieds.
  //
  // Ebenfalls nicht hier: die Übernahme bestehender Einnahmen. Deren Atomarität
  // schützt den Formularabbruch, nicht den Agenten — für ein Modell sind „Posten
  // anlegen" und „Einnahme löschen" zwei Aufrufe, die es einzeln richtig hinbekommt.
  const salaryError = (text: string) => ({
    content: [{ type: "text" as const, text: `Error: ${text}` }],
    isError: true,
  });
  const salaryOk = (payload: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  });

  /** Sichtbarkeit des Gehalts — `null` heißt „gibt es für dich nicht". */
  async function visibleSalary(db: any, acc: any, id: number) {
    const { rows } = await db.query(
      `SELECT * FROM salaries WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
      [id]
    );
    return rows[0] ?? null;
  }

  async function insertSalaryComponent(
    db: any,
    salaryId: number,
    c: {
      kind: string; label?: string | null; amount: number; type: string;
      hourlyRate?: number | null; hours?: number | null; isActive?: boolean;
    }
  ) {
    return db.run(
      `INSERT INTO salary_components
         (salary_id, kind, label, amount, type, hourly_rate, hours, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${BOOL_PARAM}, ?)`,
      [
        salaryId, c.kind, c.label ?? null, c.amount, c.type,
        c.hourlyRate ?? null, c.hours ?? null,
        c.isActive === false ? 0 : 1, userId,
      ]
    );
  }

  server.tool(
    "add_salary",
    "Create a salary: an employer plus its components (Grundgehalt, Weihnachtsgeld, Zuschlag, …). A salary itself carries NO amount — its monthly value is the sum of its components. " +
      "Pass components[] here when you know them: they are created in the same transaction, so an interrupted run cannot leave an empty salary that counts as 0 € everywhere.",
    {
      employer: z.string().describe("Employer name"),
      accountId: z.number().describe("Account ID the salary is paid into"),
      isActive: z.boolean().optional().describe("Whether the salary is active (default: true)"),
      note: z.string().optional().describe("Optional note"),
      components: z
        .array(SalaryComponentInput)
        .optional()
        .describe(
          `Optional components. kind is one of: ${SALARY_COMPONENT_KINDS.join(", ")}. ` +
            "label may be omitted (falls back to the catalog name) but is REQUIRED for kind 'sonstiges'. " +
            "amount must not be 0 and is NEGATIVE for kind 'entgeltumwandlung' (a deduction). " +
            "hourlyRate and hours are an optional derivation: pass both or neither, both > 0, and round(hourlyRate * hours, 2) must equal amount."
        ),
    },
    async ({ employer, accountId, isActive, note, components }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const coupling = await checkAccountAndCategory(db, userId, acc, accountId, null);
        if (coupling) return salaryError(coupling);

        for (const c of components ?? []) {
          const problem =
            checkLabel(c.kind, c.label) ??
            checkDerivation({
              amount: c.amount,
              hourlyRate: c.hourlyRate ?? null,
              hours: c.hours ?? null,
            });
          if (problem) return salaryError(problem);
        }

        const id = await db.transaction(async () => {
          const created = await db.run(
            `INSERT INTO salaries (employer, account_id, is_active, note, created_by)
             VALUES (?, ?, ${BOOL_PARAM}, ?, ?)`,
            [employer, accountId, isActive === false ? 0 : 1, note || null, userId]
          );
          const salaryId = Number(created.lastId);
          for (const c of components ?? []) await insertSalaryComponent(db, salaryId, c);
          return salaryId;
        });
        return salaryOk({ id });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  server.tool(
    "update_salary",
    "Update a salary's own fields (only pass fields to change). Components are NOT touched here — use the *_salary_component tools. " +
      "A salary ends by setting isActive:false; there is no end date.",
    {
      id: z.number().describe("Salary ID (from list_income → salaries)"),
      employer: z.string().optional(),
      accountId: z.number().optional().describe("Moving the salary moves all its components with it"),
      isActive: z.boolean().optional(),
      note: z.string().optional(),
    },
    async ({ id, employer, accountId, isActive, note }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        if (!(await visibleSalary(db, acc, id))) return salaryError(`Salary ${id} not found`);

        const fields: string[] = [];
        const values: any[] = [];
        if (employer !== undefined) { fields.push("employer = ?"); values.push(employer); }
        if (accountId !== undefined) {
          const coupling = await checkAccountAndCategory(db, userId, acc, accountId, null);
          if (coupling) return salaryError(coupling);
          fields.push("account_id = ?"); values.push(accountId);
        }
        if (isActive !== undefined) { fields.push(`is_active = ${BOOL_PARAM}`); values.push(isActive ? 1 : 0); }
        if (note !== undefined) { fields.push("note = ?"); values.push(note || null); }
        if (fields.length === 0) return salaryError("No fields to update");

        await db.run(
          `UPDATE salaries SET ${fields.join(", ")} WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
          [...values, id]
        );
        return salaryOk({ ok: true });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  server.tool(
    "delete_salary",
    "Delete a salary AND all of its components (the components cascade). To stop counting a salary without losing it, use update_salary with isActive:false instead.",
    { id: z.number().describe("Salary ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const result = await db.run(
          `DELETE FROM salaries WHERE id = ? AND ${accountIn("account_id", acc.all)}`,
          [id]
        );
        if (result.changes === 0) return salaryError(`Salary ${id} not found`);
        return salaryOk({ ok: true });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  server.tool(
    "add_salary_component",
    "Add one component to an existing salary. A kind may appear MORE THAN ONCE on the same salary — three night/sunday/holiday 'zuschlag' rows with their own labels and rates are the normal case, not an error.",
    {
      salaryId: z.number().describe("Salary ID (from list_income → salaries)"),
      kind: SalaryComponentInput.shape.kind.describe(
        `One of: ${SALARY_COMPONENT_KINDS.join(", ")}`
      ),
      label: z.string().optional().describe("Own label; omit to use the catalog name. REQUIRED for 'sonstiges'"),
      amount: z.number().describe("Must not be 0. NEGATIVE for 'entgeltumwandlung' (deduction)"),
      type: z.enum(["monthly", "annual"]).describe("Whether amount is monthly or annual"),
      hourlyRate: z.number().optional().describe("Both or neither with hours; > 0; rate * hours must equal amount"),
      hours: z.number().optional().describe("In the SAME period as type (monthly → hours per month)"),
      isActive: z.boolean().optional(),
    },
    async ({ salaryId, kind, label, amount, type, hourlyRate, hours, isActive }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        if (!(await visibleSalary(db, acc, salaryId))) {
          return salaryError(`Salary ${salaryId} not found`);
        }
        const problem =
          checkLabel(kind, label) ??
          checkDerivation({ amount, hourlyRate: hourlyRate ?? null, hours: hours ?? null });
        if (problem) return salaryError(problem);

        const created = await insertSalaryComponent(db, salaryId, {
          kind, label, amount, type, hourlyRate, hours, isActive,
        });
        return salaryOk({ id: created.lastId });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  server.tool(
    "update_salary_component",
    "Update one component (only pass fields to change). IMPORTANT: passing amount WITHOUT hourlyRate/hours DISCARDS the derivation (both become null) — that is intended, not an error. " +
      "Passing hourlyRate or hours re-checks the invariant against the stored amount and FAILS on mismatch; it never silently recomputes the amount.",
    {
      id: z.number().describe("Component ID (from list_income → salaries[].components)"),
      kind: SalaryComponentInput.shape.kind.optional(),
      label: z.string().optional(),
      amount: z.number().optional(),
      type: z.enum(["monthly", "annual"]).optional(),
      hourlyRate: z.number().optional(),
      hours: z.number().optional(),
      isActive: z.boolean().optional(),
    },
    async ({ id, kind, label, amount, type, hourlyRate, hours, isActive }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(
          selectVisibleComponents("c.*", acc.all, { where: "c.id = ?" }),
          [id]
        );
        const current = rows[0];
        if (!current) return salaryError(`Salary component ${id} not found`);

        const nextKind = kind ?? current.kind;
        const nextLabel = label !== undefined ? label : current.label;
        const labelProblem = checkLabel(nextKind, nextLabel);
        if (labelProblem) return salaryError(labelProblem);

        const resolved = resolveComponentPatch(current, { amount, hourlyRate, hours });
        if ("error" in resolved) return salaryError(resolved.error);

        const fields: string[] = [];
        const values: any[] = [];
        if (kind !== undefined) { fields.push("kind = ?"); values.push(kind); }
        if (label !== undefined) { fields.push("label = ?"); values.push(label || null); }
        if (amount !== undefined) { fields.push("amount = ?"); values.push(amount); }
        if (type !== undefined) { fields.push("type = ?"); values.push(type); }
        if (isActive !== undefined) { fields.push(`is_active = ${BOOL_PARAM}`); values.push(isActive ? 1 : 0); }
        if (resolved.discardDerivation || resolved.touchesDerivation) {
          fields.push("hourly_rate = ?", "hours = ?");
          values.push(resolved.hourlyRate, resolved.hours);
        }
        if (fields.length === 0) return salaryError("No fields to update");

        await db.run(`UPDATE salary_components SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        return salaryOk({ ok: true, derivationDiscarded: resolved.discardDerivation });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  server.tool(
    "delete_salary_component",
    "Delete one component of a salary. The salary itself stays, its monthly total shrinks accordingly.",
    { id: z.number().describe("Component ID to delete") },
    async ({ id }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(
          selectVisibleComponents("c.id", acc.all, { where: "c.id = ?" }),
          [id]
        );
        if (rows.length === 0) return salaryError(`Salary component ${id} not found`);
        // eslint-disable-next-line no-restricted-syntax -- Löschen per ID; die Sichtbarkeit ist eine Zeile höher über den Join geprüft, ein zweites Prädikat wäre hier nicht möglich (die Tabelle trägt keine account_id)
        await db.run("DELETE FROM salary_components WHERE id = ?", [id]);
        return salaryOk({ ok: true });
      } catch (err: any) {
        return salaryError(err.message);
      }
    }
  );

  // ── list_transactions ──────────────────────────────────────────────────
  server.tool(
    "list_transactions",
    "List visible transactions — personal AND shared. isShared marks the space, createdBy the author on shared rows, canEdit is false when the row touches an account you cannot see.",
    {
      // eslint-disable-next-line no-restricted-syntax -- die Typ-Achse des Werkzeugs; hier stehen die Namen zwangsläufig
      type: z.enum(["income", "expense", "transfer"]).optional().describe("Filter by type"),
      month: z.string().optional().describe("Filter by month in YYYY-MM format"),
      accountId: z.number().optional().describe("Only transactions touching this account (transfers count on both ends)"),
    },
    async ({ type, month, accountId }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        let sql = `
          SELECT t.*, c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color,
                 ca.name AS counter_name, ca.color AS counter_color, a.is_shared AS acc_shared
          FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN accounts   a ON a.id = t.account_id
          LEFT JOIN accounts  ca ON ca.id = t.counter_account_id
          WHERE ${readPredicateT(acc.all)}
        `;
        const params: any[] = [];
        if (accountId !== undefined) {
          // Beide Spalten — eine Übertragung gehört zum Auszug beider Konten.
          sql += " AND (t.account_id = ? OR t.counter_account_id = ?)";
          params.push(accountId, accountId);
        }
        if (type) { sql += " AND t.type = ?"; params.push(type); }
        if (month) { sql += " AND t.date LIKE ?"; params.push(`${month}-%`); }
        sql += " ORDER BY t.date DESC, t.id DESC";
        const { rows } = await db.query(sql, params);
        const names = await creatorNames(db, rows as any[]);
        const result = rows.map((r: any) => {
          const view = transferView(r, acc, names);
          return {
          id: r.id, date: r.date, label: r.label, amount: r.amount, type: r.type,
          isShared: !!r.acc_shared,
          createdBy: r.acc_shared ? names.get(Number(r.created_by)) ?? null : null,
          canEdit: view.canEdit,
          categoryId: r.category_id, accountId: r.account_id, note: r.note || null,
          counterAccountId: r.counter_account_id ?? null,
          category: r.cat_name ? { id: r.category_id, name: r.cat_name, color: r.cat_color } : null,
          account: view.maskedAccount
            ? view.maskedAccount
            : r.acc_name ? { id: r.account_id, name: r.acc_name, color: r.acc_color } : null,
          // Ohne das Gegenkonto rechnet ein Modell die Summen falsch.
          counterAccount: view.maskedCounterAccount
            ? view.maskedCounterAccount
            : r.counter_name
            ? { id: r.counter_account_id, name: r.counter_name, color: r.counter_color }
            : null,
          signedAmount: accountId !== undefined ? signedAmount(r, accountId) : null,
          };
        });
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
      // eslint-disable-next-line no-restricted-syntax -- Typ-Achse von add_transaction; Übertragungen laufen bewusst über add_transfer
      type: z.enum(["income", "expense"]).describe("Transaction type"),
      accountId: z.number().describe("Account ID"),
      categoryId: z.number().optional().describe("Category ID (optional, mainly for expenses)"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ date, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        // Ein API-Key ist derselbe Datenabfluss wie die UI: dieselbe Prüfung auf
        // Konto-Sichtbarkeit und Kategorie-Raum, aus derselben Helper-Funktion.
        const coupling = await checkAccountAndCategory(db, userId, acc, accountId, categoryId);
        if (coupling) return {
          content: [{ type: "text" as const, text: `Error: ${coupling}` }], isError: true
        };
        const result = await db.run(
          `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, label, amount, type, categoryId || null, accountId, note || null, userId]
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: result.lastId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── add_transfer ───────────────────────────────────────────────────────
  // Ohne dieses Werkzeug ruft ein Modell auf „buch die 500 € rüber" zwangsläufig
  // `add_transaction` zweimal auf und produziert frisch genau die Fälschung, die
  // dieses Release behebt. Das ist kein Komfortverzicht, sondern ein Loch.
  server.tool(
    "add_transfer",
    "Move money between two of your own accounts. Use this instead of two opposite transactions — a transfer is one row and is excluded from income/expense totals.",
    {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      label: z.string().describe("Transfer label/description"),
      amount: z.number().describe("Amount (positive number)"),
      sourceAccountId: z.number().describe("Account the money leaves"),
      targetAccountId: z.number().describe("Account the money arrives in"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ date, label, amount, sourceAccountId, targetAccountId, note }) => {
      try {
        if (sourceAccountId === targetAccountId) {
          return {
            content: [{ type: "text" as const, text: "Error: Quelle und Ziel müssen verschiedene Konten sein." }],
            isError: true,
          };
        }
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(
           
          `SELECT id FROM accounts WHERE ${accountIn("id", acc.all)} AND (id = ? OR id = ?)`,
          [sourceAccountId, targetAccountId]
        );
        if (rows.length < 2) {
          return {
            content: [{ type: "text" as const, text: "Error: Beide Konten müssen dir gehören." }],
            isError: true,
          };
        }
        // Keine `category_id`: ein Transfer hat zwei Konten in möglicherweise
        // verschiedenen Kategorienräumen — die Frage „aus welchem Raum" hat keine Antwort.
        const result = await db.run(
          `INSERT INTO transactions (date, label, amount, type, category_id, account_id, counter_account_id, note, created_by)
           VALUES (?, ?, ?, 'transfer', NULL, ?, ?, ?, ?)`,
          [date, label, amount, sourceAccountId, targetAccountId, note || null, userId]
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
      // `transfer` steht hier, damit der Versuch die klare Meldung bekommt statt
      // eines Schema-Fehlers.
      // eslint-disable-next-line no-restricted-syntax -- die Typ-Achse des Werkzeugs
      type: z.enum(["income", "expense", "transfer"]).optional(),
      accountId: z.number().optional(),
      categoryId: z.number().optional().describe("Pass 0 to clear category"),
      note: z.string().optional(),
    },
    async ({ id, date, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        // Ein API-Key ist derselbe Datenabfluss wie die UI — dieselbe Prüfung,
        // dieselbe Helper-Funktion, damit die beiden Wege nicht auseinander driften.
        const denied = await checkTransactionWritable(db, acc, id);
        if (denied) return {
          content: [{ type: "text" as const, text: `Error: ${denied.error}` }], isError: true
        };
        const { rows } = await db.query("SELECT id, type FROM transactions WHERE id = ?", [id]);
        if (rows.length === 0) return {
          content: [{ type: "text" as const, text: `Error: Transaction ${id} not found` }], isError: true
        };
        const refusal = refuseTransfer(rows[0].type, type);
        if (refusal) return refusal;
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
        const acc = await visibleAccounts(db, userId);
        const denied = await checkTransactionWritable(db, acc, id);
        if (denied) return {
          content: [{ type: "text" as const, text: `Error: ${denied.error}` }], isError: true
        };
        const { rows } = await db.query("SELECT type FROM transactions WHERE id = ?", [id]);
        const refusal = rows.length > 0 ? refuseTransfer(rows[0].type) : null;
        if (refusal) return refusal;
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
    // eslint-disable-next-line no-restricted-syntax -- Vorlagen kennen keinen Transfer-Typ (out of scope der Map)
    { type: z.enum(["income", "expense"]).optional().describe("Filter by type") },
    async ({ type }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        let sql = `
          SELECT t.id, t.label, t.amount, t.type, t.category_id, t.account_id, t.note,
                 c.name AS cat_name, c.color AS cat_color, a.name AS acc_name, a.color AS acc_color
          FROM transaction_templates t
          LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN accounts   a ON a.id = t.account_id
          WHERE ${accountIn("t.account_id", acc.all)}
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
      // eslint-disable-next-line no-restricted-syntax -- Vorlagen kennen keinen Transfer-Typ (out of scope der Map)
      type: z.enum(["income", "expense"]).describe("Transaction type"),
      accountId: z.number().describe("Account ID"),
      categoryId: z.number().optional().describe("Category ID (optional)"),
      note: z.string().optional().describe("Optional note"),
    },
    async ({ label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        // Ein API-Key ist derselbe Datenabfluss wie die UI: dieselbe Prüfung auf
        // Konto-Sichtbarkeit und Kategorie-Raum, aus derselben Helper-Funktion.
        const coupling = await checkAccountAndCategory(db, userId, acc, accountId, categoryId);
        if (coupling) return {
          content: [{ type: "text" as const, text: `Error: ${coupling}` }], isError: true
        };
        const result = await db.run(
          `INSERT INTO transaction_templates (label, amount, type, category_id, account_id, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [label, amount, type, categoryId || null, accountId, note || null, userId]
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
      // eslint-disable-next-line no-restricted-syntax -- Vorlagen kennen keinen Transfer-Typ (out of scope der Map)
      type: z.enum(["income", "expense"]).optional(),
      accountId: z.number().optional(),
      categoryId: z.number().optional().describe("Pass 0 to clear category"),
      note: z.string().optional(),
    },
    async ({ id, label, amount, type, accountId, categoryId, note }) => {
      try {
        const db = await getDb();
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(`SELECT id FROM transaction_templates WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
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
        await db.run(`UPDATE transaction_templates SET ${fields.join(", ")} WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [...values, id]);
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
        const acc = await visibleAccounts(db, userId);
        const result = await db.run(`DELETE FROM transaction_templates WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
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
        const acc = await visibleAccounts(db, userId);
        const { rows } = await db.query(`SELECT * FROM transaction_templates WHERE id = ? AND ${accountIn("account_id", acc.all)}`, [id]);
        if ((rows as any[]).length === 0) return {
          content: [{ type: "text" as const, text: `Error: Template ${id} not found` }], isError: true
        };
        const tpl = (rows as any[])[0];
        const result = await db.run(
          `INSERT INTO transactions (date, label, amount, type, category_id, account_id, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, tpl.label, tpl.amount, tpl.type, tpl.category_id, tpl.account_id, tpl.note, userId]
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
        const acc = await visibleAccounts(db, userId);
        const n = months ?? 12;

        let cutoff: string | null = null;
        if (n > 0) {
          const now = new Date();
          cutoff = new Date(now.getFullYear(), now.getMonth() - n + 1, 1)
            .toISOString().slice(0, 10);
        }

        const monthlyParams: any[] = [];
        // Übertragungen fallen auf SQL-Ebene heraus — der `else`-Zweig unten machte
        // sonst jede von ihnen zur Ausgabe.
        let monthlyWhere = `WHERE ${readPredicate(acc.all)} AND ${EXCLUDE_TRANSFERS_SQL}`;
        if (cutoff) { monthlyWhere += " AND date >= ?"; monthlyParams.push(cutoff); }

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
          // eslint-disable-next-line no-restricted-syntax -- Auslesen einer nach `type` gruppierten SQL-Summe; Übertragungen sind bereits per WHERE ausgeschlossen und können den else-Zweig nicht mehr treffen
          if (row.type === "income") e.income = Number(row.total);
          else e.expenses = Number(row.total);
        }
        const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({
          month, income: v.income, expenses: v.expenses, net: v.income - v.expenses,
        }));

        const catParams: any[] = [];
        let catWhere = `WHERE t.type = 'expense' AND ${readPredicateT(acc.all)}`;
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
        const acc = await visibleAccounts(db, userId);
        const refDate = date ?? new Date().toISOString().slice(0, 10);
        await db.run(
           
          `UPDATE accounts SET actual_balance = ?, actual_balance_date = ?, actual_balance_by = ? WHERE id = ? AND ${accountIn("id", acc.all)}`,
          [balance, refDate, userId, id]
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
  // ── Authenticate via API key ──────────────────────────────────────────
  const url = new URL(req.url!, "http://localhost");
  const apiKey = url.searchParams.get("apiKey") || req.headers["x-api-key"] as string | undefined;

  if (!apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing API key" }));
    return;
  }

  const hashed = hashApiKey(apiKey);
  const db = await getDb();
  const { rows } = await db.query(
    // eslint-disable-next-line no-restricted-syntax -- Auth-Tabelle (users/api_keys) — von der Konto-Sichtbarkeit unberührt
    `SELECT u.id AS user_id
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = ?`,
    [hashed]
  );

  if (rows.length === 0) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return;
  }

  const userId: number = (rows[0] as any).user_id;

  // ── Set up MCP transport ──────────────────────────────────────────────
  const transport = new SSEServerTransport("/mcp/messages", res);
  const server = buildServer(userId);

  transport.onclose = () => sessions.delete(transport.sessionId);
  transport.onerror = (err: Error) => {
    console.error("MCP SSE error:", err);
    sessions.delete(transport.sessionId);
  };

  sessions.set(transport.sessionId, transport);
  console.log(`MCP session opened: ${transport.sessionId} (user ${userId})`);
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
