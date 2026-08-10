import type { DbAdapter } from "../db/adapter";
import type { VisibleAccounts } from "./visibility";

/**
 * Maskierung und Schreibrecht raumkreuzender Übertragungen.
 *
 * Damit ist die Zeilen-Anreicherung erstmals **anfragesteller-abhängig**: dieselbe
 * Zeile sieht für zwei Mitglieder unterschiedlich aus. Das ist neu in dieser
 * Codebasis und gehört deshalb in CLAUDE.md.
 */

/** Ein Ende, das der Anfragende nicht sehen darf. */
export interface MaskedEnd {
  masked: true;
  /** Anzeigename des Urhebers — „Übertragung von Anri", nicht der Kontoname. */
  by: string;
}

export interface TransferView {
  /**
   * `false` genau dann, wenn die Zeile ein Ende berührt, das der Anfragende nicht
   * sieht. Daran hängt das Schloss-Symbol.
   *
   * *Das Frontend kann das nicht ableiten* — bei einer maskierten Zeile steht das
   * fremde Ende gar nicht in der Nutzlast.
   */
  canEdit: boolean;
  /** Gesetzt, wenn `account_id` unsichtbar ist. */
  maskedAccount: MaskedEnd | null;
  /** Gesetzt, wenn `counter_account_id` unsichtbar ist. */
  maskedCounterAccount: MaskedEnd | null;
}

/**
 * Urhebernamen für die Maskierung. Über `created_by` bekannt, und der Name steht
 * über `account_members` ohnehin zur Verfügung.
 */
export async function creatorNames(db: DbAdapter, rows: any[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((r) => Number(r.created_by)).filter(Number.isInteger))];
  if (ids.length === 0) return new Map();
  const { rows: users } = await db.query(
    `SELECT id, email, display_name FROM users WHERE id IN (${ids.join(",")})`
  );
  return new Map((users as any[]).map((u) => [Number(u.id), u.display_name || u.email]));
}

/**
 * Sicht eines Anfragenden auf eine Buchungszeile.
 *
 * **Betrag, Datum und Label bleiben vollständig** — der Saldo wäre sonst
 * unerklärlich. Maskiert wird nur das *Konto*, nie die Zahl.
 *
 * Eine Zeile, deren beide Enden niemand mehr gemeinsam sieht, ist **dauerhaft
 * eingefroren**. Das ist ein gültiger Endzustand, kein Fehler: sie *ist* ein
 * historisches Ereignis zwischen zwei getrennten Räumen, und beide Kontostände
 * bleiben korrekt.
 */
export function transferView(row: any, acc: VisibleAccounts, names: Map<number, string>): TransferView {
  const creator = names.get(Number(row.created_by)) ?? "einem anderen Mitglied";
  const seesAccount = acc.all.includes(Number(row.account_id));
  const hasCounter = row.counter_account_id != null;
  const seesCounter = !hasCounter || acc.all.includes(Number(row.counter_account_id));

  return {
    canEdit: seesAccount && seesCounter,
    maskedAccount: seesAccount ? null : { masked: true, by: creator },
    maskedCounterAccount: hasCounter && !seesCounter ? { masked: true, by: creator } : null,
  };
}

/**
 * Darf dieser Nutzer diese Buchungszeile schreiben?
 *
 * Gemeinsame Helper-Funktion für Route **und** MCP, die dasselbe Prädikat speist
 * wie `canEdit` — zwei Implementierungen desselben Rechts würden auseinander
 * driften. Auch beim Anlegen aufgerufen, wo beide Enden konstruktionsbedingt
 * sichtbar sind: die Prüfung ist trotzdem explizit.
 *
 * Liefert `null`, wenn erlaubt, sonst Status und Klartext.
 *
 * **403, nicht 404**, für „sichtbar, aber nicht schreibbar": ein 404 auf eine
 * Zeile, die sichtbar auf dem Bildschirm steht, ist schlicht gelogen — und der
 * MCP hat kein Schloss-Symbol, nur den Fehlertext.
 */
export async function checkTransactionWritable(
  db: DbAdapter,
  acc: VisibleAccounts,
  transactionId: number | string
): Promise<{ status: number; error: string } | null> {
  const { rows } = await db.query(
    "SELECT account_id, counter_account_id FROM transactions WHERE id = ?",
    [transactionId]
  );
  if (rows.length === 0) return { status: 404, error: "Transaction not found" };
  const row = rows[0] as any;

  const seesAccount = acc.all.includes(Number(row.account_id));
  const seesCounter = row.counter_account_id == null || acc.all.includes(Number(row.counter_account_id));

  // Wirklich unsichtbar → das pauschale 404 bleibt.
  if (!seesAccount && !seesCounter) return { status: 404, error: "Transaction not found" };
  if (seesAccount && seesCounter) return null;

  return {
    status: 403,
    error: "Diese Übertragung berührt ein Konto, das du nicht siehst.",
  };
}
