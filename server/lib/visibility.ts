import type { DbAdapter } from "../db/adapter";

/**
 * Sichtbarkeit ist ausschließlich durch das **Konto** bestimmt.
 *
 * Aus `WHERE user_id = ?` wird `WHERE account_id IN (<sichtbare Konten>)`, und der
 * alte Zweig **fällt weg** — er bleibt nicht als `OR user_id = ?` stehen. Ein
 * additives `OR` wäre ein Leck: es zeigte einem ausgetretenen Mitglied weiterhin
 * seine Alt-Buchungen. Es gibt genau **einen** Sichtbarkeits-Schlüssel.
 *
 * `account_members` ist die alleinige Quelle: laufen sie und `accounts.user_id`
 * auseinander, gewinnt `account_members`. `is_shared` bleibt orthogonal — es
 * steuert den Dashboard-Block, nicht die Sichtbarkeit.
 */
export interface VisibleAccounts {
  /** Alle sichtbaren Konten — persönliche und geteilte. */
  all: number[];
  /** Nur meine persönlichen Konten. */
  personal: number[];
  /** Nur Gemeinschaftskonten, in denen ich aktives Mitglied bin. */
  shared: number[];
}

/**
 * Konten, die dieser Nutzer sehen darf. Gilt für die Dauer eines Requests.
 *
 * Nur **aktive** Mitgliedschaften zählen: eine offene Einladung (`pending`) zeigt
 * noch nichts an, sonst wäre die Annahme bedeutungslos.
 */
export async function visibleAccounts(db: DbAdapter, userId: number): Promise<VisibleAccounts> {
  const { rows } = await db.query(
    // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst — die Quelle der Sichtbarkeit
    `SELECT a.id, a.is_shared
     FROM accounts a
     JOIN account_members m ON m.account_id = a.id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY a.id`,
    [userId]
  );

  const all: number[] = [];
  const personal: number[] = [];
  const shared: number[] = [];
  for (const r of rows as any[]) {
    const id = Number(r.id);
    // Integer-Zwang an der Quelle: die IDs werden interpoliert, nicht gebunden,
    // und die Injektionsfreiheit soll nachweisbar sein statt auf „kommt ja aus
    // der DB" zu beruhen.
    if (!Number.isInteger(id)) continue;
    all.push(id);
    (r.is_shared ? shared : personal).push(id);
  }
  return { all, personal, shared };
}

/**
 * ID-Liste als SQL-Fragment — **interpolierte Integer, keine Platzhalter.**
 *
 * Grund: `convertPlaceholders` im Postgres-Adapter nummeriert `?` positionell von
 * links nach rechts, und die Routen bauen ihr SQL dynamisch zusammen (Filter
 * werden nachträglich angehängt). Ein zusätzliches `?` müsste an ~40 Stellen von
 * Hand an der richtigen Array-Position landen — ein Fehler dabei läuft **ohne
 * Fehlermeldung** durch und liefert die falschen Zeilen. Genau die Klasse Bug,
 * die stumm Daten leakt.
 *
 * Leere Liste → nie-treffendes Prädikat. `IN ()` ist auf beiden Engines ein
 * **Syntaxfehler**, und ein frisch angelegter Nutzer ohne Konten ist ein realer Fall.
 */
export function idList(ids: number[]): string {
  if (ids.length === 0) return "(-1)";
  return `(${ids.map((id) => {
    const n = Number(id);
    if (!Number.isInteger(n)) throw new Error(`Konto-ID ist keine Ganzzahl: ${id}`);
    return n;
  }).join(",")})`;
}

/** `account_id IN (<sichtbar>)` — für expense_items, income_sources, transaction_templates. */
export function accountIn(column: string, ids: number[]): string {
  return `${column} IN ${idList(ids)}`;
}

/**
 * **Lese**prädikat für `transactions`: eine Übertragung gehört zum Auszug beider
 * Konten, also genügt *ein* sichtbares Ende.
 */
export function transactionReadPredicate(alias = ""): (ids: number[]) => string {
  const p = alias ? `${alias}.` : "";
  return (ids) => `(${p}account_id IN ${idList(ids)} OR ${p}counter_account_id IN ${idList(ids)})`;
}

/**
 * **Schreib**prädikat für `transactions` — enger als das Leseprädikat.
 *
 * Ticket 12 überschreibt hier Ticket 02: Schreiben darf nur, wer **beide** Enden
 * sieht („du bewegst nur Salden, die du sehen darfst"). Wer stattdessen dasselbe
 * Prädikat wie beim Lesen einsetzt, gibt einem Mitglied Schreibrecht auf eine
 * Buchung, die ein für ihn unsichtbares Konto belastet.
 *
 * Für alle anderen Tabellen gilt Ticket 02 unverändert: Schreibrecht ist
 * deckungsgleich mit Sichtbarkeit.
 */
export function transactionWritePredicate(alias = ""): (ids: number[]) => string {
  const p = alias ? `${alias}.` : "";
  return (ids) =>
    `(${p}account_id IN ${idList(ids)} AND (${p}counter_account_id IS NULL OR ${p}counter_account_id IN ${idList(ids)}))`;
}

/**
 * Hybrides Prädikat für `categories` und `goals`.
 *
 * Holt `user_id` als Sichtbarkeitsschlüssel für den NULL-Zweig **bewusst** zurück:
 * persönliche Kategorien haben kein Konto, und ein `account_id NOT NULL` würde die
 * kontoübergreifende Natur der Kategorien zerstören — „Wohnen" gilt für alle
 * meine Konten gleichzeitig.
 *
 * Der Aufrufer hängt `userId` als **letzten** Parameter an.
 */
export function hybridPredicate(alias: string, sharedIds: number[]): string {
  const p = alias ? `${alias}.` : "";
  // eslint-disable-next-line no-restricted-syntax -- der NULL-Zweig des hybriden Prädikats; genau die Stelle, an der user_id Sichtbarkeit trägt
  return `(${p}account_id IN ${idList(sharedIds)} OR (${p}account_id IS NULL AND ${p}user_id = ?))`;
}
