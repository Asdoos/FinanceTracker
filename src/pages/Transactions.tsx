import { useState, useMemo, useEffect } from "react";
import { useApi, api } from "../lib/api";
import toast from "react-hot-toast";
import { eur } from "../lib/format";
import { errorMessage } from "../lib/errors";
import { Plus, Pencil, Trash2, Check, Search, Download, ArrowLeftRight, Info } from "lucide-react";
import { Modal } from "../components/Modal";
import { Link } from "react-router-dom";

type TransactionType = "income" | "expense" | "transfer";

type Transaction = {
  id: number;
  date: string;
  label: string;
  amount: number;
  type: TransactionType;
  categoryId: number | null;
  accountId: number;
  counterAccountId: number | null;
  note?: string;
  category: { id: number; name: string; color: string } | null;
  account: { id: number; name: string; color: string } | null;
  counterAccount: { id: number; name: string; color: string } | null;
  /** Vom Server gerechnet — nur im lückenlosen Auszug eines Kontos gesetzt. */
  runningBalance: number | null;
  /** Vorzeichen aus Sicht des gewählten Kontos. */
  signedAmount: number | null;
};

type Account = {
  id: number;
  name: string;
  color: string;
  actualBalance?: number | null;
  actualBalanceDate?: string | null;
};
type Category = { id: number; name: string; color: string };

const TAB_LABELS: Record<string, string> = {
  all: "Alle",
  expense: "Ausgaben",
  income: "Einnahmen",
  transfer: "Übertragungen",
};
const TABS = ["all", "expense", "income", "transfer"] as const;
type Tab = (typeof TABS)[number];

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Ausgabe",
  income: "Einnahme",
  transfer: "Übertragung",
};

