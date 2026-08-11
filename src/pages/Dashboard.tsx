import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { eur, pct } from "../lib/format";
import { parseRoom, RoomTiles, type Room } from "../components/RoomSwitcher";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingDown, TrendingUp, Wallet, ShieldCheck, AlertTriangle, Clock, ChevronRight, ArrowLeftRight, ArrowDownToLine } from "lucide-react";

const FREIBETRAG_LIMIT = 1000;

type CategoryBreakdown = {
  category: { id: number; name: string; color: string; budget?: number | null };
  monthly: number;
  transactionMonthly: number;
  share: number;
  itemCount: number;
  pctBudget: number | null;
};

type Summary = {
  totalMonthlyExpenses: number;
  totalMonthlyIncome: number;
  totalAnnualExpenses: number;
  totalAnnualIncome: number;
  rest: number;
  totalFreibetrag: number;
  transactionExpensesThisMonth: number;
  transactionIncomeThisMonth: number;
  transactionTransfersOutThisMonth: number;
  transactionTransfersInThisMonth: number;
  byAccount: {
    account: {
      id: number;
      name: string;
      color: string;
      freibetrag?: number | null;
      freibetragYear?: number | null;
      isShared?: boolean;
    };
    monthlyExpenses: number;
    monthlyIncome: number;
    rest: number;
    itemCount: number;
    freibetragMonthly: number;
  }[];
  byCategory: CategoryBreakdown[];
  /** Ein Eintrag je Gemeinschaftskonto — dieselbe Konto-Ebene plus eigenes byCategory. */
  sharedAccounts: (Summary["byAccount"][number] & { byCategory: CategoryBreakdown[] })[];
  expenses: {
    id: number;
    label: string;
    monthlyAmount: number;
    shareOfTotal: number;
    end_date?: string | null;
    accountId: number;
    account?: { id: number; name: string; isShared?: boolean } | null;
  }[];
};

// `/api/accounts` liefert **camelCase** (`toAccount()` in `server/routes/accounts.ts`).
// Die vorherige snake_case-Deklaration war typseitig unauffällig — die Felder waren
// schlicht immer `undefined`, weshalb Zinssatz-Hinweis und Zins-Prognose nie erschienen.
type Account = {
  id: number;
  name: string;
  color: string;
  interestRate?: number | null;
  interestRateUntil?: string | null;
  actualBalance?: number | null;
};

