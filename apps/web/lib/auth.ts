// Session storage — localStorage-backed, per-browser. This is appropriate
// for this app's model (a short-lived JWT access token + a rotating opaque
// refresh token, both bearer tokens sent in headers, never cookies), but it
// is readable by any script on the page, so it is not a substitute for
// httpOnly-cookie sessions in a deployment that must defend against XSS
// reading localStorage — see docs/SECURITY.md.

const ACCESS_KEY = "ap_access_token";
const REFRESH_KEY = "ap_refresh_token";
const WORKSPACE_KEY = "ap_active_workspace";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private browsing / blocked storage)
  }
}
function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return safeGet(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return safeGet(REFRESH_KEY);
}
export function getActiveWorkspaceId(): string | null {
  return safeGet(WORKSPACE_KEY);
}
export function setActiveWorkspaceId(id: string) {
  safeSet(WORKSPACE_KEY, id);
}
export function setSession(tokens: { accessToken: string; refreshToken: string }) {
  safeSet(ACCESS_KEY, tokens.accessToken);
  safeSet(REFRESH_KEY, tokens.refreshToken);
}
export function clearSession() {
  safeRemove(ACCESS_KEY);
  safeRemove(REFRESH_KEY);
  safeRemove(WORKSPACE_KEY);
}
