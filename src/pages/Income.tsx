import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

type IncomeItem = {
  _id: Id<"income_sources">;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  monthlyAmount: number;
  isActive: boolean;
  note?: string;
  account: { _id: Id<"accounts">; name: string; color: string } | null;
  accountId: Id<"accounts">;
};

export default function Income() {
  const incomes = useQuery(api.income.list) as IncomeItem[] | undefined;
  const accounts = useQuery(api.accounts.list);
  const addIncome = useMutation(api.income.add);
  const updateIncome = useMutation(api.income.update);
  const removeIncome = useMutation(api.income.remove);

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<Id<"income_sources"> | null>(null);

  const [form, setForm] = useState({
    label: "",
    amount: "",
    type: "monthly" as "monthly" | "annual",
    accountId: "",
    note: "",
  });

  if (!incomes || !accounts) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const totalMonthly = incomes
    .filter((i) => i.isActive)
    .reduce((s, i) => s + i.monthlyAmount, 0);

  function openAdd() {
    setForm({
      label: "",
      amount: "",
      type: "monthly",
      accountId: accounts![0]?._id ?? "",
      note: "",
    });
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(item: IncomeItem) {
    setForm({
      label: item.label,
      amount: String(item.amount),
      type: item.type,
      accountId: item.accountId,
      note: item.note ?? "",
    });
    setEditId(item._id);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.accountId) return;
    const payload = {
      label: form.label,
      amount: parseFloat(form.amount),
      type: form.type,
      accountId: form.accountId as Id<"accounts">,
      isActive: true,
      note: form.note || undefined,
    };
    if (editId) {
      await updateIncome({ id: editId, ...payload });
    } else {
      await addIncome(payload);
    }
    setShowAdd(false);
  }

  return (
    <div className="p-6 space-y-5">
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

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
            {incomes
              .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
              .map((item) => (
                <tr
                  key={item._id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
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
                        onClick={() => removeIncome({ id: item._id })}
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
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editId ? "Einnahme bearbeiten" : "Einnahme hinzufügen"}
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
                  <option key={a._id} value={a._id}>{a.name}</option>
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
                {editId ? "Speichern" : "Hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
