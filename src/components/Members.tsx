import { useState } from "react";
import { api, useApi } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { eur } from "../lib/format";
import toast from "react-hot-toast";
import { Modal } from "./Modal";
import { Users, UserPlus, LogOut, Trash2, Lock, Check, AlertTriangle } from "lucide-react";

export interface Member {
  userId: number;
  email: string;
  displayName: string | null;
  role: "owner" | "member";
  status: "pending" | "active";
}

export interface Invitation {
  accountId: number;
  name: string;
  color: string;
  invitedBy: string;
}

export interface FreibetragMember {
  userId: number;
  displayName: string;
  freibetrag: number | null;
  freibetragYear: number | null;
}

const initials = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/**
 * Kennzeichnung eines geteilten Kontos: **Avatar-Stack plus „N Mitglieder"**.
 * Dieselbe Kennzeichnung wird von hier auf Buchungs-Modal, Filter und
 * Kontoauszug-Leiste übertragen.
 */
export function MemberStack({ members }: { members: { userId: number; displayName: string }[] }) {
  // Gespeist aus `freibetragByMember`, das die Konten-Nutzlast an geteilten Konten
  // ohnehin mitbringt — sonst bräuchte die Liste einen Request je Konto.
  if (members.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex -space-x-1.5">
        {members.slice(0, 3).map((m) => (
          <span
            key={m.userId}
            title={m.displayName}
            className="w-5 h-5 rounded-full bg-gray-700 border border-gray-900 text-[10px] font-medium text-gray-200 flex items-center justify-center"
          >
            {initials(m.displayName)}
          </span>
        ))}
      </span>
      <span className="text-xs text-gray-400">
        {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"}
      </span>
    </span>
  );
}

/**
 * Mitgliederverwaltung eines Gemeinschaftskontos.
 *
 * Nur der Owner darf einladen und entfernen; Mitglieder dürfen alles Fachliche,
 * aber die Mitgliederliste nicht ändern. **Keine Nur-Lesen-Rolle.** Wer austritt,
 * verliert nur die Sicht — Buchungen und Fixkosten gehören dem *Konto*.
 */
export function MembersPanel({
  accountId,
  accountName,
  myUserId,
  onClose,
  onChanged,
}: {
  accountId: number;
  accountName: string;
  myUserId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: members, refetch } = useApi<Member[]>(`/accounts/${accountId}/members`);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Die Rolle steht in der Mitgliederliste selbst — sie muss nicht von außen
  // geraten werden, und die Route entscheidet ohnehin.
  const isOwner = (members ?? []).some((m) => m.userId === myUserId && m.role === "owner");

  async function invite() {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/accounts/${accountId}/members`, { email });
      setEmail("");
      refetch();
      toast.success("Einladung verschickt");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number, self: boolean) {
    const question = self
      ? `Aus „${accountName}" austreten? Deine Buchungen bleiben am Konto, du siehst sie danach nicht mehr.`
      : "Dieses Mitglied entfernen? Seine Buchungen bleiben am Konto.";
    if (!window.confirm(question)) return;
    try {
      await api.delete(`/accounts/${accountId}/members/${userId}`);
      refetch();
      onChanged();
      toast.success(self ? "Ausgetreten" : "Mitglied entfernt");
      if (self) onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Modal title={`Mitglieder — ${accountName}`} onClose={onClose} maxWidth="md">
      <div className="space-y-2">
        {(members ?? []).map((m) => {
          const self = m.userId === myUserId;
          return (
            <div
              key={m.userId}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                m.status === "pending"
                  ? "border-dashed border-gray-700 bg-gray-900/40"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">
                  {m.displayName || m.email}
                  {self && <span className="text-gray-500"> (du)</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {m.role === "owner" ? "Eigentümer" : "Mitglied"}
                  {m.status === "pending" && " · Einladung offen"}
                </p>
              </div>
              {m.role === "owner" ? (
                <span className="text-gray-600" title="Der Eigentümer kann nicht entfernt werden">
                  <Lock size={14} />
                </span>
              ) : (isOwner || self) ? (
                <button
                  onClick={() => remove(m.userId, self)}
                  aria-label={self ? "Austreten" : "Entfernen"}
                  className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-900/40"
                >
                  {self ? <LogOut size={14} /> : <Trash2 size={14} />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {isOwner ? (
        <div className="space-y-1 pt-2 border-t border-gray-800">
          <label className="text-xs text-gray-400 font-medium">
            Einladen — exakte E-Mail-Adresse
          </label>
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="name@example.com"
              type="email"
            />
            <button
              onClick={invite}
              disabled={busy || !email}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <UserPlus size={15} /> Einladen
            </button>
          </div>
          <p className="text-xs text-gray-600">
            Die Einladung wird erst wirksam, wenn die andere Person sie annimmt. Bis
            dahin ist nichts von diesem Konto für sie sichtbar.
          </p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-800">
          Nur der Eigentümer kann Mitglieder einladen oder entfernen.
        </p>
      )}
    </Modal>
  );
}

/**
 * Offene Einladungen stehen **in der Kontoliste selbst** als gestrichelter
 * Eintrag — eine Einladung *ist* ein Konto in spe, kein Posteingang.
 */
export function InvitationCard({
  invitation,
  onChanged,
}: {
  invitation: Invitation;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    try {
      await api.post(`/invitations/${invitation.accountId}/${action}`, {});
      onChanged();
      toast.success(action === "accept" ? "Beigetreten" : "Einladung abgelehnt");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-gray-900/40 border border-dashed border-gray-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: invitation.color }} />
        <h3 className="font-medium text-gray-300">{invitation.name}</h3>
        <Users size={13} className="text-gray-500" />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {invitation.invitedBy} hat dich zu diesem Gemeinschaftskonto eingeladen.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => respond("accept")}
          disabled={busy}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Check size={14} /> Beitreten
        </button>
        <button
          onClick={() => respond("decline")}
          disabled={busy}
          className="flex-1 py-1.5 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
        >
          Ablehnen
        </button>
      </div>
    </div>
  );
}

/**
 * Freibeträge je Mitglied — am Gemeinschaftskonto **aufgeschlüsselt sichtbar**.
 *
 * Das ist eine bewusste Offenlegung einer persönlichen Steuerangabe: die
 * Netto-Zinsprojektion rechnet die **Summe aller Mitglieder-Freibeträge** gegen
 * den vollen Bruttozins, und die Zahl wäre sonst unerklärlich. Fremde Werte
 * tragen ein Schloss; das Limit gilt **pro Person**, nicht pro Konto.
 */
export function FreibetragByMember({
  members,
  myUserId,
}: {
  members: FreibetragMember[];
  myUserId: number;
}) {
  const withValue = members.filter((m) => (m.freibetrag ?? 0) > 0);
  if (withValue.length === 0) return null;
  const total = withValue.reduce((s, m) => s + (m.freibetrag ?? 0), 0);

  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-1.5">
      <p className="text-xs text-gray-500">Freibeträge der Mitglieder</p>
      {withValue.map((m) => (
        <div key={m.userId} className="flex items-center justify-between text-xs">
          <span className="text-gray-400 flex items-center gap-1.5">
            {m.userId !== myUserId && <Lock size={10} className="text-gray-600" />}
            {m.userId === myUserId ? "Ich" : m.displayName}
            {m.freibetragYear != null && <span className="text-gray-600">({m.freibetragYear})</span>}
          </span>
          <span className="text-gray-200">{eur(m.freibetrag ?? 0)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-800/60">
        <span className="text-gray-500">Summe gegen den Bruttozins</span>
        <span className="text-gray-200 font-medium">{eur(total)}</span>
      </div>
      <p className="text-xs text-gray-600">Das Limit von 1.000 € gilt pro Person.</p>
    </div>
  );
}

interface ConvertPreview {
  transactions: number;
  expenses: number;
  incomes: number;
  goals: number;
  oldestTransaction: string | null;
  categories: { name: string; budgetLost: number | null }[];
}

/**
 * Bestätigungsdialog der Umwandlung — aus den **Vorschau-Zahlen**, nicht aus einem
 * Warntext: „deine Historie wird sichtbar" ist abstrakt, „1.284 Buchungen seit
 * 03.2021" ist es nicht. Diese Aktion hat als einzige kein Backup-Netz.
 *
 * Der zweite Button ist der einzige verbleibende Weg für den, dem die
 * Vergangenheit zu privat ist.
 */
export function ConvertDialog({
  accountId,
  accountName,
  onClose,
  onDone,
  onCreateNew,
}: {
  accountId: number;
  accountName: string;
  onClose: () => void;
  onDone: () => void;
  onCreateNew: () => void;
}) {
  const { data: preview, error } = useApi<ConvertPreview>(`/accounts/${accountId}/convert-preview`);
  const [busy, setBusy] = useState(false);

  async function convert() {
    setBusy(true);
    try {
      await api.post(`/accounts/${accountId}/convert-to-shared`, {});
      onDone();
      toast.success("Konto ist jetzt ein Gemeinschaftskonto");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const withBudget = (preview?.categories ?? []).filter((c) => c.budgetLost != null);

  return (
    <Modal title={`„${accountName}" umwandeln`} onClose={onClose} maxWidth="md">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!preview ? (
        <p className="text-sm text-gray-500">Lade Vorschau…</p>
      ) : (
        <>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-800/40">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200/90 space-y-1">
              <p className="font-medium">Das ist nicht umkehrbar.</p>
              <p className="text-amber-200/70">
                Künftige Mitglieder sehen die <strong>komplette Historie</strong> dieses
                Kontos, nicht erst ab heute.
              </p>
            </div>
          </div>

          <ul className="text-sm text-gray-300 space-y-1">
            <li>
              <strong>{preview.transactions}</strong> Buchungen
              {preview.oldestTransaction && (
                <span className="text-gray-500">
                  {" "}
                  seit{" "}
                  {new Date(preview.oldestTransaction + "T12:00:00").toLocaleDateString("de-DE", {
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              )}
            </li>
            <li><strong>{preview.expenses}</strong> Fixkostenpositionen</li>
            <li><strong>{preview.incomes}</strong> Einnahmequellen</li>
            <li><strong>{preview.goals}</strong> Sparziele</li>
          </ul>

          {preview.categories.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium">
                Diese Kategorien werden für das Gemeinschaftskonto kopiert
              </p>
              <p className="text-xs text-gray-500">
                {preview.categories.map((c) => c.name).join(", ")}
              </p>
              {withBudget.length > 0 && (
                <p className="text-xs text-amber-300/80">
                  Ohne Budget-Deckel: {withBudget.map((c) => `${c.name} (${eur(c.budgetLost!)})`).join(", ")}
                  {" "}— sonst würde derselbe Deckel doppelt gelten.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={convert}
              disabled={busy}
              className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Wandle um…" : "Ja, dauerhaft in ein Gemeinschaftskonto umwandeln"}
            </button>
            <button
              onClick={() => { onClose(); onCreateNew(); }}
              className="w-full py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
            >
              Stattdessen neues Gemeinschaftskonto anlegen
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-300"
            >
              Abbrechen
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
