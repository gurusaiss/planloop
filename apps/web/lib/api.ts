const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

export const api = {
  health: () => request("/api/health"),
  plan: (text: string) => request("/api/plan", { method: "POST", body: JSON.stringify({ text }) }),
  listAutomations: () => request("/api/automations"),
  createAutomation: (plan: unknown) =>
    request("/api/automations", { method: "POST", body: JSON.stringify({ plan }) }),
  getAutomation: (id: string) => request(`/api/automations/${id}`),
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
};
