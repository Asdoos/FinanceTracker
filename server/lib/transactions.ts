/**
 * Vorzeichen-Regel für Buchungen — das gemeinsame Primitiv aller kontobezogenen
 * Saldo-Rechnungen.
 */

/** Die Spalten, die die Vorzeichen-Regel braucht. Zeilen aus beiden Adaptern passen darauf. */
export interface SignableTransaction {
  type: string;
  amount: number | string;
  account_id: number | string;
  counter_account_id?: number | string | null;
}

/**
 * Beitrag einer Buchungszeile zum Saldo *eines bestimmten* Kontos.
 *
 * | `type`                                  | Beitrag    |
 * |-----------------------------------------|------------|
 * | `income`                                | `+amount`  |
 * | `expense`                               | `−amount`  |
 * | `transfer`, Konto ist `account_id`       | `−amount`  |
 * | `transfer`, Konto ist `counter_account_id` | `+amount` |
 *
 * `amount` steht in der Datenbank **immer positiv**; die Richtung ergibt sich
 * deterministisch aus dem Zeilen-Inhalt. Zeilen, die das Konto gar nicht berühren,
 * liefern `0` — dadurch darf über eine ungefilterte Liste reduziert werden, und die
 * Regel „jede kontobezogene Rechnung muss **beide** Spalten betrachten" gilt
 * automatisch, statt an jeder Fundstelle wiederholt zu werden.
 */
export function signedAmount(tx: SignableTransaction, accountId: number): number {
  const amount = Number(tx.amount);
  const isSource = Number(tx.account_id) === accountId;

  if (tx.type === "transfer") {
    if (isSource) return -amount;
    if (Number(tx.counter_account_id) === accountId) return amount;
    return 0;
  }

  if (!isSource) return 0;
  // eslint-disable-next-line no-restricted-syntax -- die eine Stelle, an der die Typ-Namen stehen dürfen: hier wird die Regel definiert
  return tx.type === "income" ? amount : -amount;
}

/**
 * WHERE-Fragment, das Übertragungen aus einer Aggregation heraushält.
 *
 * Bewusst als SQL-Filter statt als `else`-Zweig in JavaScript: die Auslassung wird
 * dadurch explizit und lokal, und ein künftiger vierter `type` landet nicht wieder
 * stillschweigend in den Ausgaben.
 */
export const EXCLUDE_TRANSFERS_SQL = "type IN ('income', 'expense')";
