import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle, ArrowLeft, Calculator, Check, ChevronDown, ChevronRight, Plus, Trash2, Wand2,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { eur } from "../lib/format";
import { errorMessage } from "../lib/errors";
import { useAuth } from "../context/AuthContext";
import {
  SALARY_CATALOG,
  salaryCatalogEntry,
  salaryComponentLabel,
  type SalaryCatalogEntry,
} from "../../shared/salaryCatalog";

/**
 * Der Gehaltszettel — Vollseiten-Editor, links die Palette, rechts der Zettel.
 *
 * **Warum eine eigene Route und kein Modal.** Fünfzehn Bestandteilsarten neben einer
 * Live-Summe brauchen den Platz, und beim *Bearbeiten* — dem häufigeren Fall — wäre ein
 * Assistentenschritt reiner Weg. Teilbarer Link und funktionierendes Browser-Zurück sind
 * bei einer Ansicht dieser Größe mehr wert als die Musterreinheit.
 *
 * **Damit bricht das Modal-Muster, mit Auflage.** Die Frische-Mechanik in `CLAUDE.md`
 * stützt sich darauf, dass jede Seite ihre Modale lokal hält und `{ paused }` das
 * Nachladen bei Fokus anhält. Eine Route hat kein Modal, das man pausieren könnte — die
 * Begründung gilt aber unverändert und hier **stärker**: dieses Formular steht länger
 * offen als jedes Modal. Deshalb sind alle `useApi`-Aufrufe **dauerhaft** pausiert
 * (`paused: true` als Konstante, nicht als Zustand). Das lädt einmal beim Betreten und
 * nie wieder — wer die Pause vergisst, bekommt genau den Fehler, gegen den sie erfunden
 * wurde: man wechselt zum Taschenrechner, kommt zurück, und die Daten unter dem halb
 * gefüllten Zettel haben sich verschoben.
 */

type Account = {
  id: number;
  name: string;
  color: string;
  isShared: boolean;
  isDefault: boolean;
  freibetragByMember?: { userId: number; displayName: string }[];
};

type IncomeItem = {
  id: number;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  accountId: number;
};

type ApiComponent = {
  id: number;
  kind: string;
  label: string | null;
  displayLabel: string;
  amount: number;
  type: "monthly" | "annual";
  isActive: boolean;
  hourlyRate: number | null;
  hours: number | null;
  betragSchwankt: boolean;
};

type ApiSalary = {
  id: number;
  employer: string;
  accountId: number;
  isActive: boolean;
  note?: string;
  monthlyAmount: number;
  components: ApiComponent[];
};

/**
 * Ein Posten im Formular. Beträge sind **Zeichenketten**, weil ein halb getipptes
 * `"1,"` keine Zahl ist und ein `number`-Zustand daraus stillschweigend `1` machen
 * würde.
 *
 * `id` fehlt, solange der Posten nur im Formular existiert. `sourceIncomeId` markiert
 * einen Posten, der aus einer bestehenden Einnahme übernommen wurde — er geht beim
 * Speichern durch die **atomare** Übernahme-Operation, nicht durch ein gewöhnliches
 * POST, weil sonst das Geld bis zum Löschen der Quellzeile doppelt zählt.
 */
type Draft = {
  uid: number;
  id?: number;
  kind: string;
  label: string;
  amount: string;
  type: "monthly" | "annual";
  hourlyRate: string;
  hours: string;
  isActive: boolean;
  sourceIncomeId?: number;
};

let uidCounter = 1;

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const monthly = (d: Draft) => (d.type === "annual" ? num(d.amount) / 12 : num(d.amount));
const sum = (ds: Draft[]) => ds.reduce((s, d) => s + monthly(d), 0);

/** Unbekanntes `kind` fällt auf den rohen Schlüssel zurück, statt abzustürzen. */
const displayName = (d: Draft) => salaryComponentLabel(d.kind, d.label);
/**
 * `schwankt` kommt aus dem Katalog und ist **nicht** am Posten änderbar — die Spalte
 * dafür existiert nicht (siehe Ticket 15 auf der Karte). Deshalb steht das Merkmal hier
 * als Marke, nicht als Ankreuzfeld: ein Feld anzubieten, das nirgends landet, ist
 * schlimmer als keines.
 */
