import { useApi } from "../lib/api";
import { eur } from "../lib/format";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

type ExpenseItem = {
  id: number;
  label: string;
  amount: number;
  type: "monthly" | "annual";
  isActive: boolean;
  dueMonth?: number | null;
  category: { id: number; name: string; color: string } | null;
  account: { id: number; name: string; color: string } | null;
};

export default function Calendar() {
  const { data: expenses, loading, error } = useApi<ExpenseItem[]>("/expenses");

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

  const annualActive = (expenses ?? []).filter(
    (e) => e.type === "annual" && e.isActive
  );

  const byMonth = (month: number) =>
    annualActive.filter((e) => e.dueMonth === month);

  const unassigned = annualActive.filter(
    (e) => e.dueMonth == null
  );

  const monthTotal = (month: number) =>
    byMonth(month).reduce((s, e) => s + e.amount, 0);

  if (loading) return <div className="p-6 text-gray-500 text-sm">Lade…</div>;
  if (error) return <div className="p-6 text-red-400 text-sm">Fehler: {error}</div>;

  return (
    <div className="p-3 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Jahreskalender</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Fälligkeiten jährlicher Ausgaben
          </p>
        </div>
        <div className="text-xs text-gray-600 hidden md:flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Aktueller Monat
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-600 inline-block" /> Nächster Monat
          </span>
        </div>
      </div>

      {/* 12-Monats-Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {MONTH_NAMES.map((name, i) => {
          const month = i + 1;
          const items = byMonth(month);
          const isCurrent = month === currentMonth;
          const isNext = month === nextMonth;
          const total = monthTotal(month);

          return (
            <div
              key={month}
              className={`rounded-xl border p-3 flex flex-col gap-2 transition-colors ${
                isCurrent
                  ? "border-blue-500 bg-blue-600/10"
                  : isNext
                  ? "border-gray-600 bg-gray-800/60"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-semibold ${
                    isCurrent ? "text-blue-400" : "text-gray-300"
                  }`}
                >
                  {name}
                </span>
                {isCurrent && (
                  <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                    Jetzt
                  </span>
                )}
              </div>

              {/* Expense items */}
              <div className="flex flex-col gap-1 flex-1 min-h-[2rem]">
                {items.length === 0 ? (
                  <span className="text-xs text-gray-700">–</span>
                ) : (
                  items.map((e) => (
                    <div key={e.id} className="flex items-start gap-1.5">
                      {e.category && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ backgroundColor: e.category.color }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300 truncate leading-tight">{e.label}</p>
                        <p className="text-xs text-gray-600">{eur(e.amount)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Monthly total */}
              {total > 0 && (
                <div className="pt-1 border-t border-gray-800/60 text-xs text-gray-500 font-medium">
                  {eur(total)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">
            Ohne Fälligkeitsmonat ({unassigned.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 text-sm"
              >
                {e.category && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: e.category.color }}
                  />
                )}
                <span className="text-gray-300">{e.label}</span>
                <span className="text-gray-600">{eur(e.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Fälligkeitsmonat auf der Ausgaben-Seite festlegen.
          </p>
        </div>
      )}

      {annualActive.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-400 text-lg font-medium mb-2">
            Keine jährlichen Ausgaben vorhanden
          </p>
          <p className="text-gray-600 text-sm">
            Füge auf der Ausgaben-Seite Einträge mit Typ „Jährlich" hinzu.
          </p>
        </div>
      )}
    </div>
  );
}
