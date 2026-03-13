import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useApi } from "../lib/api";
import { eur } from "../lib/format";

interface MonthlyEntry {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

interface CategoryEntry {
  categoryId: number | null;
  name: string;
  color: string;
  total: number;
}

interface Stats {
  monthly: MonthlyEntry[];
  byCategory: CategoryEntry[];
  totalIncome: number;
  totalExpenses: number;
  months: number;
}

const RANGES: { label: string; value: 3 | 6 | 12 | 0 }[] = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "12M", value: 12 },
  { label: "Alle", value: 0 },
];

const formatMonth = (m: string) =>
  new Date(m + "-02").toLocaleString("de-DE", { month: "short", year: "2-digit" });

const formatYAxis = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
};

const tooltipStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 8,
  color: "#f9fafb",
};

export default function Statistics() {
  const [range, setRange] = useState<3 | 6 | 12 | 0>(6);
  const { data: stats, loading } = useApi<Stats>(`/stats?months=${range}`);

  const isEmpty = !loading && stats && stats.monthly.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Statistiken</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === r.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-gray-500 text-sm">Lade Daten…</div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-400 text-lg font-medium mb-2">
            Noch keine Transaktionen vorhanden
          </p>
          <p className="text-gray-600 text-sm">
            Füge Einträge auf der{" "}
            <Link to="/transactions" className="text-blue-400 hover:underline">
              Transaktionen-Seite
            </Link>{" "}
            hinzu.
          </p>
        </div>
      )}

      {stats && stats.monthly.length > 0 && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Einnahmen (gesamt)</p>
              <p className="text-lg font-bold text-green-400">{eur(stats.totalIncome)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ausgaben (gesamt)</p>
              <p className="text-lg font-bold text-red-400">{eur(stats.totalExpenses)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 col-span-2 md:col-span-1">
              <p className="text-xs text-gray-500 mb-1">Saldo</p>
              <p
                className={`text-lg font-bold ${
                  stats.totalIncome - stats.totalExpenses >= 0
                    ? "text-blue-400"
                    : "text-red-400"
                }`}
              >
                {eur(stats.totalIncome - stats.totalExpenses)}
              </p>
            </div>
          </div>

          {/* Bar Chart — Einnahmen vs. Ausgaben */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">
              Einnahmen vs. Ausgaben
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={stats.monthly}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={{ stroke: "#4b5563" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatYAxis}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(value: number) => eur(value)}
                  labelFormatter={formatMonth}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
                  formatter={(value) =>
                    value === "income" ? "Einnahmen" : "Ausgaben"
                  }
                />
                <Bar dataKey="income" name="income" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row: Line chart + Pie chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Line Chart — Saldo-Verlauf */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">
                Saldo-Entwicklung
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={stats.monthly}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={{ stroke: "#4b5563" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatYAxis}
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    formatter={(value: number) => [eur(value), "Saldo"]}
                    labelFormatter={formatMonth}
                    contentStyle={tooltipStyle}
                  />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart — Ausgaben nach Kategorie */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">
                Ausgaben nach Kategorie
              </h2>
              {stats.byCategory.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-gray-600 text-sm">
                  Keine Ausgaben im Zeitraum
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={stats.byCategory}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {stats.byCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => eur(value)}
                      contentStyle={tooltipStyle}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
