"use client";

import { useEffect, useState } from "react";

export const THEME_KEY = "ek_theme";

/** Runs before paint so the saved theme is applied without a flash. */
export const THEME_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_KEY}")==="light"){document.documentElement.classList.add("theme-light")}}catch(e){}})();`;

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  root.classList.add("theme-transitioning");
  root.classList.toggle("theme-light", theme === "light");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage may be unavailable
  }
  setTimeout(() => root.classList.remove("theme-transitioning"), 450);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTheme(document.documentElement.classList.contains("theme-light") ? "light" : "dark");
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Включить светлую тему" : "Включить тёмную тему";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      title={label}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-panel text-ink transition hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        compact ? "h-9 w-9" : "h-10 px-3 sm:px-4"
      }`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {ready && theme === "light" ? "🌙" : "☀️"}
      </span>
      {!compact && (
        <span className="hidden text-sm font-semibold sm:inline">
          {ready && theme === "light" ? "Тёмная" : "Светлая"}
        </span>
      )}
    </button>
  );
}
