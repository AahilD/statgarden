"use client";

import { useEffect, useRef, useState } from "react";

/** Open/closed state for a small popover that closes on an outside click or Escape. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(initiallyOpen = false) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}
