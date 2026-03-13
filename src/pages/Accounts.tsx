import { useState } from "react";
import { useApi, api } from "../lib/api";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, AlertTriangle, Wallet, TrendingUp } from "lucide-react";

const TAX_RATE = 0.26375; // Abgeltungssteuer 25% + Soli 5,5%

function calcInterestYear(balance: number, rate: number, freibetrag: number) {
  const brutto = balance * (rate / 100);
  const steuerpflichtig = Math.max(0, brutto - freibetrag);
  const steuer = steuerpflichtig * TAX_RATE;
  const netto = brutto - steuer;
  return { brutto, steuer, netto };
}

function calcInterestProjection(
  balance: number,
  rate: number,
  freibetrag: number,
  years: number[]
): { year: number; kumuliertNetto: number; endguthaben: number }[] {
  const results = [];
  let bal = balance;
  let kumuliert = 0;
  let yearIdx = 0;
  const maxYear = Math.max(...years);

  for (let y = 1; y <= maxYear; y++) {
    const { netto } = calcInterestYear(bal, rate, freibetrag);
    kumuliert += netto;
    bal += netto;
    if (years[yearIdx] === y) {
      results.push({ year: y, kumuliertNetto: kumuliert, endguthaben: bal });
      yearIdx++;
    }
  }
  return results;
}

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
  actualBalance?: number | null;
  actualBalanceDate?: string | null;
};

