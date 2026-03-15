import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Setup() {
  const { setup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    setLoading(true);
    try {
      const data = await setup(email, password, displayName || undefined);

      if (data.migration && data.migration.totalRows > 0) {
        const m = data.migration;
        const parts: string[] = [];
        if (m.tables.accounts) parts.push(`${m.tables.accounts} Konten`);
        if (m.tables.categories) parts.push(`${m.tables.categories} Kategorien`);
        if (m.tables.expense_items) parts.push(`${m.tables.expense_items} Ausgaben`);
        if (m.tables.income_sources) parts.push(`${m.tables.income_sources} Einnahmen`);
        if (m.tables.transactions) parts.push(`${m.tables.transactions} Transaktionen`);
        if (m.tables.transaction_templates) parts.push(`${m.tables.transaction_templates} Vorlagen`);
        if (m.tables.goals) parts.push(`${m.tables.goals} Sparziele`);
        toast.success(`${m.totalRows} bestehende Datensätze zugewiesen: ${parts.join(", ")}`, {
          duration: 8000,
        });
      }

      navigate("/");
    } catch (err: any) {
      setError(err.message || "Setup fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/logo.svg" alt="Logo" className="w-10 h-10 rounded-lg" />
          <h1 className="text-xl font-bold text-white">Finance Tracker</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Erstes Setup</h2>
            <p className="text-sm text-gray-400 mt-1">Erstelle deinen Admin-Account</p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Max Mustermann"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">E-Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Passwort</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mind. 6 Zeichen"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Passwort bestätigen</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Passwort wiederholen"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors"
          >
            {loading ? "Wird erstellt…" : "Admin-Account erstellen"}
          </button>
        </form>
      </div>
    </div>
  );
}
