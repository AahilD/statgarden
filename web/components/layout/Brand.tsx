// Small brand pieces shared by the header, footer and home page.

/** The six-colour stripe, same element as the personal website. */
export function Stripes() {
  return (
    <div className="stripes" aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

/** Four garden plots: one per colour in the builder (values, rows, columns, filters). */
export function Mark({ size = 18 }: { size?: number }) {
  const cell = (size - 2) / 2;
  return (
    <span aria-hidden className="inline-grid shrink-0 grid-cols-2 gap-[2px]" style={{ width: size, height: size }}>
      <i className="rounded-[2px] bg-orange" style={{ width: cell, height: cell }} />
      <i className="rounded-[2px] bg-blue" style={{ width: cell, height: cell }} />
      <i className="rounded-[2px] bg-green" style={{ width: cell, height: cell }} />
      <i className="rounded-[2px] bg-red" style={{ width: cell, height: cell }} />
    </span>
  );
}

/** STAT + GARDEN, with "Garden" set on a forest-green block. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`title-caps inline-flex items-center ${className}`}>
      <span className="tracking-[0.18em]">Stat</span>
      <span className="ml-[0.2em] rounded-[4px] bg-green px-[0.35em] py-[0.05em] tracking-[0.18em] text-on-color">
        Garden
      </span>
    </span>
  );
}
