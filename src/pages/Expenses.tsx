import { useState } from "react";
import { useApi, api } from "../lib/api";
import { eur, pct } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

type ExpenseItem = {
  id: number;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  monthlyAmount: number;
  shareOfTotal: number;
  isActive: boolean;
  note?: string;
  category: { id: number; name: string; color: string } | null;
  account: { id: number; name: string; color: string } | null;
  categoryId: number;
  accountId: number;
};

type Account = { id: number; name: string; color: string };
type Category = { id: number; name: string; color: string };

export default function Expenses() {
  const { data: expenses, refetch: refetchExpenses } = useApi<ExpenseItem[]>("/expenses");
  const { data: accounts } = useApi<Account[]>("/accounts");
  const { data: categories } = useApi<Category[]>("/categories");

  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<ExpenseItem | null>(null);

  const [form, setForm] = useState({
    label: "",
    amount: "",
    type: "monthly" as "monthly" | "annual",
    categoryId: "",
    accountId: "",
    isActive: true,
    note: "",
  });

  if (!expenses || !accounts || !categories) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const filtered = expenses.filter((e) => {
    if (filterAccount !== "all" && String(e.accountId) !== filterAccount) return false;
    if (filterCategory !== "all" && String(e.categoryId) !== filterCategory) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + e.monthlyAmount, 0);

  function openAdd() {
    setForm({
      label: "",
      amount: "",
      type: "monthly",
      categoryId: String(categories![0]?.id ?? ""),
      accountId: String(accounts![0]?.id ?? ""),
      isActive: true,
      note: "",
    });
    setEditItem(null);
    setShowAdd(true);
  }

  function openEdit(e: ExpenseItem) {
    setForm({
      label: e.label,
      amount: String(e.amount),
      type: e.type,
      categoryId: String(e.categoryId),
      accountId: String(e.accountId),
      isActive: e.isActive,
      note: e.note ?? "",
    });
    setEditItem(e);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.categoryId || !form.accountId) return;
    const payload = {
      label: form.label,
      amount: parseFloat(form.amount),
      type: form.type,
      categoryId: parseInt(form.categoryId),
      accountId: parseInt(form.accountId),
      isActive: form.isActive,
      note: form.note || undefined,
    };
    if (editItem) {
      await api.patch(`/expenses/${editItem.id}`, payload);
    } else {
      await api.post("/expenses", payload);
    }
    setShowAdd(false);
    refetchExpenses();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Ausgabe wirklich löschen?")) return;
    await api.delete(`/expenses/${id}`);
    refetchExpenses();
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Ausgaben</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Hinzufügen
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle Konten</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-gray-400 self-center">
          Gesamt: <span className="text-white font-medium">{eur(totalFiltered)}</span>/Monat
        </span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Bezeichnung</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Kategorie</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Konto</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Betrag</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Monatlich</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Anteil</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {[...filtered]
              .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
              .map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${!e.isActive ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{e.label}</div>
                    {e.note && (
                      <div className="text-xs text-gray-500">{e.note}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.category && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: e.category.color + "22",
                          color: e.category.color,
                          border: `1px solid ${e.category.color}44`,
                        }}
                      >
                        {e.category.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.account && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: e.account.color + "22",
                          color: e.account.color,
                          border: `1px solid ${e.account.color}44`,
                        }}
                      >
                        {e.account.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {eur(e.amount)}
                    <span className="text-gray-600 text-xs ml-1">
                      {e.type === "annual" ? "/Jahr" : "/Mo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {eur(e.monthlyAmount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {pct(e.shareOfTotal)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(e)}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
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

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editItem ? "Ausgabe bearbeiten" : "Ausgabe hinzufügen"}
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1 hover:bg-gray-800 rounded"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <Field label="Bezeichnung">
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="input"
                placeholder="z.B. Netflix"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Betrag (€)">
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="input"
                  placeholder="0.00"
                  step="0.01"
                />
              </Field>
              <Field label="Typ">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as "monthly" | "annual",
                    }))
                  }
                  className="input"
                >
                  <option value="monthly">Monatlich</option>
                  <option value="annual">Jährlich</option>
                </select>
              </Field>
            </div>

            <Field label="Konto">
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="input"
              >
                <option value="">Konto wählen...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Kategorie">
              <select
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryId: e.target.value }))
                }
                className="input"
              >
                <option value="">Kategorie wählen...</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notiz (optional)">
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input"
                placeholder="Kurze Anmerkung..."
              />
            </Field>

            {editItem && (
              <Field label="Status">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                  />
                  Aktiv
                </label>
              </Field>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-400 font-medium">{label}</label>
      {children}
    </div>
  );
}
