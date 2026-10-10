"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, UnauthorizedError } from "./api";
import { getAccessToken, getActiveWorkspaceId, setActiveWorkspaceId, setSession, clearSession, getRefreshToken } from "./auth";

interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  status: string;
}
interface WorkspaceMembership {
  id: string;
  name: string;
  slug?: string;
  role: "owner" | "admin" | "member" | "viewer";
}

interface AuthState {
  loading: boolean;
  user: User | null;
  workspaces: WorkspaceMembership[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.me();
      setUser(data.user);
      setWorkspaces(data.workspaces);
      const stored = getActiveWorkspaceId();
      const resolved = stored && data.workspaces.some((w: WorkspaceMembership) => w.id === stored)
        ? stored
        : data.activeWorkspaceId ?? data.workspaces[0]?.id ?? null;
      if (resolved) {
        setActiveWorkspaceId(resolved);
        setActiveWorkspaceIdState(resolved);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function login(email: string, password: string) {
    const data = await api.login(email, password);
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setWorkspaces(data.workspaces);
    const first = data.workspaces[0]?.id;
    if (first) {
      setActiveWorkspaceId(first);
      setActiveWorkspaceIdState(first);
    }
  }

  async function register(email: string, password: string, name: string) {
    const data = await api.register(email, password, name);
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setWorkspaces([data.workspace]);
    setActiveWorkspaceId(data.workspace.id);
    setActiveWorkspaceIdState(data.workspace.id);
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await api.logout(refreshToken);
    } catch {
      // best-effort — clear local state regardless
    }
    clearSession();
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
  }

  function switchWorkspace(id: string) {
    setActiveWorkspaceId(id);
    // Simplest-correct approach: every page's data (automations, runs,
    // members, etc.) is scoped to the active workspace via the
    // X-Workspace-Id header, and most pages fetch once on mount — a full
    // reload guarantees every panel reflects the new workspace rather than
    // threading invalidation through every page individually.
    window.location.href = "/";
  }

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return (
    <AuthContext.Provider
      value={{ loading, user, workspaces, activeWorkspaceId, activeWorkspace, login, register, logout, switchWorkspace, refresh: hydrate }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