const schwankt = (d: Draft) => salaryCatalogEntry(d.kind)?.betragSchwankt ?? false;
/**
 * **Abzug ist `amount < 0`, nicht „kind ist entgeltumwandlung".** Das Vorzeichen ist
 * nach Ticket 03 die eine Tatsache am einen Ort; der Katalog belegt es nur vor. Wer
 * einen negativen Zuschuss einträgt, hat einen Abzug — die Aufteilung der Summe muss
 * ihm folgen, sonst zeigt der Zettelkopf etwas anderes als seine Zeilen.
 */
const isDeduction = (d: Draft) => num(d.amount) < 0;

const missingLabel = (d: Draft) => d.kind === "sonstiges" && d.label.trim() === "";

function draftFromCatalog(entry: SalaryCatalogEntry): Draft {
  return {
    uid: uidCounter++,
    kind: entry.kind,
    label: "",
    // Das Minus bei einem Abzug wird **vorbelegt sichtbar**, nicht stillschweigend beim
    // Speichern gedreht: sonst tippt jemand `250` und meint einen Abzug.
    amount: entry.vorzeichen < 0 ? "-" : "",
    type: entry.type,
    hourlyRate: "",
    hours: "",
    isActive: true,
  };
}

function draftFromApi(c: ApiComponent): Draft {
  return {
    uid: uidCounter++,
    id: c.id,
    kind: c.kind,
    label: c.label ?? "",
    amount: String(c.amount),
    type: c.type,
    hourlyRate: c.hourlyRate == null ? "" : String(c.hourlyRate),
    hours: c.hours == null ? "" : String(c.hours),
    isActive: c.isActive,
  };
}

/** Wie der Server: `round(rate × hours, 2)` in ganzen Cent. */
function derive(rate: string, hours: string): string | null {
  const r = num(rate);
  const h = num(hours);
  if (!(r > 0) || !(h > 0)) return null;
  return (Math.round(r * h * 100) / 100).toFixed(2);
}

