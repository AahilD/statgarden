"use client";

// Which Lab panels are open (field list, builder). Remembered on this device only,
// not in the link: someone opening a shared view should still see how it's built.
import { useCallback, useSyncExternalStore } from "react";

export type Panels = { fields: boolean; builder: boolean };

const KEY = "statgarden.panels";
const OPEN: Panels = { fields: true, builder: true };
const listeners = new Set<() => void>();
let memory: Panels | null = null; // used when storage is blocked
let cache: { raw: string | null; value: Panels } | null = null;

function snapshot(): Panels {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return memory ?? OPEN;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = OPEN;
  try {
    const v = raw ? JSON.parse(raw) : null;
    value = { fields: v?.fields !== false, builder: v?.builder !== false };
  } catch {
    // bad data: start open
  }
  cache = { raw, value };
  return value;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

export function usePanels() {
  // the server render (and first paint) has everything open
  const panels = useSyncExternalStore(subscribe, snapshot, () => OPEN);

  const set = useCallback((next: Partial<Panels>) => {
    const merged = { ...snapshot(), ...next };
    memory = merged;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(merged));
    } catch {
      // private window or storage blocked: kept in memory for this visit
    }
    listeners.forEach((fn) => fn());
  }, []);

  return { panels, set };
}
