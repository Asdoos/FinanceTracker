import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

export default function Accounts() {
  const accounts = useQuery(api.accounts.list);
  const summary = useQuery(api.summary.get);
  const addAccount = useMutation(api.accounts.add);
  const updateAccount = useMutation(api.accounts.update);
  const removeAccount = useMutation(api.accounts.remove);

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<Id<"accounts"> | null>(null);
  const [form, setForm] = useState({
    name: "",
    color: "#3b82f6",
    description: "",
  });

  if (!accounts || !summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const accSummaryMap = Object.fromEntries(
    summary.byAccount.map((b) => [b.account._id, b])
  );

  function openAdd() {
    setForm({ name: "", color: "#3b82f6", description: "" });
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(a: { _id: Id<"accounts">; name: string; color: string; description?: string }) {
    setForm({ name: a.name, color: a.color, description: a.description ?? "" });
    setEditId(a._id);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.name) return;
    const payload = {
      name: form.name,
      color: form.color,
      description: form.description || undefined,
    };
    if (editId) {
      await updateAccount({ id: editId, ...payload });
    } else {
      await addAccount(payload);
    }
    setShowAdd(false);
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

      <div className="grid grid-cols-2 gap-4">
        {accounts.map((account) => {
          const s = accSummaryMap[account._id];
          return (
            <div
              key={account._id}
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
                    onClick={() => removeAccount({ id: account._id })}
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
