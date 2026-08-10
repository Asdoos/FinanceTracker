import { useState, useEffect } from "react";
import { useApi, api } from "../lib/api";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Target } from "lucide-react";
import { Modal } from "../components/Modal";
import { eur } from "../lib/format";
import { errorMessage } from "../lib/errors";

type Goal = {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  color: string;
  dueDate?: string | null;
  accountId?: number | null;
  account?: { id: number; name: string; color: string } | null;
  note?: string | null;
};

type Account = { id: number; name: string; color: string };

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

const INITIAL_FORM = {
  name: "",
  targetAmount: "",
  currentAmount: "0",
  color: "#10b981",
  dueDate: "",
  accountId: "",
  note: "",
};

export default function Goals() {
  const { data: goals, error, refetch } = useApi<Goal[]>("/goals");
  const { data: accounts } = useApi<Account[]>("/accounts");

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function openAdd() {
    setForm(INITIAL_FORM);
    setEditId(null);
    setMutationError(null);
    setShowModal(true);
  }

  function openEdit(g: Goal) {
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      color: g.color,
      dueDate: g.dueDate ?? "",
      accountId: g.accountId != null ? String(g.accountId) : "",
      note: g.note ?? "",
    });
    setEditId(g.id);
    setMutationError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    setMutationError(null);
  }

  async function handleSubmit() {
    if (!form.name || !form.targetAmount) return;
    setIsSubmitting(true);
    setMutationError(null);
    try {
      const payload = {
        name: form.name,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount) || 0,
        color: form.color,
        dueDate: form.dueDate || null,
        accountId: form.accountId ? parseInt(form.accountId) : null,
        note: form.note || null,
      };
      if (editId !== null) {
        await api.patch(`/goals/${editId}`, payload);
        toast.success("Sparziel gespeichert");
      } else {
        await api.post("/goals", payload);
        toast.success("Sparziel angelegt");
      }
      closeModal();
      refetch();
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/goals/${id}`);
      toast.success("Sparziel gelöscht");
      refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (error) return <div className="p-6 text-red-400 text-sm">Fehler: {error}</div>;
  if (!goals) return <div className="p-6 text-gray-500 text-sm">Lade…</div>;

  return (
    <div className="p-3 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Sparziele</h2>
          <p className="text-sm text-gray-500 mt-0.5">{goals.length} Ziel{goals.length !== 1 ? "e" : ""}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Hinzufügen
        </button>
      </div>

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target size={40} className="text-gray-700 mb-4" />
          <p className="text-gray-400 text-lg font-medium mb-2">Noch keine Sparziele</p>
          <p className="text-gray-600 text-sm">Lege dein erstes Sparziel an.</p>
        </div>
      )}

      {/* Goals grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g) => {
          const pct = g.targetAmount > 0
            ? Math.min((g.currentAmount / g.targetAmount) * 100, 100)
            : 0;
          const done = pct >= 100;
          const barColor = done
            ? "#10b981"
            : pct >= 80
            ? "#f59e0b"
            : g.color;

          return (
            <div key={g.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col">
              {/* Color bar */}
              <div className="h-1.5 w-full" style={{ backgroundColor: g.color }} />

              <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{g.name}</h3>
                    {g.dueDate && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Bis {new Date(g.dueDate + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    )}
                    {g.account && (
                      <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: g.account.color }} />
                        {g.account.name}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(g)}
                      className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-red-400"
                      aria-label="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{eur(g.currentAmount)}</span>
                    <span>{eur(g.targetAmount)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {pct.toFixed(1)} %
                    </span>
                    {done && (
                      <span className="text-xs text-green-400 font-medium">Erreicht ✓</span>
                    )}
                    {!done && g.targetAmount > g.currentAmount && (
                      <span className="text-xs text-gray-600">
                        noch {eur(g.targetAmount - g.currentAmount)}
                      </span>
                    )}
                  </div>
                </div>

                {g.note && (
                  <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">{g.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={editId !== null ? "Sparziel bearbeiten" : "Neues Sparziel"}
          onClose={closeModal}
          maxWidth="md"
        >
          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                autoFocus
                className="input w-full"
                placeholder="z.B. Urlaub, Laptop, Notgroschen"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Zielbetrag (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input w-full"
                  placeholder="2000"
                  value={form.targetAmount}
                  onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Aktueller Betrag (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input w-full"
                  placeholder="0"
                  value={form.currentAmount}
                  onChange={(e) => setForm((f) => ({ ...f, currentAmount: e.target.value }))}
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Farbe</label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "#fff" : "transparent",
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fälligkeitsdatum (optional)</label>
              <input
                type="date"
                className="input w-full"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>

            {/* Account */}
            {accounts && accounts.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Konto (optional)</label>
                <select
                  className="input w-full"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  <option value="">— Kein Konto —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notiz (optional)</label>
              <input
                className="input w-full"
                placeholder="Kurze Anmerkung…"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            {mutationError && (
              <p className="text-red-400 text-sm">{mutationError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeModal}
                className="flex-1 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !form.name || !form.targetAmount}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "…" : editId !== null ? "Speichern" : "Anlegen"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
