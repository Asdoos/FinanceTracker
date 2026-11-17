/**
 * Das Gehalt als Ganzes — Sichtbarkeit **und** Summenlogik in einem Baustein.
 *
 * Nach dem Vorbild von `EXCLUDE_TRANSFERS_SQL` / `signedAmount` in `./transactions.ts`.
 * Dass beides hier zusammenliegt, ist kein Zufall: es sind die zwei Eigenschaften, die
 * „dem Gehalt als Ganzem" gehören und nicht der einzelnen Zeile.
 *
 * ## Warum das überhaupt ein Baustein ist
 *
 * `salary_components` trägt **keine** `account_id`. Ein Bestandteil ist nur über sein
 * Gehalt sichtbar:
 *
 * ```sql
 * FROM salary_components c JOIN salaries s ON s.id = c.salary_id
 * WHERE s.account_id IN (<sichtbare Konten>)
 * ```
 *
 * Die Kopie einer `account_id` am Bestandteil wurde verworfen, weil sie **still**
 * leckt: wechselt das Gehalt das Konto und die Kinder werden nicht mitgezogen, liefert
 * das Prädikat weiter Zeilen — ohne Fehlermeldung. Der handgeschriebene Join wurde
 * verworfen, weil zehn Lesestellen zehn Gelegenheiten sind, ihn zu vergessen, und ein
 * vergessenes `WHERE` *alle* Bestandteile *aller* Nutzer liefert.
 *
 * Deshalb ist dies die einzige Stelle, an der `salary_components` in einer Abfrage
 * stehen darf; ein dritter ESLint-Guard bewacht das. Der Guard ist syntaktisch, nicht
 * semantisch — er ersetzt kein Review, er verhindert das Übersehen. Er greift auf
 * `FROM salary_components`, also auf Lesestellen: Schreibzugriffe **auf eine ID** sind
 * durch die Prüfung des Elternteils gedeckt, nicht durch ein eigenes Prädikat.
 *
 * ## Was hier *nicht* steht
 *
 * `salaries` selbst braucht keinen Baustein — `accountIn("account_id", acc.all)` greift
 * dort unverändert, wie bei jeder kontogebundenen Tabelle. Die drei Schreibregeln der
 * Herleitung (`round(rate × hours, 2) == amount`, beide Felder strikt positiv, beide
 * oder keiner) sitzen ausschließlich in der Zod-Schreibgrenze, nicht hier und nicht als
 * `CHECK` im Schema.
 */

import { z } from "zod";
import {
  SALARY_COMPONENT_KINDS,
  salaryCatalogEntry,
  salaryComponentLabel,
} from "../../shared/salaryCatalog";
import { accountIn } from "./visibility";

/**
 * Der `FROM`-Teil samt Join. Die Aliase sind **fest**: `c` für den Bestandteil, `s`
 * für das Gehalt. Aufrufer schreiben ihre Spalten und Bedingungen mit diesen Aliasen.
 */
const COMPONENTS_FROM =
  // eslint-disable-next-line no-restricted-syntax -- die eine erlaubte Fundstelle: hier wird das Prädikat definiert, das der Guard überall sonst erzwingt
  "FROM salary_components c JOIN salaries s ON s.id = c.salary_id";

export interface VisibleComponentsOptions {
  /**
   * Nur zählende Posten: `is_active` auf **beiden** Ebenen. Ein Posten zählt nur, wenn
   * Gehalt *und* Posten aktiv sind — ohne die zweite Ebene wäre es ein Rückschritt
   * gegenüber `income_sources`, wo eine einzelne Zeile abschaltbar ist.
   */
  activeOnly?: boolean;
  /** Zusätzliche Bedingung, mit `c.`/`s.`-Aliasen. Wird geklammert angehängt. */
  where?: string;
  /** `ORDER BY`-Teil ohne das Schlüsselwort. */
  orderBy?: string;
  /**
   * Weitere Joins, die **nach** dem Pflicht-Join stehen (etwa auf `accounts`).
   *
   * Der Aufrufer darf anbauen, aber nicht den Kern ersetzen: das `FROM` samt Join auf
   * `salaries` bleibt ihm entzogen, denn genau daran hängt die Sichtbarkeit. Der
   * CSV-Export braucht das, er hängt Konto und Urheber an.
   */
  joins?: string;
}

/**
 * `SELECT` über die für diesen Nutzer sichtbaren Bestandteile.
 *
 * Die Konto-IDs werden als **interpolierte Integer** eingesetzt, nicht als
 * Platzhalter — `convertPlaceholders` im Postgres-Adapter nummeriert `?` positionell,
 * und die Routen bauen ihr SQL dynamisch zusammen. Platzhalter in `where` zählen
 * deshalb weiter von links nach rechts, so wie der Aufrufer sie hinschreibt.
 *
 * @example
 * // Alle Posten der sichtbaren Gehälter, samt Konto des Elternteils
 * selectVisibleComponents("c.*, s.account_id", acc.all, { orderBy: "c.salary_id, c.id" })
 * @example
 * // Ein Posten für PATCH/DELETE — die Sichtbarkeit des Elternteils ist mitgeprüft
 * selectVisibleComponents("c.id, c.salary_id", acc.all, { where: "c.id = ?" })
 */
