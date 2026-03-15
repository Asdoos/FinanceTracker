import { useState, useEffect } from "react";
import { useApi, api } from "../lib/api";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

type Category = {
  id: number;
  name: string;
  color: string;
  icon?: string;
  budget?: number | null;
};

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

const INITIAL_FORM = { name: "", color: "#3b82f6", icon: "", budget: "" };

export default function Categories() {
  const { data: categories, error: categoriesError, refetch } = useApi<Category[]>("/categories");

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

  if (categoriesError) {
    return (
      <div className="p-6 m-6 text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl">
        Fehler beim Laden: {categoriesError}
      </div>
    );
  }

  if (!categories) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    setForm(INITIAL_FORM);
    setMutationError(null);
  }

  function openAdd() {
    setForm(INITIAL_FORM);
    setEditId(null);
    setMutationError(null);
    setShowModal(true);
  }

  function openEdit(cat: Category) {
    setForm({ name: cat.name, color: cat.color, icon: cat.icon ?? "",
              budget: cat.budget != null ? String(cat.budget) : "" });
    setEditId(cat.id);
    setMutationError(null);
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    setMutationError(null);
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon.trim() || undefined,
        budget: form.budget ? parseFloat(form.budget) : null,
      };
      if (editId) {
        await api.patch(`/categories/${editId}`, payload);
      } else {
        await api.post("/categories", payload);
      }
      closeModal();
      refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Kategorie wirklich löschen?")) return;
    try {
      await api.delete(`/categories/${id}`);
      refetch();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Kategorien</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Kategorie hinzufügen
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">Noch keine Kategorien vorhanden.</p>
          <p className="text-xs mt-1">Erstelle eine Kategorie, um Ausgaben zu gruppieren.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.icon ? (
                    <span className="text-base">{cat.icon}</span>
                  ) : (
                    <span>{cat.name[0]}</span>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-white">{cat.name}</div>
                  {cat.icon && (
                    <div className="text-xs text-gray-500">{cat.icon}</div>
                  )}
                  {cat.budget != null && cat.budget > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Budget: {cat.budget.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} / Monat
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(cat)}
                  aria-label="Bearbeiten"
                  className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  aria-label="Löschen"
                  className="p-1.5 hover:bg-red-900/40 rounded text-gray-400 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editId ? "Kategorie bearbeiten" : "Kategorie hinzufügen"}
              </h3>
              <button
                onClick={closeModal}
                aria-label="Schließen"
                className="p-1 hover:bg-gray-800 rounded"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                placeholder="z.B. Lebensmittel"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">
                Icon (optional, z.B. Emoji)
              </label>
              <input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                className="input"
                placeholder="z.B. 🛒"
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
                      form.color === c
                        ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-gray-900"
                        : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">
                Monatsbudget € (optional)
              </label>
              <input
                type="number"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                className="input"
                placeholder="z.B. 200"
                step="0.01"
                min="0"
              />
            </div>

            {mutationError && (
              <p className="text-red-400 text-sm">{mutationError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
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
                {isSubmitting ? "Speichern..." : editId ? "Speichern" : "Hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
