import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutDashboard, Receipt, TrendingUp, Clock, Landmark, Tag, BarChart2, Bookmark, ArrowRight } from "lucide-react";
import { eur } from "../lib/format";

interface Result {
  id: string;
  type: "nav" | "expense" | "income" | "transaction";
  label: string;
  sub?: string;
  href: string;
  icon?: React.ReactNode;
}

const NAV_RESULTS: Result[] = [
  { id: "nav-/", type: "nav", label: "Dashboard", href: "/", icon: <LayoutDashboard size={14} /> },
  { id: "nav-/expenses", type: "nav", label: "Ausgaben", href: "/expenses", icon: <Receipt size={14} /> },
  { id: "nav-/income", type: "nav", label: "Einnahmen", href: "/income", icon: <TrendingUp size={14} /> },
  { id: "nav-/transactions", type: "nav", label: "Transaktionen", href: "/transactions", icon: <Clock size={14} /> },
  { id: "nav-/accounts", type: "nav", label: "Konten", href: "/accounts", icon: <Landmark size={14} /> },
  { id: "nav-/categories", type: "nav", label: "Kategorien", href: "/categories", icon: <Tag size={14} /> },
  { id: "nav-/statistics", type: "nav", label: "Statistiken", href: "/statistics", icon: <BarChart2 size={14} /> },
  { id: "nav-/templates", type: "nav", label: "Vorlagen", href: "/templates", icon: <Bookmark size={14} /> },
];

const GROUP_LABELS: Record<Result["type"], string> = {
  nav: "Navigation",
  expense: "Ausgaben",
  income: "Einnahmen",
  transaction: "Transaktionen",
};

function match(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase());
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Nur die Felder, die die Palette aus den drei Endpunkten tatsächlich liest. */
interface SearchableItem {
  id: number;
  label: string;
  amount: number;
  monthlyAmount?: number;
  date?: string;
  account?: { name?: string } | null;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [allData, setAllData] = useState<Result[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Fetch data once when first opened
  useEffect(() => {
    if (!open || dataLoaded) return;
    Promise.all([
      fetch("/api/expenses").then((r) => r.json()),
      fetch("/api/income").then((r) => r.json()),
      fetch("/api/transactions").then((r) => r.json()),
    ])
      .then(([expenses, incomes, transactions]: SearchableItem[][]) => {
        const results: Result[] = [];
        for (const e of expenses) {
          results.push({
            id: `expense-${e.id}`,
            type: "expense",
            label: e.label,
            sub: `${eur(e.monthlyAmount ?? e.amount)}/Mo · ${e.account?.name ?? ""}`,
            href: "/expenses",
          });
        }
        for (const i of incomes) {
          results.push({
            id: `income-${i.id}`,
            type: "income",
            label: i.label,
            sub: `${eur(i.monthlyAmount ?? i.amount)}/Mo · ${i.account?.name ?? ""}`,
            href: "/income",
          });
        }
        for (const t of transactions.slice(0, 200)) {
          results.push({
            id: `tx-${t.id}`,
            type: "transaction",
            label: t.label,
            sub: `${t.date} · ${eur(t.amount)}`,
            href: "/transactions",
          });
        }
        setAllData(results);
        setDataLoaded(true);
      })
      .catch(() => setDataLoaded(true));
  }, [open, dataLoaded]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useCallback((): Result[] => {
    const q = query.trim();
    const navResults = q
      ? NAV_RESULTS.filter((r) => match(r.label, q))
      : NAV_RESULTS;
    if (!q) return navResults.slice(0, 5);
    const dataResults = allData.filter((r) => match(r.label, q));
    // Group: nav first, then by type (max 5 per group)
    const grouped: Result[] = [...navResults];
    const types: Result["type"][] = ["expense", "income", "transaction"];
    for (const type of types) {
      grouped.push(...dataResults.filter((r) => r.type === type).slice(0, 5));
    }
    return grouped;
  }, [query, allData]);

  const results = filtered();

  const select = useCallback(
    (r: Result) => {
      onClose();
      navigate(r.href);
    },
    [navigate, onClose]
  );

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[selectedIdx]) { select(results[selectedIdx]); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selectedIdx, select, onClose]);

  if (!open) return null;

  // Render grouped results with section headers
  const rendered: { header?: string; result: Result; idx: number }[] = [];
  let flatIdx = 0;
  let lastType: string | null = null;
  for (const r of results) {
    if (r.type !== lastType) {
      rendered.push({ header: GROUP_LABELS[r.type], result: r, idx: flatIdx });
      lastType = r.type;
    } else {
      rendered.push({ result: r, idx: flatIdx });
    }
    flatIdx++;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm outline-none"
          />
          <kbd className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              Keine Ergebnisse für „{query}"
            </div>
          )}
          {rendered.map(({ header, result, idx }) => (
            <div key={result.id}>
              {header && (
                <div className="px-4 pt-3 pb-1 text-xs text-gray-600 font-medium uppercase tracking-wider">
                  {header}
                </div>
              )}
              <button
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  idx === selectedIdx ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800/50"
                }`}
                onClick={() => select(result)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                {result.icon && (
                  <span className="text-gray-500 flex-shrink-0">{result.icon}</span>
                )}
                <span className="flex-1 text-sm truncate">{result.label}</span>
                {result.sub && (
                  <span className="text-xs text-gray-600 flex-shrink-0">{result.sub}</span>
                )}
                <ArrowRight size={12} className="text-gray-700 flex-shrink-0" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
