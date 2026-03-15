import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { LayoutDashboard, Receipt, TrendingUp, Landmark, Tag, ArrowUpCircle, Clock, BarChart2, Bookmark, Search, CalendarDays, Target, Users, LogOut, Menu, X } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Income from "./pages/Income";
import Accounts from "./pages/Accounts";
import Categories from "./pages/Categories";
import Transactions from "./pages/Transactions";
import Statistics from "./pages/Statistics";
import Templates from "./pages/Templates";
import Calendar from "./pages/Calendar";
import Goals from "./pages/Goals";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import UserManagement from "./pages/UserManagement";
import { CommandPalette } from "./components/CommandPalette";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { AuthProvider, useAuth } from "./context/AuthContext";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/expenses", icon: Receipt, label: "Ausgaben" },
  { to: "/income", icon: TrendingUp, label: "Einnahmen" },
  { to: "/transactions", icon: Clock, label: "Transaktionen" },
  { to: "/accounts", icon: Landmark, label: "Konten" },
  { to: "/categories", icon: Tag, label: "Kategorien" },
  { to: "/statistics", icon: BarChart2, label: "Statistiken" },
  { to: "/templates", icon: Bookmark, label: "Vorlagen" },
  { to: "/calendar", icon: CalendarDays, label: "Kalender" },
  { to: "/goals", icon: Target, label: "Sparziele" },
];

function MobileDrawer({ user, logout }: { user: any; logout: () => void }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  // Current page label for header
  const currentPage = nav.find((n) => n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to))?.label
    ?? (location.pathname === "/users" ? "Benutzer" : "Finance Tracker");

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800 h-14 flex items-center px-4 gap-3">
        <button onClick={() => setOpen(true)} className="text-gray-400 hover:text-white p-1 -ml-1">
          <Menu size={22} />
        </button>
        <span className="text-sm font-semibold text-white truncate">{currentPage}</span>
      </header>

      {/* Overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />
      )}

      {/* Drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="w-8 h-8 rounded-lg flex-shrink-0" />
            <span className="text-sm font-bold text-white">Finance Tracker</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={close}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white font-medium"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          {user?.isAdmin && (
            <NavLink
              to="/users"
              onClick={close}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white font-medium"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                }`
              }
            >
              <Users size={18} />
              Benutzer
            </NavLink>
          )}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
              {(user?.displayName || user?.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user?.displayName || user?.email}</p>
              {user?.displayName && (
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              )}
            </div>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1.5"
              title="Abmelden"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
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

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
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
          <div className="px-3 pt-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Search size={14} />
              <span className="flex-1 text-left">Suchen…</span>
              <kbd className="text-xs bg-gray-700 px-1.5 py-0.5 rounded border border-gray-600">⌃K</kbd>
            </button>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-1">
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
            {user?.isAdmin && (
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white font-medium"
                      : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                  }`
                }
              >
                <Users size={16} />
                Benutzer
              </NavLink>
            )}
          </nav>

          {/* User info + logout */}
          <div className="px-3 py-2 border-t border-gray-800">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                {(user?.displayName || user?.email || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{user?.displayName || user?.email}</p>
                {user?.displayName && (
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                )}
              </div>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                title="Abmelden"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>

          <VersionFooter />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/income" element={<Income />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/goals" element={<Goals />} />
            {user?.isAdmin && <Route path="/users" element={<UserManagement />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Mobile Hamburger Drawer */}
        <MobileDrawer user={user} logout={logout} />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

function AppRouter() {
  const { user, loading, setupComplete } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {setupComplete === false && (
        <>
          <Route path="/setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </>
      )}
      {setupComplete && !user && (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      )}
      {user && (
        <Route path="/*" element={<AuthenticatedApp />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151" },
            duration: 3000,
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
