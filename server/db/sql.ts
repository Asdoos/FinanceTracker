/**
 * SQL-Bausteine, die auf **beiden** Engines gültig sind.
 *
 * Der `DbAdapter` verbirgt SQLite und PostgreSQL hinter einer Schnittstelle, aber
 * nicht hinter einem gemeinsamen Typsystem: SQLite kennt keinen Boolean-Typ und
 * bindet nur Zahlen, PostgreSQL lehnt eine `1` in einer `BOOLEAN`-Spalte ab und
 * kennt keinen Vergleich `boolean = integer`. Beide Richtungen brauchen deshalb
 * eine engine-neutrale Schreibweise.
 */

/**
 * Boolean-**Wert** aus einem gebundenen Parameter (weiterhin `1`/`0`).
 *
 * ```ts
 * db.run(`UPDATE accounts SET is_default = ${BOOL_PARAM} WHERE id = ?`, [1, id]);
 * ```
 *
 * SQLite wertet `(1 = 1)` zu `1` aus, PostgreSQL zu `TRUE`.
 */
export const BOOL_PARAM = "(? = 1)";

/**
 * Für die Lese-Richtung gibt es keinen Baustein, sondern eine Regel:
 * **die nackte Spalte statt `= 1`**. `WHERE is_active = 1` ist auf PostgreSQL ein
 * Typfehler (`boolean = integer`), `WHERE is_active` ist auf beiden Engines gültig —
 * SQLite behandelt `1`/`0` als wahr/falsch, PostgreSQL hat dort bereits einen
 * Boolean stehen.
 */
