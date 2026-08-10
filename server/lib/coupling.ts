import type { DbAdapter } from "../db/adapter";
import type { VisibleAccounts } from "./visibility";

/**
 * Kopplungs-Check Kategorie ↔ Konto.
 *
 * Die Kategorie ist Eigenschaft der **Buchung**, nicht persönliche Ordnung — und
 * damit an den Raum des Kontos gebunden:
 *
 * - Buchung auf Gemeinschaftskonto X → nur Kategorien mit `account_id = X`
 * - Buchung auf persönlichem Konto   → nur Kategorien mit `account_id IS NULL AND user_id = ich`
 *
 * Diese Validierung existierte vorher **überhaupt nicht**: weder `transactions`
 * noch `templates` prüften `category_id` auf Existenz oder Zugehörigkeit.
 */
export async function checkAccountAndCategory(
  db: DbAdapter,
  userId: number,
  acc: VisibleAccounts,
  accountId: number,
  categoryId: number | null | undefined
): Promise<string | null> {
  if (!acc.all.includes(Number(accountId))) {
    return "Dieses Konto siehst du nicht.";
  }
  if (categoryId == null) return null;

  const isShared = acc.shared.includes(Number(accountId));
  const { rows } = await db.query(
    // eslint-disable-next-line no-restricted-syntax -- categories: user_id ist der Sichtbarkeitsschlüssel des NULL-Zweigs — genau das wird hier geprüft
    "SELECT id, account_id, user_id FROM categories WHERE id = ?",
    [categoryId]
  );
  if (rows.length === 0) return "Diese Kategorie gibt es nicht.";
  const cat = rows[0] as any;

  if (isShared) {
    if (Number(cat.account_id) !== Number(accountId)) {
      return "Diese Kategorie gehört nicht zu diesem Gemeinschaftskonto.";
    }
    return null;
  }

  if (cat.account_id != null) {
    return "Eine Kategorie eines Gemeinschaftskontos passt nicht zu einer Buchung auf einem persönlichen Konto.";
  }
  if (Number(cat.user_id) !== Number(userId)) {
    return "Diese Kategorie gehört dir nicht.";
  }
  return null;
}

/**
 * Ein frisches Gemeinschaftskonto startet mit **genau einer** Kategorie „Sonstiges".
 *
 * `expense_items.category_id` ist NOT NULL — ohne mindestens eine Kategorie ließe
 * sich auf einem frischen Gemeinschaftskonto keine einzige Fixkostenposition
 * anlegen. Kein fester Satz: WG-Konto, Urlaubskonto und Haushaltskonto brauchen
 * völlig verschiedene Sätze, und ungenutzte Defaults verwässern `byCategory` mit
 * Nullzeilen. Persönliche Konten bleiben unverändert ohne Default.
 */
export async function createDefaultSharedCategory(
  db: DbAdapter,
  accountId: number,
  userId: number
): Promise<void> {
  await db.run(
    // eslint-disable-next-line no-restricted-syntax -- categories trägt user_id als Urheber der Zeile; Sichtbarkeit kommt hier aus account_id
    "INSERT INTO categories (name, color, icon, account_id, user_id) VALUES (?, ?, ?, ?, ?)",
    ["Sonstiges", "#6b7280", "MoreHorizontal", accountId, userId]
  );
}