function formatMonth(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("de-DE");

const todayStr = new Date().toISOString().slice(0, 10);

const INITIAL_FORM = {
  date: todayStr,
  label: "",
  amount: "",
  type: "expense" as TransactionType,
  categoryId: "",
  accountId: "",
  counterAccountId: "",
  note: "",
};

const Chip = ({ item }: { item: { name: string; color: string } }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    style={{
      backgroundColor: item.color + "22",
      color: item.color,
      border: `1px solid ${item.color}44`,
    }}
  >
    {item.name}
  </span>
);

export default function Transactions() {
  const { data: accounts, error: accountsError } = useApi<Account[]>("/accounts");
  const { data: categories, error: categoriesError } = useApi<Category[]>("/categories");

  const [accountId, setAccountId] = useState<number | null>(null);

  // Der Auszug wird **ohne** Typ-Verengung geladen — nur dann liefert der Server den
  // laufenden Saldo. Die Typ-Achse filtert clientseitig und blendet die Spalte aus.
  const { data: transactions, error: transactionsError, refetch } = useApi<Transaction[]>(
    accountId ? `/transactions?accountId=${accountId}` : "/transactions"
  );

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  // Einstieg ist die Kontowahl — ohne Vorauswahl gäbe es keinen Auszug.
  useEffect(() => {
    if (accountId === null && accounts && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const account = accounts?.find((a) => a.id === accountId) ?? null;
  const hasAnchor = account?.actualBalance != null;

  // Such- und Kategoriefilter bleiben clientseitig und schalten die Saldo-Spalte
  // allein anhand des eigenen Zustands aus — gerechnet wird hier nichts.
  const narrowed = search !== "" || filterCategory !== "all";
  const showBalance = tab === "all" && !narrowed && hasAnchor && accountId !== null;

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      if (tab !== "all" && t.type !== tab) return false;
      if (filterCategory !== "all" && String(t.categoryId) !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.label.toLowerCase().includes(q) && !(t.note ?? "").toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [transactions, tab, search, filterCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const ym = t.date.substring(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  /** Betrag aus Sicht des gewählten Kontos. Ohne Kontowahl gilt die Typ-Richtung. */
  function signed(item: Transaction): number {
    if (item.signedAmount !== null) return item.signedAmount;
    return item.type === "income" ? item.amount : -item.amount;
  }

  const net = filtered.reduce((s, t) => s + signed(t), 0);

  const fetchError = transactionsError ?? accountsError ?? categoriesError;
  if (fetchError) {
    return (
      <div className="p-6 m-6 text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl">
        Fehler beim Laden: {fetchError}
      </div>
    );
  }

  if (!transactions || !accounts || !categories) {
    return <div className="flex items-center justify-center h-full text-gray-500">Lade...</div>;
  }

  function closeModal() {
    setShowAdd(false);
    setEditItem(null);
    setForm({ ...INITIAL_FORM, date: new Date().toISOString().slice(0, 10) });
    setMutationError(null);
  }

  function openAdd() {
    setForm({
      ...INITIAL_FORM,
      date: new Date().toISOString().slice(0, 10),
      // Aus einem Typ-Reiter heraus ist der Typ vorgegeben, aus „Alle" nicht.
      type: tab === "all" ? "expense" : tab,
      accountId: String(accountId ?? accounts![0]?.id ?? ""),
    });
    setEditItem(null);
    setMutationError(null);
    setShowAdd(true);
  }

  function openEdit(item: Transaction) {
    setForm({
      date: item.date,
      label: item.label,
      amount: String(item.amount),
      type: item.type,
      categoryId: item.categoryId ? String(item.categoryId) : "",
      accountId: String(item.accountId),
      counterAccountId: item.counterAccountId ? String(item.counterAccountId) : "",
      note: item.note ?? "",
    });
    setEditItem(item);
    setMutationError(null);
    setShowAdd(true);
  }

  async function handleSubmit() {
    if (!form.label || !form.amount || !form.date || !form.accountId) return;
    if (form.type === "transfer" && !form.counterAccountId) return;
    setIsSubmitting(true);
    setMutationError(null);
    try {
      const isTransfer = form.type === "transfer";
      const payload = {
        date: form.date,
        label: form.label,
        amount: parseFloat(form.amount),
        type: form.type,
        // Eine Übertragung trägt keine Kategorie — der Server erzwingt das ohnehin.
        categoryId: isTransfer ? null : form.categoryId ? parseInt(form.categoryId) : null,
        accountId: parseInt(form.accountId),
        counterAccountId: isTransfer ? parseInt(form.counterAccountId) : null,
        note: form.note || undefined,
      };
      if (editItem) {
        await api.patch(`/transactions/${editItem.id}`, payload);
      } else {
        await api.post("/transactions", payload);
      }
      closeModal();
      refetch();
      toast.success(editItem ? "Buchung gespeichert" : "Buchung hinzugefügt");
    } catch (err) {
      setMutationError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Diese Buchung wirklich löschen?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      refetch();
      toast.success("Buchung gelöscht");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
    }`;

  const amountClass = (v: number) => (v < 0 ? "text-red-400" : "text-green-400");
  const withSign = (v: number) => `${v < 0 ? "-" : "+"}${eur(Math.abs(v))}`;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Kontoauszug</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtered.length} Buchungen ·{" "}
            <span className={`font-medium ${amountClass(net)}`}>{withSign(net)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/transactions"
            download
            className="flex items-center gap-2 px-3 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
          >
            <Download size={15} /> Export
          </a>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
          >
            <Plus size={15} /> Hinzufügen
          </button>
        </div>
      </div>

      {/* Kontowahl — der Einstieg in den Auszug */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        <label className="text-xs text-gray-400 font-medium">Konto</label>
        <select
          value={accountId ?? ""}
          onChange={(e) => setAccountId(parseInt(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>

        {/* Der Anker wird ausgewiesen: ist er veraltet, driftet der Saldo — deshalb sichtbar. */}
        {hasAnchor ? (
          <span className="text-xs text-gray-400">
            Abgeglichen auf{" "}
            <span className="font-medium text-gray-200">{eur(account!.actualBalance!)}</span>
            {account!.actualBalanceDate && <> am Ende des {formatDate(account!.actualBalanceDate!)}</>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <Info size={13} />
            Kein Saldo-Abgleich — ohne ihn zeigt der Auszug keinen laufenden Kontostand.
            <Link to="/accounts" className="text-blue-400 hover:text-blue-300 underline">
              Jetzt abgleichen
            </Link>
          </span>
        )}
      </div>

      {/* Typ-Achse — gleichrangig */}
      <div className="flex gap-1 p-1 bg-gray-800/50 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t} className={tabClass(t)} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Filter */}
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
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        {tab === "all" && narrowed && hasAnchor && (
          <span className="text-xs text-gray-500">
            Saldo-Spalte ausgeblendet, solange gefiltert wird.
          </span>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">Keine Buchungen gefunden.</div>
      ) : (
        grouped.map(([ym, items]) => {
          const monthNet = items.reduce((s, t) => s + signed(t), 0);
          return (
            <div key={ym} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  {formatMonth(ym)}
                </h3>
                <span className={`text-sm font-medium ${amountClass(monthNet)}`}>
                  {withSign(monthNet)}
                </span>
              </div>

              {/* Mobile: Kartenliste */}
              <div className="md:hidden space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white text-sm truncate flex items-center gap-1.5">
                          {item.type === "transfer" && <ArrowLeftRight size={13} className="text-blue-400 shrink-0" />}
                          {item.label}
                        </p>
                        {item.note && <p className="text-xs text-gray-500 truncate">{item.note}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-500">{formatDate(item.date)}</span>
                          {item.category && <Chip item={item.category} />}
                          {item.type === "transfer" ? (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              {item.account && <Chip item={item.account} />}
                              <ArrowLeftRight size={11} />
                              {item.counterAccount && <Chip item={item.counterAccount} />}
                            </span>
                          ) : (
                            item.account && <Chip item={item.account} />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 gap-1">
                        <span className={`font-medium text-sm ${amountClass(signed(item))}`}>
                          {withSign(signed(item))}
                        </span>
                        {showBalance && item.runningBalance !== null && (
                          <span className="text-xs text-gray-500">{eur(item.runningBalance)}</span>
                        )}
                        <div className="flex gap-1">
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
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Tabelle */}
              <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium w-28">Datum</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Bezeichnung</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Kategorie</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Konto</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Betrag</th>
                      {showBalance && (
                        <th className="text-right px-4 py-3 text-gray-400 font-medium w-32">Saldo</th>
                      )}
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white flex items-center gap-1.5">
                            {item.type === "transfer" && (
                              <ArrowLeftRight size={13} className="text-blue-400 shrink-0" />
                            )}
                            {item.label}
                          </div>
                          {item.note && <div className="text-xs text-gray-500">{item.note}</div>}
                        </td>
                        <td className="px-4 py-3">{item.category && <Chip item={item.category} />}</td>
                        <td className="px-4 py-3">
                          {item.type === "transfer" ? (
                            <span className="inline-flex items-center gap-1.5">
                              {item.account && <Chip item={item.account} />}
                              <ArrowLeftRight size={11} className="text-gray-500" />
                              {item.counterAccount && <Chip item={item.counterAccount} />}
                            </span>
                          ) : (
                            item.account && <Chip item={item.account} />
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${amountClass(signed(item))}`}>
                          {withSign(signed(item))}
                        </td>
                        {showBalance && (
                          <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                            {item.runningBalance !== null ? eur(item.runningBalance) : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {/* Modal */}
      {showAdd && (
        <Modal
          title={`${TYPE_LABELS[form.type]} ${editItem ? "bearbeiten" : "hinzufügen"}`}
          onClose={closeModal}
          maxWidth="md"
        >
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Art</label>
            <div className="flex gap-1 p-1 bg-gray-800/50 rounded-xl">
              {(Object.keys(TYPE_LABELS) as TransactionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    form.type === t
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
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
              placeholder={
                form.type === "expense" ? "z.B. Restaurant"
                  : form.type === "income" ? "z.B. Bonus"
                  : "z.B. Umbuchung aufs Tagesgeld"
              }
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

          {/* Eine Übertragung hat zwei Konten in möglicherweise verschiedenen
              Kategorienräumen — die Frage „aus welchem Raum" hat keine Antwort,
              deshalb hier keine Kategorie-Auswahl. */}
          {form.type !== "transfer" && (
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
          )}

          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">
              {form.type === "transfer" ? "Von Konto" : "Konto"}
            </label>
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

          {form.type === "transfer" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Nach Konto</label>
              <select
                value={form.counterAccountId}
                onChange={(e) => setForm((f) => ({ ...f, counterAccountId: e.target.value }))}
                className="input"
              >
                <option value="">Konto wählen...</option>
                {accounts!.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Notiz (optional)</label>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="input"
            />
          </div>

          {mutationError && <p className="text-red-400 text-sm">{mutationError}</p>}

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
              {isSubmitting ? "Speichern..." : editItem ? "Speichern" : "Hinzufügen"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
