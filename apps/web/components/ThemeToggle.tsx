"use client";

import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { IconSun, IconMoon } from "./icons";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function cycle() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effectiveCurrent = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    const next: Theme = effectiveCurrent === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const showingDark = theme === "dark" || (theme === "system" && prefersDark);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={showingDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle color theme"
    >
      {showingDark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
