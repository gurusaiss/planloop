const KEY = "automation_platform_token";

// The backend token lives in localStorage — a per-viewer convenience store,
// not shared or synced anywhere. This is appropriate for the MVP's
// single-user model (one bearer token, no per-user accounts yet — see
// docs/SECURITY.md); it is not a substitute for real session auth once
// multiple users exist.
export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Private browsing / blocked storage — the token simply won't persist
    // across reloads; the app still works for the current page load.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
