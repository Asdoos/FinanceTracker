import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  email: string;
  displayName?: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setupComplete: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  setup: (email: string, password: string, displayName?: string) => Promise<any>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

async function authFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  return res;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  // Check auth status on mount
  useEffect(() => {
    (async () => {
      try {
        // Check if setup is done
        const statusRes = await fetch("/api/auth/status");
        const { setupComplete: done } = await statusRes.json();
        setSetupComplete(done);

        if (!done) {
          setLoading(false);
          return;
        }

        // Try to restore session from stored token
        const token = localStorage.getItem("access_token");
        if (!token) {
          setLoading(false);
          return;
        }

        const meRes = await authFetch("/api/auth/me");
        if (meRes.ok) {
          const userData = await meRes.json();
          setUser(userData);
        } else if (meRes.status === 401) {
          // Try refresh
          const refreshed = await tryRefresh();
          if (!refreshed) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
          }
        }
      } catch {
        // Network error — stay logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function tryRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem("access_token", data.token);
      setUser(data.user);
      return true;
    } catch {
      return false;
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Login fehlgeschlagen");
    }

    const data = await res.json();
    localStorage.setItem("access_token", data.token);
    localStorage.setItem("refresh_token", data.refreshToken);
    setUser(data.user);
    setSetupComplete(true);
  }, []);

  const setup = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Setup fehlgeschlagen");
    }

    const data = await res.json();
    localStorage.setItem("access_token", data.token);
    localStorage.setItem("refresh_token", data.refreshToken);
    setUser(data.user);
    setSetupComplete(true);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authFetch("/api/auth/me");
    if (res.ok) {
      setUser(await res.json());
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, login, setup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
