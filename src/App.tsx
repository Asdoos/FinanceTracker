import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Receipt, TrendingUp, Landmark, Tag, ArrowUpCircle, Clock } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Income from "./pages/Income";
import Accounts from "./pages/Accounts";
import Categories from "./pages/Categories";
import Transactions from "./pages/Transactions";
import { useUpdateCheck } from "./hooks/useUpdateCheck";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/expenses", icon: Receipt, label: "Ausgaben" },
  { to: "/income", icon: TrendingUp, label: "Einnahmen" },
  { to: "/transactions", icon: Clock, label: "Transaktionen" },
  { to: "/accounts", icon: Landmark, label: "Konten" },
  { to: "/categories", icon: Tag, label: "Kategorien" },
];

function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-gray-900 border-t border-gray-800 h-16">
      <div className="flex h-full">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isActive ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-lg ${isActive ? "bg-blue-600/20" : ""}`}>
                  <Icon size={18} />
                </div>
                <span className="leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function VersionFooter() {
  const update = useUpdateCheck(__APP_VERSION__);
  return (
    <div className="px-4 py-3 border-t border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">v{__APP_VERSION__}</span>
        {update.status === "update-available" && (
          <a
            href={update.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            title={`v${update.latestVersion} verfügbar`}
          >
            <ArrowUpCircle size={13} />
            Update
          </a>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar — nur auf md+ sichtbar */}
        <aside className="hidden md:flex w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
          <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="w-9 h-9 rounded-lg flex-shrink-0" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight">
                Finance Tracker
              </h1>
              <p className="text-xs text-gray-500 leading-tight">Übersicht & Verwaltung</p>
            </div>
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
          <VersionFooter />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/income" element={<Income />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/categories" element={<Categories />} />
          </Routes>
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav />
      </div>
    </BrowserRouter>
  );
}
