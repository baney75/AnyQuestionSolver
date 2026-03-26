import { useState, useEffect } from "react";

const STORAGE_KEY = "aqs_dark_mode";

/**
 * Manages the dark-mode toggle.
 * Initialises from the user's OS preference and keeps the `dark` class
 * on <html> in sync so Tailwind's dark variant works.
 */
export function useDarkMode() {
  const [enabled, setEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") {
        return true;
      }
      if (saved === "false") {
        return false;
      }
    } catch {
      /* storage may be unavailable */
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncWithSystem = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === null) {
          setEnabled(event.matches);
        }
      } catch {
        setEnabled(event.matches);
      }
    };

    mediaQuery.addEventListener("change", syncWithSystem);
    return () => mediaQuery.removeEventListener("change", syncWithSystem);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", enabled);
  }, [enabled]);

  const toggle = () => {
    setEnabled((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* storage may be unavailable */
      }
      return next;
    });
  };

  return [enabled, toggle] as const;
}
