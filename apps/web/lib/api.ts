import { getAccessToken, getRefreshToken, getActiveWorkspaceId, setSession, clearSession } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class UnauthorizedError extends Error {}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request(path: string, options?: RequestInit, _isRetry = false): Promise<any> {
  const accessToken = getAccessToken();
  const workspaceId = getActiveWorkspaceId();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    if (!_isRetry && (await tryRefresh())) {
      return request(path, options, true);
    }
    clearSession();
    throw new UnauthorizedError("Session expired — please log in again.");
  }

  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      const parsed = JSON.parse(body);
      message = parsed.details ? `${parsed.error}: ${parsed.details.join(", ")}` : parsed.error ?? body;
    } catch {
      // body wasn't JSON; use as-is
    }
    throw new Error(message || `${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // --- Auth ---
  register: (email: string, password: string, name: string) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: (refreshToken: string) =>
    request("/api/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  logoutAll: () => request("/api/auth/logout-all", { method: "POST" }),
  me: () => request("/api/auth/me"),
  updateProfile: (name: string) => request("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  requestPasswordReset: (email: string) =>
    request("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),

  // --- Workspaces ---
  listWorkspaces: () => request("/api/workspaces"),
  createWorkspace: (name: string) => request("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
  getCurrentWorkspace: () => request("/api/workspaces/current"),
  updateCurrentWorkspace: (name: string) =>
    request("/api/workspaces/current", { method: "PATCH", body: JSON.stringify({ name }) }),
  listMembers: () => request("/api/workspaces/current/members"),
  updateMemberRole: (userId: string, role: string) =>
    request(`/api/workspaces/current/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (userId: string) => request(`/api/workspaces/current/members/${userId}`, { method: "DELETE" }),
  listInvites: () => request("/api/workspaces/current/invites"),
  inviteMember: (email: string, role: string) =>
    request("/api/workspaces/current/invites", { method: "POST", body: JSON.stringify({ email, role }) }),
  revokeInvite: (id: string) => request(`/api/workspaces/current/invites/${id}`, { method: "DELETE" }),
  acceptInvite: (token: string) => request("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) }),

  // --- API keys ---
  listApiKeys: () => request("/api/api-keys"),
  createApiKey: (name: string) => request("/api/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revokeApiKey: (id: string) => request(`/api/api-keys/${id}`, { method: "DELETE" }),

  // --- Provider configs ---
  listProviderConfigs: () => request("/api/provider-configs"),
  upsertProviderConfig: (body: {
    provider: string;
    apiKey?: string;
    model?: string;
    enabled?: boolean;
    isDefault?: boolean;
  }) => request("/api/provider-configs", { method: "PUT", body: JSON.stringify(body) }),
  deleteProviderConfig: (provider: string) => request(`/api/provider-configs/${provider}`, { method: "DELETE" }),

  // --- Automations / runs (existing core loop) ---
  plan: (text: string) => request("/api/plan", { method: "POST", body: JSON.stringify({ text }) }),
  listAutomations: () => request("/api/automations"),
  createAutomation: (plan: unknown) =>
    request("/api/automations", { method: "POST", body: JSON.stringify({ plan }) }),
  getAutomation: (id: string) => request(`/api/automations/${id}`),
  deleteAutomation: (id: string) => request(`/api/automations/${id}`, { method: "DELETE" }),
  runAutomation: (id: string) => request(`/api/automations/${id}/run`, { method: "POST" }),
  pauseAutomation: (id: string) => request(`/api/automations/${id}/pause`, { method: "POST" }),
  activateAutomation: (id: string) => request(`/api/automations/${id}/activate`, { method: "POST" }),
  listRuns: () => request("/api/runs"),
  getRun: (id: string) => request(`/api/runs/${id}`),
  resolveApproval: (runId: string, approvalId: string, decision: "approved" | "rejected") =>
    request(`/api/runs/${runId}/approvals/${approvalId}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  // --- Notifications ---
  listNotifications: () => request("/api/notifications"),
  markNotificationRead: (id: string) => request(`/api/notifications/${id}/read`, { method: "POST" }),

  // --- Admin (system-level) ---
  admin: {
    stats: () => request("/api/admin/stats"),
    listUsers: (offset = 0) => request(`/api/admin/users?offset=${offset}`),
    updateUserStatus: (id: string, status: "active" | "suspended") =>
      request(`/api/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    updateUserRole: (id: string, role: string) =>
      request(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    listWorkspaces: (offset = 0) => request(`/api/admin/workspaces?offset=${offset}`),
    auditLog: (offset = 0) => request(`/api/admin/audit-log?offset=${offset}`),
    usage: () => request("/api/admin/usage"),
  },
};
