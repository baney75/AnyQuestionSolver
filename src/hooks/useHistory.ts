import { useState, useEffect, useCallback } from "react";
import type { HistoryItem } from "../types";

const STORAGE_KEY = "aqs_history";
const MAX_ITEMS = 20;

/**
 * Persists solution history in localStorage.
 * Returns the list and helpers to push new entries or clear all.
 */
export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setItems(parsed.slice(0, MAX_ITEMS));
      }
    } catch {
      /* corrupted data — start fresh */
    }
  }, []);

  const push = useCallback((item: HistoryItem) => {
    setItems((current) => {
      const next = [item, ...current].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { items, push, clear };
}
