import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, api } from "../lib/api";
import { eur } from "../lib/format";
import { Plus, Pencil, Trash2, X, Check, PlayCircle } from "lucide-react";

type Template = {
  id: number;
  label: string;
  amount: number;
  type: "income" | "expense";
  categoryId: number | null;
  accountId: number;
  note?: string | null;
  category: { id: number; name: string; color: string } | null;
  account: { id: number; name: string; color: string } | null;
};

type Account = { id: number; name: string; color: string };
type Category = { id: number; name: string; color: string };

const today = new Date().toISOString().slice(0, 10);

export default function Templates() {
  const navigate = useNavigate();
  const { data: templates, refetch } = useApi<Template[]>("/templates");
  const { data: accounts } = useApi<Account[]>("/accounts");
  const { data: categories } = useApi<Category[]>("/categories");

  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Template | null>(null);
  const [bookItem, setBookItem] = useState<Template | null>(null);
  const [bookDate, setBookDate] = useState(today);

  const [form, setForm] = useState({
    label: "",
    amount: "",
    categoryId: "",
    accountId: "",
    note: "",
  });

  const filtered = useMemo(
    () => (templates ?? []).filter((t) => t.type === tab),
    [templates, tab]
  );

  if (!templates || !accounts || !categories) {
    return <div className="flex items-center justify-center h-full text-gray-500">Lade...</div>;
  }

  // ── Vorlage-Modal ──────────────────────────────────────────────────────
  function openAdd() {
    setForm({
      label: "",
      amount: "",
      categoryId: "",
      accountId: String(accounts![0]?.id ?? ""),
      note: "",
    });
    setEditItem(null);
    setShowForm(true);
  }

  function openEdit(item: Template) {
    setForm({
      label: item.label,
      amount: String(item.amount),
      categoryId: item.categoryId ? String(item.categoryId) : "",
      accountId: String(item.accountId),
      note: item.note ?? "",
    });
    setEditItem(item);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.accountId) return;
    const payload = {
      label: form.label,
      amount: parseFloat(form.amount),
      type: tab,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      accountId: parseInt(form.accountId),
      note: form.note || undefined,
    };
    if (editItem) {
      await api.patch(`/templates/${editItem.id}`, payload);
    } else {
      await api.post("/templates", payload);
    }
    setShowForm(false);
    refetch();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Vorlage wirklich löschen?")) return;
    await api.delete(`/templates/${id}`);
    refetch();
  }

  // ── Buchen-Modal ───────────────────────────────────────────────────────
  function openBook(item: Template) {
    setBookDate(today);
    setBookItem(item);
  }

  async function handleBook() {
    if (!bookItem) return;
    await api.post("/transactions", {
      date: bookDate,
      label: bookItem.label,
      amount: bookItem.amount,
      type: bookItem.type,
      categoryId: bookItem.categoryId ?? undefined,
      accountId: bookItem.accountId,
      note: bookItem.note ?? undefined,
    });
    setBookItem(null);
    navigate("/transactions");
  }

  const tabClass = (t: "expense" | "income") =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-blue-600 text-white"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
    }`;

  const Badge = ({ color, name }: { color: string; name: string }) => (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: color + "22",
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {name}
    </span>
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Vorlagen</h2>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} Vorlagen</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Neue Vorlage
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          Keine Vorlagen vorhanden. Klicke auf „Neue Vorlage", um loszulegen.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white text-sm">{item.label}</span>
                  {item.category && <Badge color={item.category.color} name={item.category.name} />}
                  {item.account && <Badge color={item.account.color} name={item.account.name} />}
                </div>
                {item.note && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{item.note}</p>
                )}
              </div>

              {/* Amount */}
              <span
                className={`font-semibold text-sm flex-shrink-0 ${
                  tab === "expense" ? "text-red-400" : "text-green-400"
                }`}
              >
                {tab === "expense" ? "-" : "+"}{eur(item.amount)}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openBook(item)}
                  title="Buchen"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 rounded-lg text-blue-400 text-xs font-medium transition-colors"
                >
                  <PlayCircle size={13} />
                  <span className="hidden sm:inline">Buchen</span>
                </button>
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
          ))}
        </div>
      )}

      {/* Vorlage Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editItem
                  ? "Vorlage bearbeiten"
                  : tab === "expense"
                  ? "Ausgabe-Vorlage erstellen"
                  : "Einnahme-Vorlage erstellen"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Bezeichnung</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="input"
                placeholder={tab === "expense" ? "z.B. Tanken" : "z.B. Bonus"}
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
                {categories.map((c) => (
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

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Check size={15} />
                {editItem ? "Speichern" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buchen Modal */}
      {bookItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                „{bookItem.label}" buchen
              </h3>
              <button onClick={() => setBookItem(null)} className="p-1 hover:bg-gray-800 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-400">
              {tab === "expense" ? "-" : "+"}{eur(bookItem.amount)}
              {bookItem.account && (
                <span className="ml-2 text-gray-500">· {bookItem.account.name}</span>
              )}
            </p>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Datum</label>
              <input
                type="date"
                value={bookDate}
                onChange={(e) => setBookDate(e.target.value)}
                className="input"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setBookItem(null)}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleBook}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <PlayCircle size={15} />
                Buchen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
