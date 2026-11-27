// Calculated stats saved in this browser, so they can be added to any view.
// Only a convenience: the view's link always carries its own calcs, so nothing breaks if this is empty.
import { useSyncExternalStore } from "react";
import type { Calc } from "./spec";

export type SavedCalc = Omit<Calc, "id">;

const KEY = "statgarden.calcs";
const EVENT = "statgarden:calcs";
const EMPTY: SavedCalc[] = [];
let cache: { raw: string | null; list: SavedCalc[] } = { raw: null, list: EMPTY };

function read(): SavedCalc[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.list;
  let list: SavedCalc[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      list = parsed.filter(
        (c): c is SavedCalc => c && typeof c.label === "string" && typeof c.formula === "string",
      );
    }
  } catch {
    list = EMPTY;
  }
  cache = { raw, list };
  return list;
}

function write(list: SavedCalc[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* private window or storage blocked: the link still carries the calc */
  }
  window.dispatchEvent(new Event(EVENT));
}

const same = (a: SavedCalc, b: SavedCalc) => a.label.toLowerCase() === b.label.toLowerCase();

/** Save (or update, matched by name) a calc for later. */
export function rememberCalc(c: SavedCalc) {
  const { label, formula, format, higher_is_better } = c;
  const entry = { label, formula, format, higher_is_better: higher_is_better ?? null };
  write([entry, ...read().filter((x) => !same(x, entry))]);
}

export function forgetCalc(label: string) {
  write(read().filter((x) => x.label.toLowerCase() !== label.toLowerCase()));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useSavedCalcs(): SavedCalc[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
