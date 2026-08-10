import type { DbAdapter } from "../db/adapter";

/**
 * Mitgliedschaft und Sichtbarkeit.
 *
 * `account_members` ist die **alleinige** Sichtbarkeits-Quelle: laufen sie und
 * `accounts.user_id` auseinander, gewinnt `account_members`. `accounts.is_shared`
 * bleibt orthogonal — es steuert den Dashboard-Block, nicht die Sichtbarkeit.
 */

/**
 * SELECT-Fragment, das **meine** Mitgliedschaftswerte unter eindeutigen Aliassen
 * mitliest. Erwartet einen `LEFT JOIN account_members m ON … AND m.user_id = ?`.
 *
 * Die Werte werden anschließend **flach** ins Konto-Objekt gemischt: dieselben
 * Feldnamen wie früher, aber sie bedeuten jetzt „mein Wert". Das lässt jede
 * Lesestelle in Frontend und MCP unverändert — der Preis steht in CLAUDE.md.
 */
export const MEMBERSHIP_FIELDS =
  "m.freibetrag AS member_freibetrag, m.freibetrag_year AS member_freibetrag_year, " +
  "m.is_default AS member_is_default, m.role AS member_role, m.status AS member_status";

/**
 * Meine Rolle an einem Konto, oder `null`, wenn ich es nicht sehe.
 *
 * Owner-Sonderrechte hängen **ausschließlich an der Konto-Entität** (löschen,
 * einladen, entfernen, umwandeln). Kategorien, Fixkosten und Buchungen kennen
 * keinen Owner-Vorbehalt: dort ist Schreibrecht deckungsgleich mit Sichtbarkeit,
 * weil eine Asymmetrie „sehen ja, ändern nur eigene" `created_by` als
 * Berechtigungsfeld wieder einführte und verwaiste, unbearbeitbare Zeilen
 * erzeugte, sobald der Urheber austritt.
 */
export async function myRole(
  db: DbAdapter,
  accountId: number | string,
  userId: number
): Promise<"owner" | "member" | null> {
  const { rows } = await db.query(
    // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst
    "SELECT role FROM account_members WHERE account_id = ? AND user_id = ? AND status = 'active'",
    [accountId, userId]
  );
  if (rows.length === 0) return null;
  return (rows[0] as any).role === "owner" ? "owner" : "member";
}

/**
 * Stellt die Owner-Mitgliedschaft eines Kontos her — idempotent.
 *
 * Aufgerufen an **allen drei** Stellen, an denen ein Konto eine `user_id` bekommt:
 * `POST /api/accounts`, Migrationsschritt 3 und die Setup-Route. Das ist eine
 * Invariante, kein einmaliger Backfill: die von Ticket 02 geforderte Reihenfolge
 * „Orphan-Backfill vor Mitgliedschafts-Backfill" ist nicht herstellbar (der eine
 * läuft beim Start, der andere in einer Route und braucht einen User, den es beim
 * Start noch nicht gibt). Ohne die Invariante verliert eine Installation aus der
 * Vor-Auth-Zeit beim Upgrade sämtliche Konten unsichtbar.
 */
export async function ensureOwnerMembership(
  db: DbAdapter,
  accountId: number,
  userId: number
): Promise<void> {
  await db.run(
    // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
    `INSERT INTO account_members (account_id, user_id, role, status)
     SELECT ?, ?, 'owner', 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM account_members WHERE account_id = ? AND user_id = ?
     )`,
    [accountId, userId, accountId, userId]
  );
}

/**
 * Stellt die Owner-Mitgliedschaft für **alle** Konten eines Nutzers her.
 *
 * Der Fall der Setup-Route: `migrateOrphanedData` hat gerade herrenlose Konten
 * adoptiert, für die es noch keine Mitgliedschaftszeile gibt. Sie adoptiert Daten
 * und muss sie vollständig adoptieren.
 */
export async function ensureOwnerMembershipsForUser(
  db: DbAdapter,
  userId: number
): Promise<void> {
  await db.run(
    // eslint-disable-next-line no-restricted-syntax -- account_members: user_id ist hier der Mitgliedsbezug selbst, nicht der weggefallene Sichtbarkeitszweig
    `INSERT INTO account_members (account_id, user_id, role, status)
     SELECT a.id, a.user_id, 'owner', 'active'
     FROM accounts a
     WHERE a.user_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM account_members m WHERE m.account_id = a.id AND m.user_id = a.user_id
       )`,
    [userId]
  );
}
