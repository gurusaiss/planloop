const KEY = "ap_theme";
export type Theme = "light" | "dark" | "system";

export function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
}

/** Inline, synchronous, no React — avoids a flash of the wrong theme before hydration. */
export const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('${KEY}');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;