export default function SalaryEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const templateId = searchParams.get("vorlage");
  const isEdit = !!id;

  // **Dauerhaft pausiert** — siehe Kopfkommentar. Einmal laden, nie bei Fokus nachladen.
  const { data: accounts } = useApi<Account[]>("/accounts", { paused: true });
  const { data: incomes } = useApi<IncomeItem[]>("/income", { paused: true });
  const { data: salaries, loading: salariesLoading } = useApi<ApiSalary[]>("/salaries", { paused: true });

  const sourceId = id ?? templateId;
  const source = salaries?.find((s) => String(s.id) === String(sourceId));

  const [employer, setEmployer] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [components, setComponents] = useState<Draft[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [originalAccountId, setOriginalAccountId] = useState("");
  const [confirmShare, setConfirmShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Vorbelegung auf das **persönliche** Standardkonto — ausdrücklich nicht auf
   * `isDefault`, das auf einem Gemeinschaftskonto stehen kann. Eine Offenlegung durch
   * Vorbelegung wäre kein Modellfehler, aber derselbe Schaden.
   */
  const personalDefault = useMemo(() => {
    if (!accounts) return undefined;
    const personal = accounts.filter((a) => !a.isShared);
    return personal.find((a) => a.isDefault) ?? personal[0] ?? accounts[0];
  }, [accounts]);

  // Einmalige Befüllung, sobald die Daten da sind. Kein `useEffect` mit
  // Abhängigkeitsliste, die später erneut zuschlägt: das Formular gehört ab dem ersten
  // Zug dem Nutzer.
  if (!hydrated && accounts && (!sourceId || !salariesLoading)) {
    if (source) {
      // Vorlagenweg: Posten samt Beträgen übernehmen, Arbeitgeber leer lassen — beim
      // Jobwechsel ist der Arbeitgeber das Einzige, was sich sicher ändert.
      setEmployer(isEdit ? source.employer : "");
      setAccountId(String(source.accountId));
      setOriginalAccountId(String(source.accountId));
      setNote(source.note ?? "");
      setIsActive(source.isActive);
      setComponents(
        source.components.map((c) => {
          const d = draftFromApi(c);
          // Eine Vorlage erzeugt **neue** Posten: die ID des Quellpostens darf nicht
          // mitwandern, sonst patcht das Speichern das Quellgehalt.
          return isEdit ? d : { ...d, id: undefined };
        })
      );
    } else {
      const preset = personalDefault ? String(personalDefault.id) : "";
      setAccountId(preset);
      setOriginalAccountId(preset);
    }
    setHydrated(true);
  }

  const account = accounts?.find((a) => String(a.id) === accountId);

  /** Die Mitleser sind die **anderen** aktiven Mitglieder, nicht ich selbst. */
  const readers = useMemo(() => {
    if (!account?.isShared) return [];
    return (account.freibetragByMember ?? [])
      .filter((m) => m.userId !== user?.id)
      .map((m) => m.displayName);
  }, [account, user]);

  /**
   * Persönlich → geteilt ist derselbe Offenlegungsakt wie die Anlage, nur unauffälliger:
   * niemand erwartet, dass eine Feldänderung im Bearbeitungsformular das Grundgehalt für
   * den Partner sichtbar macht. Deshalb hier **Bestätigung**, nicht nur Hinweis.
   * Umgekehrt (geteilt → persönlich) braucht es nichts — das entzieht nur Sicht.
   */
  const becomesShared =
    isEdit &&
    !!account?.isShared &&
    accountId !== originalAccountId &&
    !accounts?.find((a) => String(a.id) === originalAccountId)?.isShared;

  const adoptable = (incomes ?? []).filter(
    (i) => String(i.accountId) === accountId && !components.some((c) => c.sourceIncomeId === i.id)
  );

  const patchDraft = (uid: number, f: (d: Draft) => Draft) =>
    setComponents((ds) => ds.map((d) => (d.uid === uid ? f(d) : d)));

  function addFromCatalog(entry: SalaryCatalogEntry) {
    const d = draftFromCatalog(entry);
    setComponents((ds) => [...ds, d]);
    setOpenUid(d.uid);
  }

  function addFromIncome(item: IncomeItem) {
    const d: Draft = {
      uid: uidCounter++,
      kind: "sonstiges",
      // Die Bezeichnung der Einnahme wird verbatim übernommen — der Nutzer sieht sie und
      // kann sie leeren, dann greift der Katalogname.
      label: item.label,
      amount: String(item.amount),
      type: item.type,
      hourlyRate: "",
      hours: "",
      isActive: true,
      sourceIncomeId: item.id,
    };
    setComponents((ds) => [...ds, d]);
    setOpenUid(d.uid);
  }

  function removeDraft(d: Draft) {
    if (d.id) setRemovedIds((ids) => [...ids, d.id!]);
    setComponents((ds) => ds.filter((x) => x.uid !== d.uid));
  }

  /** Betrag direkt ändern **verwirft die Herleitung** — dieselbe Regel wie im Server. */
  function setAmount(uid: number, amount: string) {
    patchDraft(uid, (d) => ({ ...d, amount, hourlyRate: "", hours: "" }));
  }
  /** Satz oder Stunden ändern rechnet den Betrag neu, damit die Invariante hält. */
  function setDerivation(uid: number, rate: string, hours: string) {
    patchDraft(uid, (d) => {
      const derived = derive(rate, hours);
      return { ...d, hourlyRate: rate, hours, amount: derived ?? d.amount };
    });
  }

  const inflows = components.filter((d) => !isDeduction(d));
  const deductions = components.filter(isDeduction);
  const fixed = inflows.filter((d) => !schwankt(d));
  const variable = inflows.filter(schwankt);
  const total = sum(components);

  /**
   * Die Zod-Regeln des Servers **gespiegelt**, nicht ersetzt: der Server bleibt die
   * Grenze, die Seite hält nur davon ab, in sie hineinzulaufen.
   */
  const problems: string[] = [];
  if (employer.trim() === "") problems.push("Der Arbeitgeber fehlt.");
  if (accountId === "") problems.push("Es ist kein Konto gewählt.");
  if (components.length === 0) problems.push("Das Gehalt hat noch keinen Bestandteil.");
  if (components.some(missingLabel)) problems.push('Ein Posten „Sonstiges" braucht eine Bezeichnung.');
  if (components.some((d) => num(d.amount) === 0)) problems.push("Ein Posten hat den Betrag 0.");
  if (components.some((d) => (d.hourlyRate !== "") !== (d.hours !== "")))
    problems.push("Stundensatz und Stunden gehören zusammen — entweder beide oder keiner.");

  function payloadOf(d: Draft) {
    const hasDerivation = d.hourlyRate !== "" && d.hours !== "";
    return {
      kind: d.kind,
      label: d.label.trim() === "" ? null : d.label.trim(),
      amount: num(d.amount),
      type: d.type,
      // Betrag und Herleitung gehen **zusammen** raus: ein PATCH mit nur `hours` würde
      // vom Server gegen den gespeicherten Betrag geprüft und abgelehnt.
      hourlyRate: hasDerivation ? num(d.hourlyRate) : null,
      hours: hasDerivation ? num(d.hours) : null,
      isActive: d.isActive,
    };
  }

  /**
   * Die Übernahme, zuletzt und **atomar**: der Server legt den Posten an und löscht die
   * Quellzeile in einer Transaktion. Danach trägt der Posten die Werte der *Quellzeile* —
   * der Zettel ist ab der Übernahme aber die Wahrheit für die Zeile (der Nutzer kann den
   * Betrag im Formular schon geändert haben), also wird sie einmal nachgezogen.
   */
  async function adoptStep(salaryId: number) {
    const adopted = components.filter((d) => d.sourceIncomeId && !d.id);
    if (adopted.length === 0) return;

    const result = await api.post<{ componentIds: number[] }>(
      `/salaries/${salaryId}/adopt-income`,
      {
        items: adopted.map((d) => ({
          incomeId: d.sourceIncomeId,
          kind: d.kind,
          label: d.label.trim() === "" ? null : d.label.trim(),
        })),
      }
    );
    for (let i = 0; i < adopted.length; i++) {
      const newId = result.componentIds[i];
      patchDraft(adopted[i].uid, (x) => ({ ...x, id: newId, sourceIncomeId: undefined }));
      await api.patch(`/salaries/${salaryId}/components/${newId}`, payloadOf(adopted[i]));
    }
  }

  async function save() {
    if (problems.length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const head = { employer: employer.trim(), accountId: Number(accountId), note: note.trim() || null, isActive };

      // Reihenfolge: löschen, ändern, anlegen, übernehmen. Angelegte Posten bekommen
      // ihre ID sofort in den Zustand — bricht ein späterer Schritt ab, legt ein zweiter
      // Klick sie nicht ein zweites Mal an, sondern ändert sie.
      let salaryId: number;
      if (isEdit) {
        salaryId = Number(id);
        await api.patch(`/salaries/${salaryId}`, head);
        for (const removed of removedIds) {
          await api.delete(`/salaries/${salaryId}/components/${removed}`);
        }
        setRemovedIds([]);
        for (const d of components.filter((x) => x.id)) {
          await api.patch(`/salaries/${salaryId}/components/${d.id}`, payloadOf(d));
        }
        for (const d of components.filter((x) => !x.id && !x.sourceIncomeId)) {
          const created = await api.post<{ id: number }>(`/salaries/${salaryId}/components`, payloadOf(d));
          patchDraft(d.uid, (x) => ({ ...x, id: created.id }));
        }
      } else {
        // Das Gehalt und seine Katalogposten entstehen in **einer** Transaktion — bricht
        // der Lauf ab, gibt es kein Torso-Gehalt, das in jeder Summe als 0 € auftritt.
        const created = await api.post<{ id: number }>("/salaries", {
          ...head,
          components: components.filter((d) => !d.sourceIncomeId).map(payloadOf),
        });
        salaryId = created.id;

        // **Ab hier existiert das Gehalt.** Scheitert ein Folgeschritt, darf ein zweiter
        // Klick auf „Speichern" es nicht ein zweites Mal anlegen — die Posten-IDs der
        // eben angelegten Zeilen kennt diese Seite aber nicht (die Anlage liefert nur die
        // Gehalts-ID). Deshalb wird auf die Bearbeiten-Route umgeschaltet: die Seite lädt
        // dort frisch, und ein erneuter Versuch ist ein gewöhnliches Ändern statt eines
        // zweiten Anlegens.
        try {
          await adoptStep(salaryId);
        } catch (err) {
          setSaveError(
            `Das Gehalt wurde angelegt, aber die Übernahme der Einnahmen ist fehlgeschlagen: ${errorMessage(err)}`
          );
          navigate(`/income/gehalt/${salaryId}`, { replace: true });
          return;
        }
        toast.success("Gehalt angelegt");
        navigate("/income");
        return;
      }

      await adoptStep(salaryId);

      toast.success("Gehalt gespeichert");
      navigate("/income");
    } catch (err) {
      setSaveError(errorMessage(err, "Speichern fehlgeschlagen"));
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && !salariesLoading && !source) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <p className="text-gray-300">Dieses Gehalt gibt es nicht (mehr).</p>
        <button onClick={() => navigate("/income")} className="text-blue-400 hover:text-blue-300 text-sm">
          Zurück zu den Einnahmen
        </button>
      </div>
    );
  }

  const paletteGroup = (title: string, tone: string, entries: readonly SalaryCatalogEntry[]) => (
    <div>
      <p className={`text-xs uppercase tracking-wide mb-2 ${tone}`}>{title}</p>
      <div className="space-y-1">
        {entries.map((entry) => (
          <button
            key={entry.kind}
            onClick={() => addFromCatalog(entry)}
            title={entry.beispiele ? `z. B. ${entry.beispiele}` : undefined}
            className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
          >
            <Plus size={12} className="text-gray-600 flex-shrink-0" />
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  function row(d: Draft) {
    const entry = salaryCatalogEntry(d.kind);
    const open = openUid === d.uid;
    const deduction = isDeduction(d);
    return (
      <div key={d.uid} className="border-b border-gray-800/60 last:border-0">
        <button
          onClick={() => setOpenUid(open ? null : d.uid)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/30 text-left"
        >
          {open ? (
            <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />
          )}
          <span className="flex-1 text-sm text-gray-200 min-w-0">
            <span className={d.isActive ? "" : "text-gray-500 line-through"}>{displayName(d)}</span>
            {schwankt(d) && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400/80">schwankt</span>
            )}
            {d.type === "annual" && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">jährlich</span>
            )}
            {d.sourceIncomeId && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-400/80">übernommen</span>
            )}
            {missingLabel(d) && <span className="ml-2 text-[10px] text-red-400">Bezeichnung fehlt</span>}
          </span>
          <span className={`text-sm tabular-nums flex-shrink-0 ${deduction ? "text-red-400" : "text-gray-100"}`}>
            {eur(monthly(d))}
          </span>
        </button>
        {open && (
          <div className="px-4 md:px-11 pb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={d.label}
                onChange={(e) => patchDraft(d.uid, (x) => ({ ...x, label: e.target.value }))}
                className={`input py-1 text-sm w-44 ${missingLabel(d) ? "border-red-700" : ""}`}
                placeholder={entry?.label ?? d.kind}
              />
              <input
                value={d.amount}
                onChange={(e) => setAmount(d.uid, e.target.value)}
                className="input py-1 text-sm w-28 text-right"
                placeholder="0,00"
                inputMode="decimal"
              />
              <select
                value={d.type}
                onChange={(e) =>
                  patchDraft(d.uid, (x) => ({ ...x, type: e.target.value as "monthly" | "annual" }))
                }
                className="input py-1 text-sm w-28"
              >
                <option value="monthly">monatlich</option>
                <option value="annual">jährlich</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={d.isActive}
                  onChange={(e) => patchDraft(d.uid, (x) => ({ ...x, isActive: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-800 text-blue-500"
                />
                zählt mit
              </label>
              <button
                onClick={() => removeDraft(d)}
                className="p-1 text-gray-500 hover:text-red-400 ml-auto"
                title="Posten entfernen"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {/* Der Rechner steht bei **allen** Arten zur Verfügung; `stundenhilfe`
                entscheidet nur, ob er offen startet. Wer stundenweise abgerechnete
                Bereitschaft als „Sonstiges" führt, kommt an ihn heran. */}
            <details open={entry?.stundenhilfe || (d.hourlyRate !== "" && d.hours !== "")}>
              <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1.5">
                <Calculator size={13} /> Aus Stunden rechnen
              </summary>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-2">
                <input
                  value={d.hourlyRate}
                  onChange={(e) => setDerivation(d.uid, e.target.value, d.hours)}
                  className="input py-1 w-20 text-right"
                  placeholder="Satz"
                  inputMode="decimal"
                />
                <span>€ ×</span>
                <input
                  value={d.hours}
                  onChange={(e) => setDerivation(d.uid, d.hourlyRate, e.target.value)}
                  className="input py-1 w-20 text-right"
                  placeholder="Std."
                  inputMode="decimal"
                />
                <span>Std. {d.type === "annual" ? "im Jahr" : "im Monat"}</span>
                {d.type === "monthly" && (
                  <button
                    onClick={() => setDerivation(d.uid, d.hourlyRate, String(Math.round(num(d.hours) * 4.33 * 100) / 100))}
                    className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
                    title="Wochenstunden × 4,33 — gespeichert wird immer die Zahl der Periode"
                  >
                    × 4,33
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-600 mt-1">
                Den Betrag direkt zu ändern verwirft die Herleitung.
              </p>
            </details>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/income")}
          className="p-1.5 hover:bg-gray-800 rounded text-gray-400"
          title="Zurück"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-semibold text-white">
          {isEdit ? "Gehalt bearbeiten" : templateId ? "Neues Gehalt nach Vorlage" : "Neues Gehalt"}
        </h2>
      </div>

      <div className="grid md:grid-cols-[16rem_1fr] gap-5">
        {/* ── Palette ─────────────────────────────────────────────────────── */}
        <div className="space-y-4 order-2 md:order-1">
          {paletteGroup(
            "Feste Bestandteile",
            "text-gray-500",
            SALARY_CATALOG.filter((k) => !k.betragSchwankt && k.vorzeichen > 0)
          )}
          {paletteGroup("Schwankend", "text-amber-500/70", SALARY_CATALOG.filter((k) => k.betragSchwankt))}
          {paletteGroup("Abzug", "text-red-500/70", SALARY_CATALOG.filter((k) => k.vorzeichen < 0))}

          {adoptable.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-400/70 mb-2">Bestehende Einnahmen</p>
              <div className="space-y-1">
                {adoptable.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addFromIncome(item)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 flex items-center gap-2"
                  >
                    <Wand2 size={12} className="text-blue-500/70 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-1 px-3">
                Übernommene Zeilen verschwinden beim Speichern aus den Einnahmen.
              </p>
            </div>
          )}
        </div>

        {/* ── Der Zettel ──────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden order-1 md:order-2">
          <div className="p-5 border-b border-gray-800 space-y-3">
            <input
              value={employer}
              onChange={(e) => setEmployer(e.target.value)}
              placeholder="Arbeitgeber"
              className="bg-transparent text-lg font-semibold text-white placeholder-gray-600 focus:outline-none w-full"
            />

            {/* Chip-Reihe statt Auswahlfeld: bei einer Angabe, die über Offenlegung
                entscheidet, soll die aktuelle Wahl ohne Aufklappen sichtbar sein. */}
            <div className="flex flex-wrap gap-1.5">
              {(accounts ?? []).map((a) => {
                const active = String(a.id) === accountId;
                return (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(String(a.id))}
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      active ? "" : "text-gray-400 border-gray-700 hover:border-gray-500"
                    }`}
                    style={active ? { backgroundColor: a.color + "22", borderColor: a.color, color: a.color } : undefined}
                  >
                    {a.name}
                    {a.isShared ? " · gemeinsam" : ""}
                  </button>
                );
              })}
            </div>

            {readers.length > 0 && (
              <p className="text-xs text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{readers.join(", ")} liest mit — auch das Grundgehalt.</span>
              </p>
            )}

            <div className="pt-2">
              <div
                className={`text-3xl font-semibold tabular-nums ${total < 0 ? "text-red-400" : "text-green-400"}`}
              >
                {eur(total)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                pro Monat · davon {eur(sum(fixed))} fest, {eur(sum(variable))} schwankend
                {deductions.length > 0 && <> · {eur(sum(deductions))} Abzug</>}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-400 pt-1">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-blue-500"
              />
              Dieses Gehalt zählt mit (aus beim Jobwechsel — es bleibt erhalten)
            </label>
          </div>

          {components.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-12">Links eine Art anklicken.</p>
          ) : (
            <>
              <div>{inflows.map(row)}</div>
              {deductions.length > 0 && (
                <div className="border-t-2 border-dashed border-gray-800">
                  <p className="px-4 pt-3 text-[11px] uppercase tracking-wide text-gray-500">Abzüge</p>
                  {deductions.map(row)}
                </div>
              )}
            </>
          )}

          <div className="p-4 border-t border-gray-800 space-y-3">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notiz (optional)"
              className="input py-1.5 text-sm"
            />
            {problems.length > 0 && (
              <ul className="text-xs text-amber-400/90 space-y-0.5">
                {problems.map((p) => (
                  <li key={p}>· {p}</li>
                ))}
              </ul>
            )}
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/income")}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={() => (becomesShared ? setConfirmShare(true) : save())}
                disabled={problems.length > 0 || saving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Check size={15} /> {saving ? "Speichern …" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmShare && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 border border-amber-600/50 rounded-2xl p-6 max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold text-white">Gehalt offenlegen?</h3>
                <p className="text-sm text-gray-300">
                  Auf diesem Gemeinschaftskonto {readers.length === 1 ? "liest" : "lesen"}{" "}
                  <strong className="text-amber-200">{readers.join(", ")}</strong> künftig alles mit:
                  Arbeitgeber, Grundgehalt, jeden Zuschlag und jede Stunde.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmShare(false)}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  setConfirmShare(false);
                  save();
                }}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium"
              >
                Ja, offenlegen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
