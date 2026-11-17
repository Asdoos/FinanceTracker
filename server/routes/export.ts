import { Router } from "express";
import { getDb } from "../db";
import { accountIn, transactionReadPredicate, visibleAccounts } from "../lib/visibility";
import { creatorNames, transferView } from "../lib/masking";
import { selectVisibleComponents } from "../lib/salary";
import { salaryCatalogEntry, salaryComponentLabel } from "../../shared/salaryCatalog";

const router = Router();

const readPredicate = transactionReadPredicate("t");

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

// Die `Konto`-Spalte trägt den Raum nur implizit — und eine CSV ist der Ort, an
// dem als Nächstes eine Summenformel über die Betragsspalte gezogen wird.
const roomLabel = (isShared: unknown) => (isShared ? "Gemeinschaft" : "persönlich");

const today = () => new Date().toISOString().slice(0, 10);

function toCsv(header: string, rows: any[][]): string {
  const lines = rows.map((r) => r.map(escape).join(";"));
  return "\uFEFF" + header + lines.join("\n");
}

// GET /api/export/transactions
router.get("/transactions", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(
      `SELECT t.date, t.label, t.amount, t.type, t.note, t.created_by,
              t.account_id, t.counter_account_id,
              c.name AS category, a.name AS account, a.is_shared AS acc_shared,
              ca.name AS counter_account, ca.is_shared AS counter_shared
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts   a ON a.id = t.account_id
       LEFT JOIN accounts  ca ON ca.id = t.counter_account_id
       WHERE ${readPredicate(acc.all)}
       ORDER BY t.date DESC`,
      []
    );
    const names = await creatorNames(db, rows as any[]);
    const header = "Datum;Bezeichnung;Betrag;Typ;Kategorie;Konto;Raum;Gegenkonto;Erfasst von;Notiz\n";
    const data = (rows as any[]).map((r) => {
      // Dieselbe Maskierung wie in der API. Eine per CSV-Download umgehbare
      // Maskierung wäre keine.
      const view = transferView(r, acc, names);
      // Der Raum einer Zeile ist der Raum des **sichtbaren** Endes. Bei einer
      // raumkreuzenden Übertragung liest die Spalte sonst das Konto, das der
      // Anfragende gar nicht sieht — und behauptet den falschen Raum.
      const rowShared = view.maskedAccount ? r.counter_shared : r.acc_shared;
      const account = view.maskedAccount ? `von ${view.maskedAccount.by}` : r.account ?? "";
      const counter = view.maskedCounterAccount
        ? `von ${view.maskedCounterAccount.by}`
        : r.counter_account ?? "";
      return [
        r.date, r.label, r.amount, transactionTypeLabel(r.type), r.category ?? "",
        account, roomLabel(rowShared), counter,
        // Nur auf Zeilen geteilter Konten gefüllt — der verbliebene Zweck von created_by.
        rowShared ? names.get(Number(r.created_by)) ?? "" : "",
        r.note ?? "",
      ];
    });
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
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(
      `SELECT e.label, e.amount, e.type, e.is_active, e.note, e.end_date, e.created_by,
              c.name AS category, a.name AS account, a.is_shared AS acc_shared
       FROM expense_items e
       LEFT JOIN categories c ON c.id = e.category_id
       LEFT JOIN accounts   a ON a.id = e.account_id
       WHERE ${accountIn("e.account_id", acc.all)}
       ORDER BY e.label`,
      []
    );
    const names = await creatorNames(db, rows as any[]);
    const header = "Bezeichnung;Betrag;Typ;Kategorie;Konto;Raum;Erfasst von;Aktiv;Enddatum;Notiz\n";
    const data = (rows as any[]).map((r) => [
      r.label, r.amount, r.type === "monthly" ? "monatlich" : "jährlich",
      r.category ?? "", r.account ?? "", roomLabel(r.acc_shared),
      r.acc_shared ? names.get(Number(r.created_by)) ?? "" : "",
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
/**
 * **Eine Zeile je Bestandteil**, nicht je Gehalt — und die gewöhnlichen Einnahmen
 * behalten ihre Zeile mit leeren Gehalts-Spalten.
 *
 * Zwei Gründe, beide zwingend:
 *
 * - Ein Gehalt passt in die alte Zeile **gar nicht**: `Betrag` und `Typ` bilden ein
 *   Paar, und ein Gehalt mit monatlichem Grundgehalt und jährlichem Weihnachtsgeld hat
 *   kein solches Paar. Ein *Bestandteil* hat immer genau eines.
 * - Die wahrscheinlichste Handlung mit dieser Datei ist `=SUMME(D:D)`. Jede Gestalt,
 *   die Gehalt **und** Bestandteile als Zeilen führt, verdoppelt genau dort. So steht
 *   nie eine Summe neben ihren Summanden.
 *
 * Verworfen: eine eigene Datei `GET /api/export/salaries`. Dann untertriebe
 * `einnahmen.csv` still das Einkommen, und „die zweite Datei vergessen" ist kein
 * lautes Scheitern.
 */
router.get("/income", async (req, res, next) => {
  try {
    const db = await getDb();
    const acc = await visibleAccounts(db, req.user!.id);
    const { rows } = await db.query(
      `SELECT i.label, i.amount, i.type, i.is_active, i.note, i.created_by,
              a.name AS account, a.is_shared AS acc_shared
       FROM income_sources i
       LEFT JOIN accounts a ON a.id = i.account_id
       WHERE ${accountIn("i.account_id", acc.all)}
       ORDER BY i.label`,
      []
    );
    const { rows: comps } = await db.query(
      selectVisibleComponents(
        `s.employer, c.kind, c.label, c.amount, c.type, c.hourly_rate, c.hours,
         c.is_active, c.created_by, a.name AS account, a.is_shared AS acc_shared`,
        acc.all,
        {
          joins: "LEFT JOIN accounts a ON a.id = s.account_id",
          // Arbeitgeber, dann Bezeichnung — die Posten eines Gehalts stehen beieinander.
          orderBy: "s.employer, c.id",
        }
      )
    );

    const names = await creatorNames(db, [...(rows as any[]), ...(comps as any[])]);
    const header =
      "Gehalt;Bestandteil;Bezeichnung;Betrag;Typ;Satz;Stunden;Konto;Raum;Erfasst von;Aktiv;Notiz\n";
    const typeLabel = (t: string) => (t === "monthly" ? "monatlich" : "jährlich");
    const creator = (r: any) => (r.acc_shared ? names.get(Number(r.created_by)) ?? "" : "");

    const data = [
      // Gewöhnliche Einnahme: die beiden Gehalts-Spalten bleiben leer.
      ...(rows as any[]).map((r) => [
        "", "", r.label, r.amount, typeLabel(r.type), "", "",
        r.account ?? "", roomLabel(r.acc_shared), creator(r),
        r.is_active ? "ja" : "nein", r.note ?? "",
      ]),
      // Bestandteil: `Satz`/`Stunden` sind gespeicherte Herleitung und sollen in einer
      // Tabelle nachrechenbar sein. `Bestandteil` trägt den Anzeigenamen der
      // Katalogart, `Bezeichnung` die eigene — bei leerem Label denselben Text.
      ...(comps as any[]).map((r) => [
        r.employer,
        salaryCatalogEntry(r.kind)?.label ?? r.kind,
        salaryComponentLabel(r.kind, r.label),
        r.amount, typeLabel(r.type),
        r.hourly_rate ?? "", r.hours ?? "",
        r.account ?? "", roomLabel(r.acc_shared), creator(r),
        r.is_active ? "ja" : "nein", "",
      ]),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="einnahmen-${today()}.csv"`);
    res.send(toCsv(header, data));
  } catch (err) {
    next(err);
  }
});

export default router;
