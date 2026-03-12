import { useState, useMemo } from "react";
import { useApi, api } from "../lib/api";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, Search } from "lucide-react";

type Transaction = {
  id: number;
  date: string;
  label: string;
  amount: number;
  type: "income" | "expense";
  categoryId: number | null;
  accountId: number;
  note?: string;
  category: { id: number; name: string; color: string } | null;
  account: { id: number; name: string; color: string } | null;
};

type Account = { id: number; name: string; color: string };
type Category = { id: number; name: string; color: string };

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export default function Transactions() {
  const { data: transactions, refetch } = useApi<Transaction[]>("/transactions");
  const { data: accounts } = useApi<Account[]>("/accounts");
  const { data: categories } = useApi<Category[]>("/categories");

  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Transaction | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    date: today,
    label: "",
    amount: "",
    categoryId: "",
    accountId: "",
    note: "",
  });

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter((t) => {
        if (t.type !== tab) return false;
        if (filterAccount !== "all" && String(t.accountId) !== filterAccount) return false;
        if (filterCategory !== "all" && String(t.categoryId) !== filterCategory) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!t.label.toLowerCase().includes(q) && !(t.note ?? "").toLowerCase().includes(q))
            return false;
        }
        return true;
      });
  }, [transactions, tab, search, filterAccount, filterCategory]);

  // Group by month (YYYY-MM)
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const ym = t.date.substring(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const total = filtered.reduce((s, t) => s + t.amount, 0);

  if (!transactions || !accounts || !categories) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">Lade...</div>
    );
  }

  function openAdd() {
    setForm({
      date: today,
      label: "",
      amount: "",
      categoryId: "",
      accountId: String(accounts![0]?.id ?? ""),
      note: "",
    });
    setEditItem(null);
    setShowAdd(true);
  }

  function openEdit(item: Transaction) {
    setForm({
      date: item.date,
      label: item.label,
      amount: String(item.amount),
      categoryId: item.categoryId ? String(item.categoryId) : "",
      accountId: String(item.accountId),
      note: item.note ?? "",
    });
    setEditItem(item);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.date || !form.accountId) return;
    const payload = {
      date: form.date,
      label: form.label,
      amount: parseFloat(form.amount),
      type: tab,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      accountId: parseInt(form.accountId),
      note: form.note || undefined,
    };
    if (editItem) {
      await api.patch(`/transactions/${editItem.id}`, payload);
    } else {
      await api.post("/transactions", payload);
    }
    setShowAdd(false);
    refetch();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Transaktion wirklich löschen?")) return;
    await api.delete(`/transactions/${id}`);
    refetch();
  }

  const tabClass = (t: "expense" | "income") =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-blue-600 text-white"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
    }`;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Transaktionen</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtered.length} Einträge ·{" "}
            <span className={tab === "expense" ? "text-red-400 font-medium" : "text-green-400 font-medium"}>
              {tab === "expense" ? "-" : "+"}{eur(total)}
            </span>
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Hinzufügen
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-800/50 rounded-xl w-fit">
        <button className={tabClass("expense")} onClick={() => setTab("expense")}>
          Ausgaben
        </button>
        <button className={tabClass("income")} onClick={() => setTab("income")}>
          Einnahmen
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
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          Keine Transaktionen gefunden.
        </div>
      ) : (
        grouped.map(([ym, items]) => (
          <div key={ym} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                {formatMonth(ym)}
              </h3>
              <span className={`text-sm font-medium ${tab === "expense" ? "text-red-400" : "text-green-400"}`}>
                {tab === "expense" ? "-" : "+"}{eur(items.reduce((s, t) => s + t.amount, 0))}
              </span>
            </div>

            {/* Mobile: Card list */}
            <div className="md:hidden space-y-2">
              {items.map((item) => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white text-sm truncate">{item.label}</p>
                      {item.note && <p className="text-xs text-gray-500 truncate">{item.note}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">
                          {new Date(item.date + "T00:00:00").toLocaleDateString("de-DE")}
                        </span>
                        {item.category && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: item.category.color + "22",
                              color: item.category.color,
                              border: `1px solid ${item.category.color}44`,
                            }}
                          >
                            {item.category.name}
                          </span>
                        )}
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
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-1">
                      <span className={`font-medium text-sm ${tab === "expense" ? "text-red-400" : "text-green-400"}`}>
                        {tab === "expense" ? "-" : "+"}{eur(item.amount)}
                      </span>
                      <div className="flex gap-1">
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
                    <th className="text-left px-4 py-3 text-gray-400 font-medium w-28">Datum</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Bezeichnung</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Kategorie</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Konto</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Betrag</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(item.date + "T00:00:00").toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{item.label}</div>
                        {item.note && <div className="text-xs text-gray-500">{item.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {item.category && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: item.category.color + "22",
                              color: item.category.color,
                              border: `1px solid ${item.category.color}44`,
                            }}
                          >
                            {item.category.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${tab === "expense" ? "text-red-400" : "text-green-400"}`}>
                        {tab === "expense" ? "-" : "+"}{eur(item.amount)}
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
          </div>
        ))
      )}

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editItem
                  ? tab === "expense" ? "Ausgabe bearbeiten" : "Einnahme bearbeiten"
                  : tab === "expense" ? "Ausgabe hinzufügen" : "Einnahme hinzufügen"}
              </h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Datum</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Bezeichnung</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="input"
                placeholder={tab === "expense" ? "z.B. Restaurant" : "z.B. Bonus"}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Betrag (€)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="input"
                step="0.01"
                min="0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Kategorie (optional)</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="input"
              >
                <option value="">Keine Kategorie</option>
                {categories!.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Konto</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="input"
              >
                <option value="">Konto wählen...</option>
                {accounts!.map((a) => (
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