type AccountSummary = {
  account: { id: number; name: string; color: string };
  monthlyExpenses: number;
  monthlyIncome: number;
  rest: number;
  itemCount: number;
  freibetragMonthly: number;
  actualBalance: number | null;
  actualBalanceDate: string | null;
  calculatedBalance: number | null;
  balanceDelta: number | null;
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

  const today = new Date().toISOString().slice(0, 10);

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

  const [balanceModal, setBalanceModal] = useState<Account | null>(null);
  const [balanceForm, setBalanceForm] = useState({ balance: "", date: today });

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

  function openBalanceModal(account: Account) {
    const s = accSummaryMap[account.id];
    setBalanceForm({
      balance: s?.actualBalance != null ? String(s.actualBalance) : "",
      date: s?.actualBalanceDate ?? today,
    });
    setBalanceModal(account);
  }

  async function handleSetBalance() {
    if (!balanceModal || !balanceForm.balance) return;
    await api.patch(`/accounts/${balanceModal.id}`, {
      actualBalance: parseFloat(balanceForm.balance),
      actualBalanceDate: balanceForm.date || today,
    });
    setBalanceModal(null);
    refetchAccounts();
    refetchSummary();
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <>
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

                  {/* Interest calculation section */}
                  {account.interestRate != null && account.interestRate > 0 && (() => {
                    const today2 = new Date().toISOString().slice(0, 10);
                    const until = account.interestRateUntil;
                    if (until && until < today2) return null; // abgelaufen

                    const baseBalance = s.calculatedBalance ?? s.actualBalance;
                    const fbEffektiv = (account.freibetrag ?? 0) > 0 &&
                      (account.freibetragYear == null || account.freibetragYear >= currentYear)
                      ? (account.freibetrag ?? 0)
                      : 0;

                    const projYears = until
                      ? (() => {
                          const endYear = new Date(until).getFullYear();
                          const nowYear = new Date().getFullYear();
                          const laufzeit = endYear - nowYear;
                          const base = [1, 2, 5].filter(y => y < laufzeit);
                          if (laufzeit > 0 && !base.includes(laufzeit)) base.push(laufzeit);
                          else if (laufzeit > 0) base[base.length - 1] = laufzeit;
                          return base.length > 0 ? base : [laufzeit > 0 ? laufzeit : 1];
                        })()
                      : [1, 2, 5, 10];

                    return (
                      <div className="mt-3 border-t border-gray-800 pt-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingUp size={11} className="text-emerald-400" />
                          <span className="text-xs text-gray-500">Zinsberechnung</span>
                        </div>

                        {baseBalance == null ? (
                          <p className="text-xs text-gray-600 italic">
                            Kontostand hinterlegen für Zinsberechnung
                          </p>
                        ) : (
                          <>
                            {/* Jahresübersicht */}
                            {(() => {
                              const { brutto, steuer, netto } = calcInterestYear(baseBalance, account.interestRate!, fbEffektiv);
                              return (
                                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                  <div className="bg-gray-800/40 rounded-lg p-2.5">
                                    <p className="text-gray-500 mb-1">Brutto/Jahr</p>
                                    <p className="text-white font-medium">{eur(brutto)}</p>
                                  </div>
                                  <div className="bg-gray-800/40 rounded-lg p-2.5">
                                    <p className="text-gray-500 mb-1">Steuer</p>
                                    <p className="text-red-400 font-medium">−{eur(steuer)}</p>
                                  </div>
                                  <div className="bg-gray-800/40 rounded-lg p-2.5">
                                    <p className="text-gray-500 mb-1">Netto/Jahr</p>
                                    <p className="text-emerald-400 font-medium">{eur(netto)}</p>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Projektion */}
                            {(() => {
                              const rows = calcInterestProjection(baseBalance, account.interestRate!, fbEffektiv, projYears);
                              return (
                                <div className="space-y-1">
                                  <div className="grid grid-cols-3 text-xs text-gray-600 px-1">
                                    <span>Laufzeit</span>
                                    <span className="text-right">Zinsen kum.</span>
                                    <span className="text-right">Endguthaben</span>
                                  </div>
                                  {rows.map((r) => (
                                    <div key={r.year} className="grid grid-cols-3 text-xs bg-gray-800/30 rounded px-2 py-1.5">
                                      <span className="text-gray-400">
                                        {r.year} {r.year === 1 ? "Jahr" : "Jahre"}
                                        {until && r.year === projYears[projYears.length - 1] && (
                                          <span className="text-gray-600"> (Ende)</span>
                                        )}
                                      </span>
                                      <span className="text-emerald-400 text-right font-medium">+{eur(r.kumuliertNetto)}</span>
                                      <span className="text-blue-400 text-right font-medium">{eur(r.endguthaben)}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}

                            <p className="text-xs text-gray-700 mt-2">
                              Abgeltungssteuer 26,375% inkl. Soli
                              {fbEffektiv > 0 && ` · Freibetrag ${eur(fbEffektiv)}/Jahr`}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Balance tracking section */}
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    {s.actualBalance !== null ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 flex items-center gap-1.5">
                            <Wallet size={11} />
                            Kontostand
                            {s.actualBalanceDate && (
                              <span className="text-gray-600">
                                ({new Date(s.actualBalanceDate + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })})
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => openBalanceModal(account)}
                            className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                          >
                            Aktualisieren
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-gray-800/40 rounded-lg p-2.5">
                            <p className="text-gray-500 mb-1">Ist-Saldo</p>
                            <p className="text-white font-medium">{eur(s.actualBalance)}</p>
                          </div>
                          <div className="bg-gray-800/40 rounded-lg p-2.5">
                            <p className="text-gray-500 mb-1">Errechnet</p>
                            <p className="text-blue-400 font-medium">{eur(s.calculatedBalance!)}</p>
                          </div>
                          <div className="bg-gray-800/40 rounded-lg p-2.5">
                            <p className="text-gray-500 mb-1">Bewegung</p>
                            <p className={`font-medium ${s.balanceDelta! >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {s.balanceDelta! >= 0 ? "+" : ""}{eur(s.balanceDelta!)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openBalanceModal(account)}
                        className="w-full text-xs text-gray-600 hover:text-blue-400 flex items-center gap-1.5 py-0.5 transition-colors"
                      >
                        <Wallet size={11} /> Kontostand erfassen
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xs mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Kontostand erfassen</h3>
              <button onClick={() => setBalanceModal(null)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-400 -mt-2">{balanceModal.name}</p>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Aktueller Kontostand (€)</label>
              <input
                type="number"
                step="0.01"
                value={balanceForm.balance}
                onChange={(e) => setBalanceForm((f) => ({ ...f, balance: e.target.value }))}
                className="input"
                placeholder="0,00"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Datum (Referenztag)</label>
              <input
                type="date"
                value={balanceForm.date}
                onChange={(e) => setBalanceForm((f) => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>

            <p className="text-xs text-gray-600">
              Ab diesem Datum werden Transaktionen zum errechneten Saldo addiert.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setBalanceModal(null)}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSetBalance}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Check size={15} /> Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto space-y-4">
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