export function selectVisibleComponents(
  columns: string,
  accountIds: number[],
  opts: VisibleComponentsOptions = {}
): string {
  const conditions = [accountIn("s.account_id", accountIds)];
  if (opts.activeOnly) conditions.push("c.is_active", "s.is_active");
  if (opts.where) conditions.push(`(${opts.where})`);

  const joins = opts.joins ? ` ${opts.joins}` : "";
  const orderBy = opts.orderBy ? ` ORDER BY ${opts.orderBy}` : "";
  return `SELECT ${columns} ${COMPONENTS_FROM}${joins} WHERE ${conditions.join(" AND ")}${orderBy}`;
}

/** Die Spalten, die die Summenlogik braucht. Zeilen aus beiden Adaptern passen darauf. */
export interface SummableComponent {
  type: string;
  amount: number | string;
  is_active?: number | boolean | null;
}

/** `is_active` kommt auf SQLite als `0`/`1`, auf Postgres als Boolean. */
function isActive(row: { is_active?: number | boolean | null }): boolean {
  return !!row.is_active;
}

/**
 * Monatsbeitrag **eines** Postens.
 *
 * Die `/12`-Umrechnung sitzt hier, weil die Periodizität am Posten sitzt und nicht am
 * Gehalt — `salaries` trägt bewusst keinen Betrag. Acht Aufrufer, die dieselbe
 * `CASE WHEN type='annual'`-Zeile abschreiben, sind acht Gelegenheiten, sie verschieden
 * abzuschreiben.
 *
 * Das Vorzeichen kommt aus `amount` selbst: eine Entgeltumwandlung ist ein **negativer
 * Betrag**, kein positiver mit Abzugs-Flag. Die Summe ist deshalb eine gewöhnliche
 * Addition und diese Funktion hat nichts zu entscheiden.
 */
export function monthlyComponentAmount(c: SummableComponent): number {
  const amount = Number(c.amount);
  return c.type === "annual" ? amount / 12 : amount;
}

/**
 * Monatssumme eines Gehalts über seine Posten — die **Wahrheit**, denn `salaries`
 * trägt keinen Betrag.
 *
 * Ein inaktives Gehalt liefert `0`, ohne dass der Aufrufer es vorher filtern muss:
 * damit darf über eine ungefilterte Liste reduziert werden, und die Regel „beide Ebenen
 * müssen aktiv sein" gilt automatisch statt an jeder Fundstelle wiederholt zu werden —
 * dieselbe Bauart wie `signedAmount`, das für nicht berührte Konten `0` liefert.
 */
export function monthlySalaryTotal(
  salary: { is_active?: number | boolean | null },
  components: SummableComponent[]
): number {
  if (!isActive(salary)) return 0;
  return components
    .filter(isActive)
    .reduce((sum, c) => sum + monthlyComponentAmount(c), 0);
}

// ───────────────────────────────────────────────────────────────────────────────
// Laden und Nutzlast
// ───────────────────────────────────────────────────────────────────────────────

/** Ein Gehalt mit seinen Posten, Spalten roh wie in der Datenbank. */
export interface LoadedSalary {
  id: number;
  employer: string;
  account_id: number;
  is_active: number | boolean;
  note: string | null;
  created_by: number | null;
  components: any[];
}

/**
 * Alle sichtbaren Gehälter samt Posten — **zwei Abfragen, nicht n+1.**
 *
 * Vier Leser brauchen dieselbe Gestalt (`/api/salaries`, `summary.ts`, MCP
 * `list_income`, MCP `get_summary`); jeder von ihnen würde sie sonst selbst
 * zusammenfügen, und `summary.ts` und `mcp.ts` sind laut Ticket 07 ohnehin
 * absichtliche Kopien voneinander — desto wichtiger, dass wenigstens das Laden
 * einer Stelle gehört.
 */
export async function loadSalaries(
  db: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  accountIds: number[]
): Promise<LoadedSalary[]> {
  const { rows: salaries } = await db.query(
    `SELECT * FROM salaries WHERE ${accountIn("account_id", accountIds)} ORDER BY id`
  );
  if (salaries.length === 0) return [];

  const { rows: components } = await db.query(
    selectVisibleComponents("c.*", accountIds, { orderBy: "c.salary_id, c.id" })
  );

  const bySalary = new Map<number, any[]>();
  for (const c of components) {
    const key = Number(c.salary_id);
    const list = bySalary.get(key);
    if (list) list.push(c);
    else bySalary.set(key, [c]);
  }

  return salaries.map((s: any) => ({ ...s, components: bySalary.get(Number(s.id)) ?? [] }));
}

