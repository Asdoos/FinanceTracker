import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, api } from "../lib/api";
import toast from "react-hot-toast";
import { eur } from "../lib/format";
import { errorMessage } from "../lib/errors";
import { Plus, Pencil, Trash2, Check, PlayCircle } from "lucide-react";
import { Modal } from "../components/Modal";

type Suggestion = {
  label: string;
  accountId: number;
  type: "income" | "expense";
  avgAmount: number;
  count: number;
};

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

const INITIAL_FORM = {
  label: "",
  amount: "",
  categoryId: "",
  accountId: "",
  note: "",
};

export default function Templates() {
  const navigate = useNavigate();
  // Modal-Zustand steht hier oben, weil die Frische-Mechanik ihn braucht.
  const [editItem, setEditItem] = useState<Template | null>(null);
  const modalOpen = editItem !== null;
  // Pflicht-Pause: bei offenem Modal wird **nicht** nachgeladen. Sonst wechselt
  // man zum Taschenrechner, kommt zurück, und die Daten unter dem halb gefüllten
  // Formular haben sich verschoben — schlimmer als veraltet.

  const { data: templates, error: templatesError, refetch } = useApi<Template[]>("/templates", { paused: modalOpen });
  const { data: accounts, error: accountsError } = useApi<Account[]>("/accounts", { paused: modalOpen });
  const { data: categories, error: categoriesError } = useApi<Category[]>("/categories", { paused: modalOpen });
  const { data: suggestions } = useApi<Suggestion[]>("/templates/suggestions", { paused: modalOpen });

  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [showForm, setShowForm] = useState(false);
  const [bookItem, setBookItem] = useState<Template | null>(null);
  const [bookDate, setBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingBook, setIsSubmittingBook] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (bookItem) {
          setBookItem(null);
          setBookError(null);
        } else if (showForm) {
          closeFormModal();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bookItem, showForm]);

  const filtered = useMemo(
    () => (templates ?? []).filter((t) => t.type === tab),
    [templates, tab]
  );

  const fetchError = templatesError || accountsError || categoriesError;
  if (fetchError) {
    return (
      <div className="p-6 m-6 text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl">
        Fehler beim Laden: {fetchError}
      </div>
    );
  }

  if (!templates || !accounts || !categories) {
    return <div className="flex items-center justify-center h-full text-gray-500">Lade...</div>;
  }

  // ── Vorlage-Modal ──────────────────────────────────────────────────────
  function closeFormModal() {
    setShowForm(false);
    setEditItem(null);
    setForm(INITIAL_FORM);
    setMutationError(null);
  }

  function openAdd() {
    setForm({ ...INITIAL_FORM, accountId: String(accounts![0]?.id ?? "") });
    setEditItem(null);
    setMutationError(null);
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
    setMutationError(null);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.accountId) return;
    setIsSubmitting(true);
    setMutationError(null);
    try {
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
      closeFormModal();
      refetch();
      toast.success(editItem ? "Vorlage gespeichert" : "Vorlage erstellt");
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Vorlage wirklich löschen?")) return;
    try {
      await api.delete(`/templates/${id}`);
      refetch();
      toast.success("Vorlage gelöscht");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  // ── Buchen-Modal ───────────────────────────────────────────────────────
  function openBook(item: Template) {
    setBookDate(new Date().toISOString().slice(0, 10));
    setBookItem(item);
    setBookError(null);
  }

  async function handleBook() {
    if (!bookItem) return;
    setIsSubmittingBook(true);
    setBookError(null);
    try {
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
      toast.success("Transaktion gebucht");
      navigate("/transactions");
    } catch (err) {
      setBookError(errorMessage(err));
    } finally {
      setIsSubmittingBook(false);
    }
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

      {/* Suggestions */}
      {suggestions && suggestions.filter((s) => s.type === tab).length > 0 && (
        <div className="space-y-2">
          {suggestions.filter((s) => s.type === tab).map((s) => (
            <div
              key={`${s.label}-${s.accountId}`}
              className="flex items-center justify-between px-4 py-2.5 bg-blue-900/20 border border-blue-800/30 rounded-xl text-sm"
            >
              <span className="text-blue-300 min-w-0 mr-3">
                💡 <span className="font-medium">{s.label}</span>
                <span className="text-blue-500 ml-2">({s.count}× gebucht, Ø {eur(s.avgAmount)})</span>
              </span>
              <button
                onClick={() => {
                  setForm({ label: s.label, amount: String(s.avgAmount), accountId: String(s.accountId), categoryId: "", note: "" });
                  setEditItem(null);
                  setMutationError(null);
                  setShowForm(true);
                }}
                className="flex-shrink-0 text-xs px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 rounded text-blue-300 transition-colors"
              >
                Als Vorlage übernehmen
              </button>
            </div>
          ))}
        </div>
      )}

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
                  aria-label="Vorlage buchen"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 rounded-lg text-blue-400 text-xs font-medium transition-colors"
                >
                  <PlayCircle size={13} />
                  <span className="hidden sm:inline">Buchen</span>
                </button>
                <button
                  onClick={() => openEdit(item)}
                  aria-label="Bearbeiten"
                  className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  aria-label="Löschen"
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
        <Modal
          title={editItem ? "Vorlage bearbeiten" : tab === "expense" ? "Ausgabe-Vorlage erstellen" : "Einnahme-Vorlage erstellen"}
          onClose={closeFormModal}
          maxWidth="md"
        >

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Bezeichnung</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="input"
                placeholder={tab === "expense" ? "z.B. Tanken" : "z.B. Bonus"}
                autoFocus
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

            {mutationError && (
              <p className="text-red-400 text-sm">{mutationError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeFormModal}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={15} />
                {isSubmitting ? "Speichern..." : editItem ? "Speichern" : "Erstellen"}
              </button>
            </div>
        </Modal>
      )}

      {/* Buchen Modal */}
      {bookItem && (
        <Modal
          title={`„${bookItem.label}" buchen`}
          onClose={() => { setBookItem(null); setBookError(null); }}
        >

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

            {bookError && (
              <p className="text-red-400 text-sm">{bookError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setBookItem(null); setBookError(null); }}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleBook}
                disabled={isSubmittingBook}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlayCircle size={15} />
                {isSubmittingBook ? "Buchen..." : "Buchen"}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
