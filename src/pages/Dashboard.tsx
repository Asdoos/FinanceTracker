import { useApi } from "../lib/api";
import { eur, pct } from "../lib/format";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

type Summary = {
  totalMonthlyExpenses: number;
  totalMonthlyIncome: number;
  totalAnnualExpenses: number;
  totalAnnualIncome: number;
  rest: number;
  byAccount: {
    account: { id: number; name: string; color: string };
    monthlyExpenses: number;
    monthlyIncome: number;
    rest: number;
    itemCount: number;
  }[];
  byCategory: {
    category: { id: number; name: string; color: string };
    monthly: number;
    share: number;
    itemCount: number;
  }[];
  expenses: {
    id: number;
    label: string;
    monthlyAmount: number;
    shareOfTotal: number;
  }[];
};

export default function Dashboard() {
  const { data: summary, loading } = useApi<Summary>("/summary");

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Lade...
      </div>
    );
  }

  if (summary.expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-400">Keine Daten vorhanden.</p>
        <p className="text-sm text-gray-500">
          Erstelle Konten, Kategorien und Ausgaben über die Navigation.
        </p>
      </div>
    );
  }

  const chartData = summary.byCategory
    .filter((c) => c.monthly > 0)
    .map((c) => ({
      name: c.category.name,
      value: parseFloat(c.monthly.toFixed(2)),
      color: c.category.color,
    }));

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-white">Dashboard</h2>

      {/* Top KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Monatliche Einnahmen"
          value={eur(summary.totalMonthlyIncome)}
          sub={`${eur(summary.totalAnnualIncome)} / Jahr`}
          icon={<TrendingUp size={18} />}
          color="text-green-400"
          bg="bg-green-500/10"
        />
        <KpiCard
          label="Monatliche Ausgaben"
          value={eur(summary.totalMonthlyExpenses)}
          sub={`${eur(summary.totalAnnualExpenses)} / Jahr`}
          icon={<TrendingDown size={18} />}
          color="text-red-400"
          bg="bg-red-500/10"
        />
        <KpiCard
          label="Rest / Monat"
          value={eur(summary.rest)}
          sub={summary.rest >= 0 ? "Überschuss" : "Defizit"}
          icon={<Wallet size={18} />}
          color={summary.rest >= 0 ? "text-blue-400" : "text-orange-400"}
          bg={summary.rest >= 0 ? "bg-blue-500/10" : "bg-orange-500/10"}
        />
      </div>

      {/* Per-account cards + Donut chart */}
      <div className="grid grid-cols-2 gap-6">
        {/* Account breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Nach Konto
          </h3>
          {summary.byAccount
            .filter((a) => a.monthlyExpenses > 0 || a.monthlyIncome > 0)
            .map(({ account, monthlyExpenses, monthlyIncome, rest, itemCount }) => (
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
                <div className="grid grid-cols-3 gap-2 text-sm">
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
              </div>
            ))}
        </div>

        {/* Donut chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Ausgaben nach Kategorie
          </h3>
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
              <Legend
                formatter={(value) => (
                  <span className="text-gray-300 text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Kategorie</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Monatlich</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Jährlich</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Anteil</th>
            </tr>
          </thead>
          <tbody>
            {[...summary.byCategory]
              .filter((c) => c.monthly > 0)
              .sort((a, b) => b.monthly - a.monthly)
              .map(({ category, monthly, share }) => (
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
                  <td className="px-4 py-3 text-right">{eur(monthly)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {eur(monthly * 12)}
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-4 items-start">
      <div className={`${bg} ${color} p-2 rounded-lg mt-0.5`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
