import { Router } from "express";
import { getDb } from "../db";

const router = Router();

const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * Buchungstyp für die CSV. Der Ausgaben-Export übersetzt seit jeher, der
 * Transaktions-Export schrieb den rohen englischen Wert. Als Abbildung angelegt,
 * damit `transfer` → `Übertragung` in v0.25 nur ein Eintrag mehr ist.
 */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: "Einnahme",
  expense: "Ausgabe",
  transfer: "Übertragung",
};
const transactionTypeLabel = (type: string) => TRANSACTION_TYPE_LABELS[type] ?? type;

const today = () => new Date().toISOString().slice(0, 10);

function toCsv(header: string, rows: any[][]): string {
  const lines = rows.map((r) => r.map(escape).join(";"));
  return "\uFEFF" + header + lines.join("\n");
}

// GET /api/export/transactions
router.get("/transactions", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT t.date, t.label, t.amount, t.type, t.note,
              c.name AS category, a.name AS account, ca.name AS counter_account
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts   a ON a.id = t.account_id
       LEFT JOIN accounts  ca ON ca.id = t.counter_account_id
       WHERE t.created_by = ?
       ORDER BY t.date DESC`,
      [req.user!.id]
    );
    const header = "Datum;Bezeichnung;Betrag;Typ;Kategorie;Konto;Gegenkonto;Notiz\n";
    const data = (rows as any[]).map((r) => [
      r.date, r.label, r.amount, transactionTypeLabel(r.type), r.category ?? "",
      r.account ?? "", r.counter_account ?? "", r.note ?? "",
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="transaktionen-${today()}.csv"`);
    res.send(toCsv(header, data));
  } catch (err) {
    next(err);
  }
});

// GET /api/export/expenses
router.get("/expenses", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT e.label, e.amount, e.type, e.is_active, e.note, e.end_date,
              c.name AS category, a.name AS account
       FROM expense_items e
       LEFT JOIN categories c ON c.id = e.category_id
       LEFT JOIN accounts   a ON a.id = e.account_id
       WHERE e.created_by = ?
       ORDER BY e.label`,
      [req.user!.id]
    );
    const header = "Bezeichnung;Betrag;Typ;Kategorie;Konto;Aktiv;Enddatum;Notiz\n";
    const data = (rows as any[]).map((r) => [
      r.label, r.amount, r.type === "monthly" ? "monatlich" : "jährlich",
      r.category ?? "", r.account ?? "",
      r.is_active ? "ja" : "nein", r.end_date ?? "", r.note ?? "",
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ausgaben-${today()}.csv"`);
    res.send(toCsv(header, data));
  } catch (err) {
    next(err);
  }
});

// GET /api/export/income
router.get("/income", async (req, res, next) => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT i.label, i.amount, i.type, i.is_active, i.note,
              a.name AS account
       FROM income_sources i
       LEFT JOIN accounts a ON a.id = i.account_id
       WHERE i.created_by = ?
       ORDER BY i.label`,
      [req.user!.id]
    );
    const header = "Bezeichnung;Betrag;Typ;Konto;Aktiv;Notiz\n";
    const data = (rows as any[]).map((r) => [
      r.label, r.amount, r.type === "monthly" ? "monatlich" : "jährlich",
      r.account ?? "", r.is_active ? "ja" : "nein", r.note ?? "",
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="einnahmen-${today()}.csv"`);
    res.send(toCsv(header, data));
  } catch (err) {
    next(err);
  }
});

export default router;
