import React, { useState, useMemo } from "react";
import { useApi, api } from "../lib/api";
import { eur, pct } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight } from "lucide-react";

type ExpenseItem = {
  id: number;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  monthlyAmount: number;
  shareOfTotal: number;
  isActive: boolean;
  note?: string;
  endDate?: string | null;
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
    endDate: "",
  });

  // Group by category — computed before early return to avoid hooks-after-conditional-return
  const grouped = useMemo(() => {
    if (!expenses) return [];
    const filteredItems = expenses.filter((e) => {
      if (filterAccount !== "all" && String(e.accountId) !== filterAccount) return false;
      if (filterCategory !== "all" && String(e.categoryId) !== filterCategory) return false;
      return true;
    });
    const map = new Map<string, { cat: Category | null; items: ExpenseItem[] }>();
    for (const e of filteredItems) {
      const key = e.category ? String(e.category.id) : "none";
      if (!map.has(key)) map.set(key, { cat: e.category, items: [] });
      map.get(key)!.items.push(e);
    }
    return [...map.entries()]
      .sort(([aKey, aVal], [bKey, bVal]) => {
        if (aKey === "none") return 1;
        if (bKey === "none") return -1;
        const aT = aVal.items.reduce((s, e) => s + e.monthlyAmount, 0);
        const bT = bVal.items.reduce((s, e) => s + e.monthlyAmount, 0);
        return bT - aT;
      })
      .map(([key, { cat, items }]) => ({
        key,
        cat,
        items: [...items].sort((a, b) => b.monthlyAmount - a.monthlyAmount),
        total: items.reduce((s, e) => s + e.monthlyAmount, 0),
      }));
  }, [expenses, filterAccount, filterCategory]);

  const totalFiltered = grouped.reduce((s, g) => s + g.total, 0);

  if (!expenses || !accounts || !categories) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function openAdd() {
    setForm({
      label: "",
      amount: "",
      type: "monthly",
      categoryId: String(categories![0]?.id ?? ""),
      accountId: String(accounts![0]?.id ?? ""),
      isActive: true,
      note: "",
      endDate: "",
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
      endDate: e.endDate ?? "",
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
      endDate: form.endDate || null,
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

      {/* Grouped by category — single table so columns stay aligned */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          Keine Ausgaben gefunden.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <colgroup>
              <col /> {/* Bezeichnung — flex */}
              <col className="w-44" /> {/* Konto */}
              <col className="w-36" /> {/* Betrag */}
              <col className="w-32" /> {/* Monatlich */}
              <col className="w-20" /> {/* Anteil */}
              <col className="w-20" /> {/* Actions */}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Bezeichnung</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Konto</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Betrag</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Monatlich</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Anteil</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, cat, items, total }) => {
                const isCollapsed = collapsed.has(key);
                const color = cat?.color ?? "#6b7280";
                return (
                  <React.Fragment key={key}>
                    {/* Category header row */}
                    <tr className="border-t border-gray-800 bg-gray-800/30">
                      <td colSpan={6} className="px-0 py-0">
                        <button
                          onClick={() => toggleCollapse(key)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/60 transition-colors"
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-semibold text-white text-sm">
                            {cat?.name ?? "Ohne Kategorie"}
                          </span>
                          <span className="text-gray-500 text-xs">{items.length} Posten</span>
                          <span className="ml-auto text-sm font-medium text-white mr-2">
                            {eur(total)}<span className="text-gray-500 text-xs font-normal">/Mo</span>
                          </span>
                          {isCollapsed
                            ? <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
                            : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                          }
                        </button>
                      </td>
                    </tr>

                    {/* Item rows */}
                    {!isCollapsed && items.map((e) => (
                      <tr
                        key={e.id}
                        className={`border-t border-gray-800/40 hover:bg-gray-800/30 ${!e.isActive ? "opacity-40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{e.label}</div>
                          {e.note && <div className="text-xs text-gray-500">{e.note}</div>}
                          {e.endDate && (() => {
                            const today = new Date().toISOString().slice(0, 10);
                            const expired = e.endDate < today;
                            const formatted = new Date(e.endDate + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
                            return (
                              <div className={`text-xs mt-0.5 ${expired ? "text-red-400" : "text-gray-500"}`}>
                                {expired ? `abgelaufen ${formatted}` : `bis ${formatted}`}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {e.account && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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

            <Field label="Enddatum (optional)">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="input"
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
