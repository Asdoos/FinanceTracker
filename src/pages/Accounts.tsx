import { useState } from "react";
import { useApi, api } from "../lib/api";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";

type Account = {
  id: number;
  name: string;
  color: string;
  description?: string;
  isDefault: boolean;
  freibetrag?: number | null;
  freibetragYear?: number | null;
  interestRate?: number | null;
  interestRateUntil?: string | null;
};

type AccountSummary = {
  account: { id: number; name: string; color: string };
  monthlyExpenses: number;
  monthlyIncome: number;
  rest: number;
  itemCount: number;
  freibetragMonthly: number;
};

type Summary = {
  totalFreibetrag: number;
  byAccount: AccountSummary[];
};

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

const FREIBETRAG_LIMIT = 1000;

export default function Accounts() {
  const { data: accounts, refetch: refetchAccounts } = useApi<Account[]>("/accounts");
  const { data: summary, refetch: refetchSummary } = useApi<Summary>("/summary");

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    color: "#3b82f6",
    description: "",
    freibetrag: "",
    freibetragYear: "",
    interestRate: "",
    interestRateUntil: "",
  });

  if (!accounts || !summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const accSummaryMap = Object.fromEntries(
    summary.byAccount.map((b) => [b.account.id, b])
  );

  const currentYear = new Date().getFullYear();

  function openAdd() {
    setForm({ name: "", color: "#3b82f6", description: "", freibetrag: "", freibetragYear: "", interestRate: "", interestRateUntil: "" });
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(a: Account) {
    setForm({
      name: a.name,
      color: a.color,
      description: a.description ?? "",
      freibetrag: a.freibetrag != null ? String(a.freibetrag) : "",
      freibetragYear: a.freibetragYear != null ? String(a.freibetragYear) : "",
      interestRate: a.interestRate != null ? String(a.interestRate) : "",
      interestRateUntil: a.interestRateUntil ?? "",
    });
    setEditId(a.id);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.name) return;
    const payload = {
      name: form.name,
      color: form.color,
      description: form.description || undefined,
      freibetrag: form.freibetrag ? parseFloat(form.freibetrag) : null,
      freibetragYear: form.freibetragYear ? parseInt(form.freibetragYear) : null,
      interestRate: form.interestRate ? parseFloat(form.interestRate) : null,
      interestRateUntil: form.interestRateUntil || null,
    };
    if (editId) {
      await api.patch(`/accounts/${editId}`, payload);
    } else {
      await api.post("/accounts", payload);
    }
    setShowAdd(false);
    refetchAccounts();
    refetchSummary();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Dieses Konto wirklich löschen?")) return;
    try {
      await api.delete(`/accounts/${id}`);
      refetchAccounts();
      refetchSummary();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Konten</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Konto hinzufügen
        </button>
      </div>

      {/* Freibetrag warning */}
      {summary.totalFreibetrag > FREIBETRAG_LIMIT && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-300">
            Freistellungsauftrag überschritten:{" "}
            <span className="font-semibold">{eur(summary.totalFreibetrag)}</span>
            {" "}/ {eur(FREIBETRAG_LIMIT)} pro Jahr verteilt
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {accounts.map((account) => {
          const s = accSummaryMap[account.id];
          const hasFreibetrag = account.freibetrag != null && account.freibetrag > 0;
          const fbExpired = hasFreibetrag && account.freibetragYear != null && account.freibetragYear < currentYear;

          return (
            <div
              key={account.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{account.name}</div>
                    {account.description && (
                      <div className="text-xs text-gray-500">{account.description}</div>
                    )}
                    {hasFreibetrag && (
                      <>
                        <div className={`text-xs mt-0.5 ${fbExpired ? "text-red-400" : "text-gray-400"}`}>
                          Freibetrag: {eur(account.freibetrag!)} / Jahr
                          {" "}(= {eur(account.freibetrag! / 12)} / Monat)
                        </div>
                        <div className={`text-xs ${fbExpired ? "text-red-400" : "text-gray-500"}`}>
                          {account.freibetragYear != null
                            ? fbExpired
                              ? `abgelaufen ${account.freibetragYear}`
                              : `bis ${account.freibetragYear}`
                            : "unbefristet"}
                        </div>
                      </>
                    )}
                    {account.interestRate != null && account.interestRate > 0 && (() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const until = account.interestRateUntil;
                      const expired  = !!until && until < today;
                      const expiring = !expired && !!until &&
                        new Date(until) <= new Date(Date.now() + 60 * 86_400_000);
                      const cls = expired ? "text-red-400" : expiring ? "text-yellow-400" : "text-emerald-400";
                      return (
                        <>
                          <div className={`text-xs mt-0.5 ${cls}`}>
                            Zinsen: {account.interestRate.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % p.a.
                          </div>
                          <div className={`text-xs ${cls}`}>
                            {until
                              ? expired
                                ? `abgelaufen ${new Date(until).toLocaleDateString("de-DE")}`
                                : `bis ${new Date(until).toLocaleDateString("de-DE")}`
                              : "unbefristet"}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(account)}
                    className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="p-1.5 hover:bg-red-900/40 rounded text-gray-400 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {s && (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Einnahmen</p>
                    <p className="text-green-400 font-medium">{eur(s.monthlyIncome)}</p>
                    <p className="text-gray-600 text-xs">/Monat</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Ausgaben</p>
                    <p className="text-red-400 font-medium">{eur(s.monthlyExpenses)}</p>
                    <p className="text-gray-600 text-xs">{s.itemCount} Posten</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Rest</p>
                    <p
                      className={`font-medium ${
                        s.rest >= 0 ? "text-blue-400" : "text-orange-400"
                      }`}
                    >
                      {eur(s.rest)}
                    </p>
                    <p className="text-gray-600 text-xs">/Monat</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editId ? "Konto bearbeiten" : "Konto hinzufügen"}
              </h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                placeholder="z.B. Hauptkonto"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Beschreibung (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Farbe</label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-lg transition-transform ${
                      form.color === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-gray-900" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Freibetrag €/Jahr (optional)</label>
                <input
                  type="number"
                  value={form.freibetrag}
                  onChange={(e) => setForm((f) => ({ ...f, freibetrag: e.target.value }))}
                  className="input"
                  placeholder="z.B. 801"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Bis Jahr (leer = unbefristet)</label>
                <input
                  type="number"
                  value={form.freibetragYear}
                  onChange={(e) => setForm((f) => ({ ...f, freibetragYear: e.target.value }))}
                  className="input"
                  placeholder={String(currentYear)}
                  min="2000"
                  max="2100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Zinssatz % p.a. (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.interestRate}
                  onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                  className="input"
                  placeholder="z.B. 3.50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Gültig bis (leer = unbefristet)</label>
                <input
                  type="date"
                  value={form.interestRateUntil}
                  onChange={(e) => setForm((f) => ({ ...f, interestRateUntil: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Check size={15} />
                {editId ? "Speichern" : "Hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