export default function Dashboard() {
  const { data: summary, loading } = useApi<Summary>("/summary");
  const { data: accounts } = useApi<Account[]>("/accounts");
  // Der aktive Raum steht in der URL, nicht im localStorage — verworfen wurde
  // persistierter Zustand, nicht die Weitergabe.
  const [params, setParams] = useSearchParams();

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  const shared = summary.sharedAccounts ?? [];
  const sharedIds = shared.map((s) => s.account.id);
  // Unbekannter Raum fällt auf „persönlich" zurück statt zu scheitern.
  const room = parseRoom(params.get("raum"), sharedIds);
  const selectRoom = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete("raum");
    else next.set("raum", String(id));
    setParams(next, { replace: true });
  };
  const activeShared = shared.find((s) => s.account.id === room) ?? null;

  const rooms: Room[] = [
    { id: null, name: "Persönlich", color: "#3b82f6", rest: summary.rest },
    ...shared.map((s) => ({
      id: s.account.id,
      name: s.account.name,
      color: s.account.color,
      rest: s.rest,
    })),
  ];

  if (summary.expenses.length === 0 && shared.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-400">Keine Daten vorhanden.</p>
        <p className="text-sm text-gray-500">
          Erstelle Konten, Kategorien und Ausgaben über die Navigation.
        </p>
      </div>
    );
  }

  // Genau *ein* Raum in voller Breite. Im Gemeinschaftsraum stehen nur die
  // Plan-Zahlen dieses Kontos — die Buchungs-Kennzahlen des Monats gehören zur
  // persönlichen Ebene.
  const totalIncome = activeShared
    ? activeShared.monthlyIncome
    : summary.totalMonthlyIncome + summary.transactionIncomeThisMonth;
  const totalExpenses = activeShared
    ? activeShared.monthlyExpenses
    : summary.totalMonthlyExpenses + summary.transactionExpensesThisMonth;
  const totalRest = totalIncome - totalExpenses;
  const roomCategories = activeShared ? activeShared.byCategory : summary.byCategory;

  // Die Unterzeilen müssen dem Raum folgen wie der Hauptwert: die Buchungs-Splits
  // („Fix + Einmalig") gehören zur persönlichen Ebene und standen im
  // Gemeinschaftsraum unter einer Zahl, zu der sie nicht passen.
  const incomeSub = activeShared
    ? `${eur(activeShared.monthlyIncome * 12)} / Jahr`
    : summary.transactionIncomeThisMonth > 0
      ? `Fix: ${eur(summary.totalMonthlyIncome)} + Einmalig: ${eur(summary.transactionIncomeThisMonth)}`
      : `${eur(summary.totalAnnualIncome)} / Jahr`;
  const expenseSub = activeShared
    ? `${eur(activeShared.monthlyExpenses * 12)} / Jahr`
    : summary.transactionExpensesThisMonth > 0
      ? `Fix: ${eur(summary.totalMonthlyExpenses)} + Einmalig: ${eur(summary.transactionExpensesThisMonth)}`
      : `${eur(summary.totalAnnualExpenses)} / Jahr`;

  const hasMovements =
    summary.transactionExpensesThisMonth > 0 ||
    summary.transactionIncomeThisMonth > 0 ||
    summary.transactionTransfersOutThisMonth > 0 ||
    summary.transactionTransfersInThisMonth > 0;

  // Zinssätze hängen an Konten, nicht an Räumen — der Hinweis gehört deshalb in den
  // Abschnitt „Über alle Räume", nicht neben die raumgefilterten Zahlen.
  const rateNotice = (() => {
    if (!accounts) return null;
    const today = new Date();
    const in60Days = new Date(today);
    in60Days.setDate(today.getDate() + 60);

    const withUntil = accounts.filter((a) => a.interestRate && a.interestRateUntil);
    const expired = withUntil.filter((a) => new Date(a.interestRateUntil!) < today);
    const expiring = withUntil.filter((a) => {
      const d = new Date(a.interestRateUntil!);
      return d >= today && d <= in60Days;
    });
    const relevant = [...expired, ...expiring];
    if (relevant.length === 0) return null;

    return (
      <NoticeBar
        to="/accounts"
        tone="red"
        text={relevant.length === 1 ? "1 Zinssatz läuft aus" : `${relevant.length} Zinssätze laufen aus`}
        detail={relevant
          .map((a) => {
            const isExpired = new Date(a.interestRateUntil!) < today;
            return `${a.name} (${isExpired ? "abgelaufen" : new Date(a.interestRateUntil!).toLocaleDateString("de-DE")})`;
          })
          .join(" · ")}
      />
    );
  })();

  const chartData = roomCategories
    .filter((c) => c.monthly > 0)
    .map((c) => ({
      name: c.category.name,
      value: parseFloat(c.monthly.toFixed(2)),
      color: c.category.color,
    }));

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Der Raumname steht in der Überschrift, weil die Reiterreihe beim Scrollen
          aus dem Blick gerät — die Zahlen darunter bedeuten je Raum etwas anderes. */}
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        {activeShared && (
          <>
            <span className="text-gray-600">·</span>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: activeShared.account.color }}
            />
            <span className="text-xl font-semibold text-white">{activeShared.account.name}</span>
          </>
        )}
      </div>

      <RoomTiles rooms={rooms} active={room} onSelect={selectRoom} />

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KpiCard
          label="Monatliche Einnahmen"
          value={eur(totalIncome)}
          sub={incomeSub}
          icon={<TrendingUp size={18} />}
          color="text-green-400"
          bg="bg-green-500/10"
        />
        <KpiCard
          label="Monatliche Ausgaben"
          value={eur(totalExpenses)}
          sub={expenseSub}
          icon={<TrendingDown size={18} />}
          color="text-red-400"
          bg="bg-red-500/10"
        />
        {/* Die dritte Karte trägt je Raum eine **andere Größe**: persönlich den Rest
            (Vorzeichen inklusive), im Gemeinschaftsraum den monatlichen Bedarf — also
            den gespiegelten Wert. Sie sieht deshalb bewusst anders aus als eine
            gewöhnliche KPI-Karte: gleiche Gestalt bei gespiegeltem Vorzeichen ist die
            Stelle, an der man die falsche Zahl liest. */}
        {activeShared ? (
          totalRest < 0 ? (
            <KpiCard
              label="Monatlich zu decken"
              value={eur(Math.abs(totalRest))}
              sub="Bedarf des Gemeinschaftskontos"
              icon={<ArrowDownToLine size={18} />}
              color="text-amber-400"
              bg="bg-amber-500/10"
              accent="border-amber-500/40"
            />
          ) : (
            <KpiCard
              label="Monatlich gedeckt"
              value={eur(totalRest)}
              sub="Einnahmen übersteigen die Ausgaben des Kontos"
              icon={<ArrowDownToLine size={18} />}
              color="text-emerald-400"
              bg="bg-emerald-500/10"
              accent="border-emerald-500/40"
            />
          )
        ) : (
          <KpiCard
            label="Rest / Monat"
            value={eur(totalRest)}
            sub={totalRest >= 0 ? "Überschuss" : "Defizit"}
            icon={<Wallet size={18} />}
            color={totalRest >= 0 ? "text-blue-400" : "text-orange-400"}
            bg={totalRest >= 0 ? "bg-blue-500/10" : "bg-orange-500/10"}
          />
        )}
      </div>

      {/* Raumgebundener Hinweis — die ablaufenden Positionen sind auf den Raum
          gefiltert und stehen deshalb hier, nicht im Abschnitt „Über alle Räume". */}
      {(() => {
        const today = new Date();
        const in30Days = new Date(today);
        in30Days.setDate(today.getDate() + 30);

        const roomExpenses = (summary.expenses ?? []).filter((e) =>
          activeShared ? e.accountId === activeShared.account.id : !e.account?.isShared
        );
        const expiringSoon = roomExpenses.filter((e) => {
          if (!e.end_date) return false;
          const d = new Date(e.end_date);
          return d >= today && d <= in30Days;
        });

        if (expiringSoon.length === 0) return null;

        return (
          <NoticeBar
            to="/expenses"
            tone="yellow"
            text={
              expiringSoon.length === 1
                ? "1 Position läuft in den nächsten 30 Tagen aus"
                : `${expiringSoon.length} Positionen laufen in den nächsten 30 Tagen aus`
            }
            detail={expiringSoon
              .map((e) => e.label)
              .slice(0, 3)
              .join(" · ") + (expiringSoon.length > 3 ? " …" : "")}
          />
        );
      })()}

      {/* Per-account cards + Donut chart
          Im Gemeinschaftsraum steht in der linken Spalte genau **eine** Konto-Karte —
          zwei halbe Spalten wären dort eine leere und eine gefüllte. Der Raum bekommt
          deshalb eine Spalte: Konto-Karte breit, Donut breit mit Legende rechts. */}
      <div className={`grid grid-cols-1 gap-4 md:gap-6 ${activeShared ? "" : "md:grid-cols-2"}`}>
        {/* Account breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            {activeShared ? "Konto" : "Nach Konto"}
          </h3>
          {/* Genau ein Raum: im Gemeinschaftsraum steht dessen eigenes Konto, sonst die persönlichen. */}
          {(activeShared ? [activeShared] : summary.byAccount)
            .filter((a) => a.monthlyExpenses > 0 || a.monthlyIncome > 0)
            .map(({ account, monthlyExpenses, monthlyIncome, rest, itemCount, freibetragMonthly }) => {
              const hasFb = freibetragMonthly > 0 && account.freibetrag != null;
              const ausgeschoepft = monthlyIncome * 12;
              const fbJahr = account.freibetrag ?? 0;
              const pctRaw = hasFb && fbJahr > 0 ? (ausgeschoepft / fbJahr) * 100 : 0;
              const pctClamped = Math.min(pctRaw, 100);
              const barColor = pctRaw >= 100 ? "bg-red-500" : pctRaw >= 80 ? "bg-yellow-400" : "bg-emerald-500";
              const valColor = pctRaw >= 100 ? "text-red-400" : pctRaw >= 80 ? "text-yellow-400" : "text-emerald-400";

              return (
                <div
                  key={account.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: account.color }}
                    />
                    <span className="font-medium text-white">{account.name}</span>
                    <span className="ml-auto text-xs text-gray-500">
                      {itemCount} Posten
                    </span>
                  </div>
                  {/* In voller Breite (Gemeinschaftsraum) würden drei Zahlen über
                      1.100 px auseinanderlaufen — die Gruppe bleibt beisammen. */}
                  <div className={`grid grid-cols-3 gap-2 text-sm ${activeShared ? "max-w-2xl" : ""}`}>
                    <div>
                      <p className="text-gray-500 text-xs">Einnahmen</p>
                      <p className="text-green-400 font-medium">
                        {eur(monthlyIncome)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Ausgaben</p>
                      <p className="text-red-400 font-medium">
                        {eur(monthlyExpenses)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Rest</p>
                      <p
                        className={`font-medium ${
                          rest >= 0 ? "text-blue-400" : "text-orange-400"
                        }`}
                      >
                        {eur(rest)}
                      </p>
                    </div>
                  </div>

                  {hasFb && (
                    <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Freibetrag-Ausschöpfung</span>
                        <span className={valColor}>
                          {eur(ausgeschoepft)} / {eur(fbJahr)} ({pct(pctRaw)})
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${pctClamped}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">
                        * Nur Kapitalerträge (Zinsen, Dividenden)
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Donut chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Ausgaben nach Kategorie
          </h3>
          {/* Ring und Legende bleiben eine Einheit: über die volle Kartenbreite
              stünde zwischen beiden ein leeres Feld. */}
          <div className={activeShared ? "max-w-2xl mx-auto" : ""}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => eur(v)}
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#f9fafb",
                }}
              />
              {/* In voller Breite steht die Legende rechts neben dem Ring — unten
                  liefe sie sonst als eine sehr lange Zeile durch. */}
              <Legend
                {...(activeShared
                  ? { layout: "vertical" as const, align: "right" as const, verticalAlign: "middle" as const }
                  : {})}
                formatter={(value) => (
                  <span className="text-gray-300 text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Kategorie</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Monatlich</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Jährlich</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Anteil</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Budget</th>
            </tr>
          </thead>
          <tbody>
            {/* `roomCategories`, nicht `summary.byCategory` — sonst zeigt die Tabelle
                im Gemeinschaftsraum die persönlichen Kategorien, während der Donut
                direkt darüber die des Raums zeigt. */}
            {[...roomCategories]
              .filter((c) => c.monthly > 0 || c.transactionMonthly > 0)
              .sort((a, b) => (b.monthly + b.transactionMonthly) - (a.monthly + a.transactionMonthly))
              .map(({ category, monthly, transactionMonthly, share, pctBudget }) => {
                const totalMonthly = monthly + transactionMonthly;
                return (
                <tr
                  key={category.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3 flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div>{eur(totalMonthly)}</div>
                    {transactionMonthly > 0 && (
                      <div className="text-xs text-gray-500">Fix: {eur(monthly)} + Einmalig: {eur(transactionMonthly)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {eur(totalMonthly * 12)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-800 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.min(share, 100)}%`,
                            backgroundColor: category.color,
                          }}
                        />
                      </div>
                      <span className="text-gray-300 w-10 text-right">
                        {pct(share)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {category.budget != null ? (() => {
                      const p = pctBudget ?? 0;
                      const barColor = p >= 100 ? "bg-red-500" : p >= 80 ? "bg-yellow-400" : "bg-emerald-500";
                      const valColor = p >= 100 ? "text-red-400" : p >= 80 ? "text-yellow-400" : "text-emerald-400";
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs ${valColor}`}>
                            {eur(totalMonthly)} / {eur(category.budget!)}
                          </span>
                          <div className="w-24 bg-gray-800 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.min(p, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })() : <span className="text-gray-600 text-xs">–</span>}
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── Über alle Räume ──────────────────────────────────────────────
          Freibetrag und Bewegungen gehören keinem Raum: das 1.000-€-Limit gilt pro
          Person, und die Buchungssummen laufen über alle sichtbaren Konten. Bisher
          standen sie ohne Kennzeichnung mitten im raumgefilterten Inhalt — die Frage
          „warum ändert sich das nicht, wenn ich umschalte?" wird hier vorab
          beantwortet, statt sie dem Leser zu überlassen. */}
      {(hasMovements || summary.totalFreibetrag > 0 || rateNotice) && (
        <section className="pt-2 space-y-3 md:space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Über alle Räume
            </h3>
            <span className="flex-1 border-t border-dashed border-gray-800" />
          </div>

          {hasMovements && <MovementsCard summary={summary} />}

          {summary.totalFreibetrag > 0 && (
            <FreibetragCard summary={summary} shared={shared} accounts={accounts} />
          )}

          {rateNotice}
        </section>
      )}
    </div>
  );
}

/**
 * Bewegungen des laufenden Monats — Buchungen und Übertragungen in **einer** Karte.
 *
 * Vorher zwei gleich schwere Vollbreiten-Karten, die dasselbe Gewicht hatten wie die
 * Leitkennzahlen. Übertragungen bleiben **getrennt statt netto**: 1.000 € raus und
 * 1.000 € rein ist etwas anderes als keine Bewegung. Sie stehen neben den Summen,
 * nicht darin — `rest` speist sich aus der Planungsebene und kann von einer Buchung
 * nicht berührt werden.
 */
function MovementsCard({ summary }: { summary: Summary }) {
  const currentMonth = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const hasTransfers =
    summary.transactionTransfersOutThisMonth > 0 || summary.transactionTransfersInThisMonth > 0;

  return (
    <Link
      to="/transactions"
      className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-blue-400" />
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Bewegungen ({currentMonth})
        </h3>
        <ChevronRight size={14} className="ml-auto text-gray-600" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        <Figure
          label="Einmalige Ausgaben"
          value={`-${eur(summary.transactionExpensesThisMonth)}`}
          tone="text-red-400"
          muted={summary.transactionExpensesThisMonth === 0}
        />
        <Figure
          label="Einmalige Einnahmen"
          value={`+${eur(summary.transactionIncomeThisMonth)}`}
          tone="text-green-400"
          muted={summary.transactionIncomeThisMonth === 0}
        />
        <Figure
          label="Abgeflossen"
          value={eur(summary.transactionTransfersOutThisMonth)}
          tone="text-gray-200"
          muted={summary.transactionTransfersOutThisMonth === 0}
          icon={<ArrowLeftRight size={11} />}
        />
        <Figure
          label="Zugeflossen"
          value={eur(summary.transactionTransfersInThisMonth)}
          tone="text-gray-200"
          muted={summary.transactionTransfersInThisMonth === 0}
          icon={<ArrowLeftRight size={11} />}
        />
      </div>

      {hasTransfers && (
        <p className="text-xs text-gray-500 mt-3">
          Übertragungen sind Umbuchungen zwischen Konten — nicht in Ausgaben, Einnahmen oder Rest
          enthalten.
        </p>
      )}
    </Link>
  );
}

function Figure({
  label,
  value,
  tone,
  muted,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  muted?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-base font-semibold tabular-nums ${muted ? "text-gray-600" : tone}`}>
        {value}
      </p>
    </div>
  );
}

/** Freistellungsauftrag — bewusst über **alle** Räume: das Limit gilt pro Person. */
function FreibetragCard({
  summary,
  shared,
  accounts,
}: {
  summary: Summary;
  shared: Summary["sharedAccounts"];
  accounts: Account[] | null | undefined;
}) {
  const pctUsed = Math.min((summary.totalFreibetrag / FREIBETRAG_LIMIT) * 100, 100);
  const exceeded = summary.totalFreibetrag > FREIBETRAG_LIMIT;
  const currentYear = new Date().getFullYear();
  const accountsWithFb = [...summary.byAccount, ...shared].filter((a) => a.freibetragMonthly > 0);

  const withRate = (accounts ?? []).filter((a) => a.interestRate && a.actualBalance);
  const projected = withRate.reduce(
    (sum, a) => sum + (a.actualBalance! * a.interestRate!) / 100,
    0
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {exceeded ? (
          <AlertTriangle size={15} className="text-yellow-400" />
        ) : (
          <ShieldCheck size={15} className="text-emerald-400" />
        )}
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Freistellungsauftrag
        </h3>
        <span
          className={`ml-auto text-sm font-semibold tabular-nums ${
            exceeded ? "text-yellow-400" : "text-white"
          }`}
        >
          {eur(summary.totalFreibetrag)} / {eur(FREIBETRAG_LIMIT)}
        </span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${exceeded ? "bg-yellow-400" : "bg-emerald-500"}`}
          style={{ width: `${pctUsed}%` }}
        />
      </div>

      {/* Eigener Hintergrund je Zeile: nebeneinander ohne Absetzung las sich
          „600,00 €/Jahr bis 2026 ● Haushalt" wie eine einzige Zeile. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {accountsWithFb.map(({ account, freibetragMonthly }) => {
          const fbYear = account.freibetragYear;
          const expired = fbYear != null && fbYear < currentYear;
          return (
            <div
              key={account.id}
              className="flex items-center gap-2 text-sm bg-gray-800/30 rounded-lg px-2.5 py-1.5"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: account.color }}
              />
              <span className="text-gray-300 truncate">{account.name}</span>
              <span className="ml-auto text-gray-400 whitespace-nowrap tabular-nums">
                {eur(freibetragMonthly * 12)}/Jahr
              </span>
              <span className={`text-xs ${expired ? "text-red-400" : "text-gray-600"}`}>
                {fbYear != null ? (expired ? `abgel. ${fbYear}` : `bis ${fbYear}`) : "∞"}
              </span>
            </div>
          );
        })}
      </div>

      {withRate.length > 0 && (
        <div className="pt-2 border-t border-gray-800 flex justify-between text-xs text-gray-500">
          <span>Prognostizierte Jahreszinsen</span>
          <span
            className={
              projected > FREIBETRAG_LIMIT
                ? "text-red-400"
                : projected >= 800
                  ? "text-yellow-400"
                  : "text-emerald-400"
            }
          >
            {eur(projected)} ({Math.min((projected / FREIBETRAG_LIMIT) * 100, 100).toFixed(0)} %)
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Einzeilige Hinweisleiste.
 *
 * Warnungen hatten vorher dasselbe Gewicht wie Kennzahlen-Karten — bei zwei
 * gleichzeitig war das Dashboard eine Wand aus gleich aussehenden Kästen. Ein
 * Hinweis ist eine Zeile mit Ziel, kein Panel.
 */
function NoticeBar({
  to,
  tone,
  text,
  detail,
}: {
  to: string;
  tone: "yellow" | "red";
  text: string;
  detail?: string;
}) {
  const ring = tone === "red" ? "border-red-600/40 hover:border-red-500/60" : "border-yellow-600/40 hover:border-yellow-500/60";
  const icon = tone === "red" ? "text-red-400" : "text-yellow-400";
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 bg-gray-900 border ${ring} rounded-lg px-3.5 py-2.5 transition-colors`}
    >
      <AlertTriangle size={14} className={`${icon} shrink-0`} />
      <span className="text-sm text-gray-300 shrink-0">{text}</span>
      {/* Auf schmalen Schirmen entfällt das Detail ganz — abgeschnitten mitten im
          Wort trägt es nichts bei. */}
      {detail && <span className="hidden sm:inline text-xs text-gray-500 truncate">{detail}</span>}
      <ChevronRight size={14} className="ml-auto text-gray-600 shrink-0" />
    </Link>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  /** Rahmenfarbe — markiert eine Karte, die eine andere Größe trägt als ihre Nachbarn. */
  accent?: string;
}) {
  return (
    <div
      className={`bg-gray-900 border rounded-xl p-4 flex gap-4 items-start ${
        accent ?? "border-gray-800"
      }`}
    >
      <div className={`${bg} ${color} p-2 rounded-lg mt-0.5`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
