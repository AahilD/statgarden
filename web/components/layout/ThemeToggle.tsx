"use client";

// The icon follows data-theme through CSS (.only-dark / .only-light), so there is
// no React state to sync with what the inline theme script already set.
export function ThemeToggle() {
  function flip() {
    const el = document.documentElement;
    const next = el.dataset.theme === "light" ? "dark" : "light";
    el.dataset.theme = next;
    try {
      localStorage.setItem("sg-theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label="Switch between light and dark"
      title="Switch between light and dark"
      className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-2 hover:bg-surface hover:text-ink"
    >
      <svg className="only-light" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      <svg className="only-dark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
