import { useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import toast from "react-hot-toast";
import { Modal } from "./Modal";
import { Check } from "lucide-react";

/**
 * Der Weg zu einem eigenen Kategoriensatz für ein Gemeinschaftskonto.
 *
 * **Auswahlliste aus dem persönlichen Satz plus Vorschlägen** — nicht ein leeres
 * Formular, das man zehnmal ausfüllt: ein frisches Gemeinschaftskonto startet mit
 * genau einer Kategorie „Sonstiges", und wer eine WG-Kasse einrichtet, braucht
 * typischerweise vier bis sechs auf einmal.
 *
 * **Ohne Budget-Übernahme.** Derselbe Deckel in zwei Räumen wären aus 400 € still
 * 800 €, und beide Fortschrittsbalken stünden entspannt bei 50 % — dieselbe
 * Begründung, aus der die Umwandlung `budget_limit` nicht mitkopiert.
 */

/** Vorschläge für einen geteilten Raum — bewusst kein fester Satz, nur Anregungen. */
const SUGGESTIONS = [
  { name: "Miete & Nebenkosten", color: "#ef4444", icon: "🏠" },
  { name: "Lebensmittel", color: "#f97316", icon: "🛒" },
  { name: "Strom & Internet", color: "#8b5cf6", icon: "💡" },
  { name: "Haushalt", color: "#06b6d4", icon: "🧽" },
  { name: "Gemeinsame Freizeit", color: "#10b981", icon: "🎉" },
  { name: "Reparaturen", color: "#f59e0b", icon: "🔧" },
];

export interface PickableCategory {
  name: string;
  color: string;
  icon?: string;
  /** Nur zur Anzeige: dieser Deckel wird **nicht** übernommen. */
  budget?: number | null;
}

export function CategoryPicker({
  accountId,
  accountName,
  personal,
  existing,
  onClose,
  onCreated,
}: {
  accountId: number;
  accountName: string;
  /** Der persönliche Satz des Nutzers. */
  personal: PickableCategory[];
  /** Namen, die es in diesem Raum schon gibt — die kommen nicht doppelt. */
  existing: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const fromPersonal = personal.filter((c) => !taken.has(c.name.toLowerCase()));
  const fromSuggestions = SUGGESTIONS.filter(
    (c) => !taken.has(c.name.toLowerCase()) && !fromPersonal.some((p) => p.name.toLowerCase() === c.name.toLowerCase())
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const all = [...fromPersonal, ...fromSuggestions];
  const anyBudgetDropped = fromPersonal.some(
    (c) => picked.has(c.name) && c.budget != null && c.budget > 0
  );

  async function create() {
    const chosen = all.filter((c) => picked.has(c.name));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const c of chosen) {
        await api.post("/categories", {
          name: c.name,
          color: c.color,
          icon: c.icon,
          // Kein Budget: siehe Kommentar oben.
          budget: null,
          accountId,
        });
      }
      onCreated();
      toast.success(
        chosen.length === 1 ? "Kategorie angelegt" : `${chosen.length} Kategorien angelegt`
      );
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function Row({ c, source }: { c: PickableCategory; source: string }) {
    const on = picked.has(c.name);
    return (
      <button
        onClick={() => toggle(c.name)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
          on ? "border-blue-500 bg-blue-600/10" : "border-gray-800 bg-gray-900 hover:border-gray-700"
        }`}
      >
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: c.color }}
        >
          {c.icon ? c.icon : c.name[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-white truncate">{c.name}</span>
          <span className="block text-xs text-gray-500">
            {source}
            {c.budget != null && c.budget > 0 && " · Budget wird nicht übernommen"}
          </span>
        </span>
        {on && <Check size={15} className="text-blue-400 shrink-0" />}
      </button>
    );
  }

  return (
    <Modal title={`Kategorien für „${accountName}"`} onClose={onClose} maxWidth="md">
      {all.length === 0 ? (
        <p className="text-sm text-gray-500">
          Es gibt nichts zu übernehmen — dieser Raum hat schon alle Kategorien deines
          persönlichen Satzes und alle Vorschläge.
        </p>
      ) : (
        <>
          {fromPersonal.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 font-medium">Aus deinem persönlichen Satz</p>
              {fromPersonal.map((c) => (
                <Row key={"p-" + c.name} c={c} source="persönlicher Satz" />
              ))}
            </div>
          )}
          {fromSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 font-medium">Vorschläge</p>
              {fromSuggestions.map((c) => (
                <Row key={"s-" + c.name} c={c} source="Vorschlag" />
              ))}
            </div>
          )}

          <p className="text-xs text-gray-600">
            Kategorien eines Gemeinschaftskontos sind von deinen persönlichen getrennt.
            Ein Name kann in beiden Räumen vorkommen — die Zahlen bleiben getrennt.
            {anyBudgetDropped && (
              <>
                {" "}
                <span className="text-amber-300/80">
                  Budget-Deckel werden bewusst nicht übernommen: derselbe Deckel in zwei
                  Räumen wäre in Summe der doppelte.
                </span>
              </>
            )}
          </p>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
            >
              Abbrechen
            </button>
            <button
              onClick={create}
              disabled={busy || picked.size === 0}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={15} />
              {busy
                ? "Lege an…"
                : picked.size === 0
                ? "Nichts ausgewählt"
                : `${picked.size} übernehmen`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
