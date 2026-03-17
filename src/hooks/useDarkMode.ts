import { useState, useEffect } from "react";

/**
 * Manages the dark-mode toggle.
 * Initialises from the user's OS preference and keeps the `dark` class
 * on <html> in sync so Tailwind's dark variant works.
 */
export function useDarkMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", enabled);
  }, [enabled]);

  return [enabled, () => setEnabled((v) => !v)] as const;
}
