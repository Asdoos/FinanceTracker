import { useState, useEffect } from "react";
import { useApi, api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { parseRoom, RoomRail, type Room } from "../components/RoomSwitcher";
import { Modal } from "../components/Modal";

type Category = {
  id: number;
  name: string;
  color: string;
  icon?: string;
  budget?: number | null;
  /** Der Raum der Kategorie: null = persönlich, sonst das Gemeinschaftskonto. */
  accountId: number | null;
  /** Wer den Budget-Deckel gesetzt hat — nur am Gemeinschaftskonto interessant. */
  budgetSetBy?: number | null;
};

type Account = { id: number; name: string; color: string; isShared?: boolean };
type UserRef = { id: number; displayName?: string; email: string };

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

const INITIAL_FORM = { name: "", color: "#3b82f6", icon: "", budget: "" };

const eurMonth = (v: number) =>
  v.toLocaleString("de-DE", { style: "currency", currency: "EUR" }) + " / Monat";

export default function Categories() {
  // Modal-Zustand steht hier oben, weil die Frische-Mechanik ihn braucht.
  const [editId, setEditId] = useState<number | null>(null);
  const modalOpen = editId !== null;
  // Pflicht-Pause: bei offenem Modal wird **nicht** nachgeladen. Sonst wechselt
  // man zum Taschenrechner, kommt zurück, und die Daten unter dem halb gefüllten
  // Formular haben sich verschoben — schlimmer als veraltet.

  const { data: categories, error: categoriesError, refetch } = useApi<Category[]>("/categories", { paused: modalOpen });
  const { data: accounts } = useApi<Account[]>("/accounts", { paused: modalOpen });
  // Für die Spalte „gesetzt von". Nur Admins dürfen /auth/users lesen — schlägt
  // das fehl, bleibt die Spalte bei der reinen ID-Freiheit „—".
  const { data: users } = useApi<UserRef[]>("/auth/users", { paused: modalOpen });
  const [params, setParams] = useSearchParams();

  const [showModal, setShowModal] = useState(false);
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

  const sharedAccounts = (accounts ?? []).filter((a) => a.isShared);
  const room = parseRoom(params.get("raum"), sharedAccounts.map((a) => a.id));
  const selectRoom = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete("raum");
    else next.set("raum", String(id));
    setParams(next, { replace: true });
  };
  // Die Form des Wählers folgt der Informationsdichte: „4 Kategorien" rechtfertigt
  // keine Kachel, deshalb eine schmale Leiste statt der Kachelleiste von
  // Dashboard und Statistik.
  const rooms: Room[] = [
    { id: null, name: "Persönlich", color: "#3b82f6" },
    ...sharedAccounts.map((a) => ({ id: a.id, name: a.name, color: a.color })),
  ];

  // Nur die Kategorien des aktiven Raums — die Räume sind disjunkt.
  const roomCategories = (categories ?? []).filter((c) =>
    room === null ? c.accountId == null : c.accountId === room
  );
  const userName = (id: number) => {
    const u = (users ?? []).find((x) => x.id === id);
    return u ? u.displayName || u.email : '—';
  };

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
        // Eine neue Kategorie entsteht im **aktiven** Raum — sonst müsste man sie
        // nachträglich verschieben, was es nicht gibt.
        ...(editId ? {} : { accountId: room }),
      };
      if (editId) {
        await api.patch(`/categories/${editId}`, payload);
      } else {
        await api.post("/categories", payload);
      }
      closeModal();
      refetch();
      toast.success(editId ? "Kategorie gespeichert" : "Kategorie erstellt");
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Kategorie wirklich löschen?")) return;
    try {
      await api.delete(`/categories/${id}`);
      refetch();
      toast.success("Kategorie gelöscht");
    } catch (err) {
      toast.error(errorMessage(err));
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

      <div className="flex gap-5 items-start">
        <RoomRail rooms={rooms} active={room} onSelect={selectRoom} />

        <div className="flex-1 min-w-0">
      {/* Die Räume sind disjunkt: die gewollte Dublette „Lebensmittel" ist damit nie
          gleichzeitig sichtbar — genau der Punkt. Ein Vergleich der beiden Zahlen
          wäre bedeutungslos. */}
      {roomCategories.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">In diesem Raum gibt es noch keine Kategorien.</p>
          <p className="text-xs mt-1">Erstelle eine Kategorie, um Ausgaben zu gruppieren.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium w-40">Budget / Monat</th>
                {/* Im persönlichen Raum bewusst Ballast — eine raumabhängige
                    Spaltenzahl wäre schlechter als eine leere Spalte. */}
                <th className="text-left px-4 py-3 text-gray-400 font-medium w-40">Gesetzt von</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {roomCategories.map((cat) => (
                <tr key={cat.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.icon ? cat.icon : cat.name[0]}
                      </span>
                      <span className="text-white">{cat.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300 whitespace-nowrap">
                    {cat.budget != null && cat.budget > 0 ? eurMonth(cat.budget) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 truncate">
                    {cat.budgetSetBy != null ? userName(cat.budgetSetBy) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </div>

      {showModal && (
        <Modal
          title={editId ? "Kategorie bearbeiten" : "Kategorie hinzufügen"}
          onClose={closeModal}
        >

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
        </Modal>
      )}
    </div>
  );
}