/**
 * Die Nutzlast eines Gehalts, wie Ticket 07 sie festgelegt hat.
 *
 * `label` bleibt **roh** (`null`, wenn keine eigene Bezeichnung), daneben steht
 * `displayLabel` mit der aufgelösten Kette Bezeichnung → Katalogname → roher
 * Schlüssel. Beides, weil beide Leser etwas anderes brauchen: die Anzeige darf nie
 * leer sein, und der Editor muss unterscheiden können, ob der Nutzer selbst etwas
 * eingetragen hat — würde er `displayLabel` zurückschreiben, fröre der Katalogname
 * in die Zeile ein, was Ticket 03 gerade verhindern wollte.
 *
 * **Kein `shareOfTotal`:** bei Ausgaben normiert es auf den Raumnenner, für Einnahmen
 * gibt es keinen etablierten Nenner.
 */
export function salaryPayload(salary: LoadedSalary, account: unknown = null) {
  return {
    id: salary.id,
    employer: salary.employer,
    accountId: salary.account_id,
    account,
    isActive: !!salary.is_active,
    note: salary.note || undefined,
    monthlyAmount: monthlySalaryTotal(salary, salary.components),
    components: salary.components.map((c: any) => ({
      id: c.id,
      kind: c.kind,
      label: c.label ?? null,
      displayLabel: salaryComponentLabel(c.kind, c.label),
      amount: Number(c.amount),
      type: c.type,
      monthlyAmount: monthlyComponentAmount(c),
      isActive: !!c.is_active,
      hourlyRate: c.hourly_rate ?? null,
      hours: c.hours ?? null,
      betragSchwankt: salaryCatalogEntry(c.kind)?.betragSchwankt ?? false,
    })),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Die Schreibgrenze
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Alle Schreibregeln des Gehalts stehen **hier und nur hier** — in Zod, nicht als
 * `CHECK` im Schema.
 *
 * Der Grund ist nicht Bequemlichkeit: HTTP-Routen und MCP sind zwei Schreibwege, und
 * eine Regel, die nur in der Route steht, gilt für den MCP nicht. Ein `CHECK` wäre
 * zweimal formuliert (zwei Engine-Zweige) und auf SQLite nur per Tabellen-Neubau
 * änderbar; die Herleitungs-Invariante ist außerdem Fachlogik über drei Felder, kein
 * Spaltentyp.
 */
export const SalaryComponentInput = z.object({
  kind: z.enum(SALARY_COMPONENT_KINDS),
  /** `null` heißt „nimm den Katalognamen" — der Name gehört dem Katalog, nicht der Zeile. */
  label: z.string().min(1).nullable().optional(),
  /**
   * `!= 0` statt `positive()`: eine Entgeltumwandlung ist ein **negativer Betrag**,
   * kein positiver mit Abzugs-Flag. `0` bleibt verboten — „diesen Monat nichts" ist
   * `isActive: false`, nicht ein Betrag von null.
   */
  amount: z.number().refine((v) => v !== 0, { message: "Betrag darf nicht 0 sein." }),
  type: z.enum(["monthly", "annual"]),
  /** Reine Herleitung. Strikt positiv: ein negativer Satz ist kein Fall, sondern ein Tippfehler. */
  hourlyRate: z.number().positive().nullable().optional(),
  hours: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const SalaryComponentPatch = SalaryComponentInput.partial();

export const SalaryInput = z.object({
  employer: z.string().min(1),
  accountId: z.number().int(),
  isActive: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export const SalaryPatch = SalaryInput.partial();

/** Die drei Regeln über `amount`, `hourly_rate` und `hours` — als *eine* Prüfung. */
export interface Derivation {
  amount: number;
  hourlyRate: number | null;
  hours: number | null;
}

/**
 * Prüft den **zusammengeführten** Zustand einer Zeile, nicht die Nutzlast.
 *
 * Zod allein reicht hier nicht: bei einem PATCH, der nur `hours` schickt, ergibt sich
 * die Invariante erst aus dem gespeicherten `amount`. Deshalb führt der Aufrufer
 * Bestand und Änderung zusammen und gibt das Ergebnis hierher.
 *
 * - **Beide oder keiner.** Ein halb gefülltes Paar ist keine Herleitung, sondern eine
 *   unbeantwortbare Zeile: die Anzeige wüsste nicht, was sie zeigen soll
 *   („80 €/Std. × ? Std."). Im Formular ist der Zwischenzustand normal, beim Speichern
 *   nicht — und die Grenze zwischen beidem *ist* diese Prüfung.
 * - **Auf den Cent, ohne Toleranzband.** Der Widerspruch soll nicht speicherbar sein.
 *   Verglichen wird in ganzen Cent, damit Gleitkomma-Rauschen (`3 * 0.1`) keine
 *   Falschmeldung erzeugt.
 *
 * Wer den Betrag frei setzen will, **verwirft** die Herleitung (beide Felder auf
 * `null`) — das erledigt der Aufrufer, nicht diese Prüfung. Ohne diesen Weg wäre ein
 * stundenbasierter Posten eine Zeile, deren Betrag man nur noch durch Löschen ändern
 * kann.
 */
export function checkDerivation(d: Derivation): string | null {
  const hasRate = d.hourlyRate != null;
  const hasHours = d.hours != null;

  if (hasRate !== hasHours) {
    return "Stundensatz und Stunden gehören zusammen: entweder beide oder keiner.";
  }
  if (!hasRate) return null;

  const cents = (v: number) => Math.round(v * 100);
  if (cents(d.hourlyRate! * d.hours!) !== cents(d.amount)) {
    return `Die Herleitung passt nicht zum Betrag: ${d.hourlyRate} × ${d.hours} ergibt ${
      Math.round(d.hourlyRate! * d.hours! * 100) / 100
    }, gespeichert werden soll ${d.amount}.`;
  }
  return null;
}

/**
 * `label` ist Pflicht **nur** bei `sonstiges` — die einzige Ausnahme von „der Katalog
 * erzwingt nie", und eine andere Sorte: kein Zwang gegen einen belegten Standardfall,
 * sondern das Auffangen eines fehlenden Standards. „Sonstiges 340 €" ist eine Zeile,
 * die in einem halben Jahr nichts mehr sagt — und Verständlichkeit ist der ganze Zweck
 * der Aufgliederung.
 */
export function checkLabel(kind: string, label: string | null | undefined): string | null {
  if (kind !== "sonstiges") return null;
  if (label && label.trim() !== "") return null;
  return 'Bei "Sonstiges" braucht der Posten eine eigene Bezeichnung.';
}

export interface ResolvedPatch {
  amount: number;
  hourlyRate: number | null;
  hours: number | null;
  /** Der Betrag wurde frei gesetzt — Satz und Stunden gehen auf `null`. */
  discardDerivation: boolean;
  /** Der Aufrufer hat Satz oder Stunden angefasst. */
  touchesDerivation: boolean;
}

/**
 * Führt Bestand und Änderung eines Postens zusammen und prüft das Ergebnis.
 *
 * Hier zu haben statt in der Route ist keine Aufräumarbeit: HTTP **und** MCP ändern
 * Posten, und eine Regel, die nur in einer der beiden Stellen steht, gilt für den
 * anderen Schreibweg nicht. Die Invariante hängt am *zusammengeführten* Zustand, nicht
 * an der Nutzlast — also muss die Zusammenführung selbst geteilt sein, nicht nur die
 * Prüfung.
 *
 * Zwei Regeln stecken darin:
 *
 * - **`amount` allein verwirft die Herleitung.** Wer den Betrag setzt, ohne Satz und
 *   Stunden mitzuschicken, löscht beide — statt einen Fehler zu bekommen. Ohne diesen
 *   Weg wäre ein stundenbasierter Posten eine Zeile, deren Betrag man nur noch durch
 *   Löschen ändern kann.
 * - **Wer die Herleitung anfasst, wird gegen den Betrag geprüft.** Ein PATCH mit nur
 *   `hours` scheitert, wenn `rate × hours` nicht mehr zum gespeicherten Betrag passt.
 *   Still neu zu rechnen wäre die Variante, die Ticket 02 ausdrücklich verbietet: der
 *   Betrag muss die Wahrheit bleiben, sonst verschiebt sich die Aggregation hinter dem
 *   Rücken des Nutzers.
 */
export function resolveComponentPatch(
  current: { amount: number | string; hourly_rate?: number | null; hours?: number | null },
  patch: { amount?: number; hourlyRate?: number | null; hours?: number | null }
): { error: string } | ResolvedPatch {
  const touchesDerivation = patch.hourlyRate !== undefined || patch.hours !== undefined;
  const discardDerivation = patch.amount !== undefined && !touchesDerivation;

  const amount = patch.amount ?? Number(current.amount);
  const hourlyRate = discardDerivation
    ? null
    : patch.hourlyRate !== undefined
      ? patch.hourlyRate
      : (current.hourly_rate ?? null);
  const hours = discardDerivation
    ? null
    : patch.hours !== undefined
      ? patch.hours
      : (current.hours ?? null);

  const problem = checkDerivation({ amount, hourlyRate, hours });
  if (problem) return { error: problem };

  return { amount, hourlyRate, hours, discardDerivation, touchesDerivation };
}
