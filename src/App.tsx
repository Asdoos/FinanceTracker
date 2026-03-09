import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Receipt, TrendingUp, Landmark } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Income from "./pages/Income";
import Accounts from "./pages/Accounts";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/expenses", icon: Receipt, label: "Ausgaben" },
  { to: "/income", icon: TrendingUp, label: "Einnahmen" },
  { to: "/accounts", icon: Landmark, label: "Konten" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="px-5 py-5 border-b border-gray-800">
            <h1 className="text-lg font-bold text-white tracking-tight">
              Finance Tracker
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Übersicht & Verwaltung</p>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {nav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white font-medium"
                      : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/income" element={<Income />} />
            <Route path="/accounts" element={<Accounts />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
