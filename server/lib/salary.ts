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

  const orderBy = opts.orderBy ? ` ORDER BY ${opts.orderBy}` : "";
  return `SELECT ${columns} ${COMPONENTS_FROM} WHERE ${conditions.join(" AND ")}${orderBy}`;
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
