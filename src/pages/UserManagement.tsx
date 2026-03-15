import { useState, type FormEvent } from "react";
import { UserPlus, Trash2, Key, Copy, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useApi, api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface User {
  id: number;
  email: string;
  displayName?: string;
  isAdmin: boolean;
  createdAt: string;
}

interface ApiKey {
  id: number;
  label: string;
  createdAt: string;
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { data: users, refetch: refetchUsers } = useApi<User[]>("/auth/users");
  const { data: apiKeys, refetch: refetchKeys } = useApi<ApiKey[]>("/auth/api-keys");

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const [keyLabel, setKeyLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/auth/users", { email, password, displayName: displayName || undefined, isAdmin });
      toast.success("Benutzer erstellt");
      setShowCreate(false);
      setEmail("");
      setPassword("");
      setDisplayName("");
      setIsAdmin(false);
      refetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(id: number, userEmail: string) {
    if (!confirm(`Benutzer "${userEmail}" und alle zugehörigen Daten wirklich löschen?`)) return;
    try {
      await api.delete(`/auth/users/${id}`);
      toast.success("Benutzer gelöscht");
      refetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleCreateApiKey(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api.post<{ id: number; key: string }>("/auth/api-keys", { label: keyLabel || undefined });
      setNewKey(res.key);
      setKeyLabel("");
      refetchKeys();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteApiKey(id: number) {
    try {
      await api.delete(`/auth/api-keys/${id}`);
      toast.success("API-Key gelöscht");
      refetchKeys();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Benutzerverwaltung</h1>

      {/* ── Users ──────────────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Benutzer</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserPlus size={14} /> Hinzufügen
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreateUser} className="p-4 border-b border-gray-800 bg-gray-800/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                required
                placeholder="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Passwort (mind. 6 Zeichen)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="rounded border-gray-600"
                />
                Admin-Rechte
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {creating ? "Wird erstellt…" : "Erstellen"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-gray-800">
          {users?.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {u.displayName || u.email}
                  </span>
                  {u.isAdmin && (
                    <span className="text-xs bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">Admin</span>
                  )}
                  {u.id === currentUser?.id && (
                    <span className="text-xs text-gray-500">(du)</span>
                  )}
                </div>
                {u.displayName && (
                  <span className="text-xs text-gray-500">{u.email}</span>
                )}
              </div>
              {u.id !== currentUser?.id && (
                <button
                  onClick={() => handleDeleteUser(u.id, u.email)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  title="Benutzer löschen"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── API Keys ───────────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">API-Keys</h2>
          <p className="text-xs text-gray-500 mt-1">Für MCP-Server und externe Integrationen</p>
        </div>

        {newKey && (
          <div className="p-4 border-b border-gray-800 bg-green-900/20">
            <p className="text-sm text-green-300 mb-2">Neuer API-Key erstellt. Kopiere ihn jetzt — er wird nicht mehr angezeigt:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-800 text-gray-200 text-xs px-3 py-2 rounded-lg font-mono break-all">
                {showKey ? newKey : "•".repeat(40)}
              </code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-gray-400 hover:text-white p-1.5"
                title={showKey ? "Verbergen" : "Anzeigen"}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Kopiert!"); }}
                className="text-gray-400 hover:text-white p-1.5"
                title="Kopieren"
              >
                <Copy size={16} />
              </button>
            </div>
            <button
              onClick={() => { setNewKey(null); setShowKey(false); }}
              className="text-xs text-gray-500 hover:text-gray-300 mt-2"
            >
              Schließen
            </button>
          </div>
        )}

        <form onSubmit={handleCreateApiKey} className="flex items-center gap-2 p-4 border-b border-gray-800">
          <input
            type="text"
            placeholder="Label (optional)"
            value={keyLabel}
            onChange={(e) => setKeyLabel(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            <Key size={14} /> Erstellen
          </button>
        </form>

        <div className="divide-y divide-gray-800">
          {apiKeys?.length === 0 && (
            <p className="text-sm text-gray-500 px-4 py-3">Keine API-Keys vorhanden</p>
          )}
          {apiKeys?.map((k) => (
            <div key={k.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm text-white">{k.label || `Key #${k.id}`}</span>
                <span className="text-xs text-gray-500 ml-2">
                  erstellt am {new Date(k.createdAt).toLocaleDateString("de-DE")}
                </span>
              </div>
              <button
                onClick={() => handleDeleteApiKey(k.id)}
                className="text-gray-500 hover:text-red-400 transition-colors p-1"
                title="API-Key löschen"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
