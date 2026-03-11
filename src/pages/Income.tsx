import { useState, useMemo } from "react";
import { useApi, api } from "../lib/api";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, Search } from "lucide-react";

type IncomeItem = {
  id: number;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  monthlyAmount: number;
  isActive: boolean;
  note?: string;
  account: { id: number; name: string; color: string } | null;
  accountId: number;
};

type Account = { id: number; name: string; color: string };

export default function Income() {
  const { data: incomes, refetch: refetchIncomes } = useApi<IncomeItem[]>("/income");
  const { data: accounts } = useApi<Account[]>("/accounts");

  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"amount" | "label" | "type">("amount");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<IncomeItem | null>(null);

  const [form, setForm] = useState({
    label: "",
    amount: "",
    type: "monthly" as "monthly" | "annual",
    accountId: "",
    isActive: true,
    note: "",
  });

  const filtered = useMemo(() => {
    if (!incomes) return [];
    return [...incomes]
      .filter((i) => {
        if (filterAccount !== "all" && String(i.accountId) !== filterAccount) return false;
        if (filterActive === "active" && !i.isActive) return false;
        if (filterActive === "inactive" && i.isActive) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!i.label.toLowerCase().includes(q) && !(i.note ?? "").toLowerCase().includes(q))
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "label") return a.label.localeCompare(b.label, "de");
        if (sortBy === "type") return a.type === b.type ? 0 : a.type === "monthly" ? -1 : 1;
        return b.monthlyAmount - a.monthlyAmount;
      });
  }, [incomes, search, filterAccount, filterActive, sortBy]);

  if (!incomes || !accounts) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const totalMonthly = filtered
    .filter((i) => i.isActive)
    .reduce((s, i) => s + i.monthlyAmount, 0);

  function openAdd() {
    setForm({
      label: "",
      amount: "",
      type: "monthly",
      accountId: String(accounts![0]?.id ?? ""),
      isActive: true,
      note: "",
    });
    setEditItem(null);
    setShowAdd(true);
  }

  function openEdit(item: IncomeItem) {
    setForm({
      label: item.label,
      amount: String(item.amount),
      type: item.type,
      accountId: String(item.accountId),
      isActive: item.isActive,
      note: item.note ?? "",
    });
    setEditItem(item);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.accountId) return;
    const payload = {
      label: form.label,
      amount: parseFloat(form.amount),
      type: form.type,
      accountId: parseInt(form.accountId),
      isActive: form.isActive,
      note: form.note || undefined,
    };
    if (editItem) {
      await api.patch(`/income/${editItem.id}`, payload);
    } else {
      await api.post("/income", payload);
    }
    setShowAdd(false);
    refetchIncomes();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Einnahme wirklich löschen?")) return;
    await api.delete(`/income/${id}`);
    refetchIncomes();
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Einnahmen</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Gesamt:{" "}
            <span className="text-green-400 font-medium">
              {eur(totalMonthly)}
            </span>{" "}
            / Monat · {eur(totalMonthly * 12)} / Jahr
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Hinzufügen
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche..."
            className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-44"
          />
        </div>
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle Konten</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle</option>
          <option value="active">Nur aktive</option>
          <option value="inactive">Nur inaktive</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "amount" | "label" | "type")}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="amount">Betrag ↓</option>
          <option value="label">Name A–Z</option>
          <option value="type">Typ</option>
        </select>
      </div>

      {/* Mobile: Card list */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">Keine Einnahmen gefunden.</div>
        ) : filtered.map((item) => (
          <div
            key={item.id}
            className={`bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 ${!item.isActive ? "opacity-50" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm truncate">{item.label}</p>
                {item.note && <p className="text-xs text-gray-500 truncate">{item.note}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {item.account && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: item.account.color + "22",
                        color: item.account.color,
                        border: `1px solid ${item.account.color}44`,
                      }}
                    >
                      {item.account.name}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {item.type === "annual" ? "Jährlich" : "Monatlich"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0 gap-1">
                <span className="text-green-400 font-medium text-sm">{eur(item.monthlyAmount)}/Mo</span>
                <span className="text-gray-500 text-xs">
                  {eur(item.amount)}{item.type === "annual" ? "/Jahr" : "/Mo"}
                </span>
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 hover:bg-red-900/40 rounded text-gray-400 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Bezeichnung</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Konto</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Betrag</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Monatlich</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${!item.isActive ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{item.label}</div>
                    {item.note && (
                      <div className="text-xs text-gray-500">{item.note}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.account && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: item.account.color + "22",
                          color: item.account.color,
                          border: `1px solid ${item.account.color}44`,
                        }}
                      >
                        {item.account.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {eur(item.amount)}
                    <span className="text-gray-600 text-xs ml-1">
                      {item.type === "annual" ? "/Jahr" : "/Mo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-400">
                    {eur(item.monthlyAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 hover:bg-red-900/40 rounded text-gray-400 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editItem ? "Einnahme bearbeiten" : "Einnahme hinzufügen"}
              </h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Bezeichnung</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="input"
                placeholder="z.B. Gehalt"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Betrag (€)</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="input"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Typ</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as "monthly" | "annual" }))
                  }
                  className="input"
                >
                  <option value="monthly">Monatlich</option>
                  <option value="annual">Jährlich</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Konto</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="input"
              >
                <option value="">Konto wählen...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Notiz (optional)</label>
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input"
              />
            </div>

            {editItem && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                  />
                  Aktiv
                </label>
              </div>
            )}

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
                {editItem ? "Speichern" : "Hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
