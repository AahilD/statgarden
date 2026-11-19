// CSV and PNG downloads. Browser only.
import type { QueryResult } from "./api";
import type { ChartTheme } from "./chartOption";
import type { Wide } from "./pivot";

export const STRIPE = ["#da3d20", "#f88436", "#fff19b", "#b2d3d2", "#4e878c", "#3d45aa"];

export function slug(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .slice(0, 60) || "view"
  );
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The table as it looks on screen: one line per row, one column per column group × value. */
export function downloadCsv(res: QueryResult, wide: Wide, title: string) {
  const single = wide.groups.length === 1 && wide.groups[0].labels.length === 0;
  const head = [
    ...res.row_fields.map((f) => f.label),
    ...wide.groups.flatMap((g) => res.values.map((v) => (single ? v.label : `${g.labels.join(" · ")} · ${v.label}`))),
  ];
  const lines = wide.rows.map((r) => [
    ...res.row_fields.map((f) => r.dims[f.id]),
    ...wide.groups.flatMap((g) => res.values.map((v) => r.cells[`${g.id}|${v.key}`])),
  ]);
  const csv = [head, ...lines].map((l) => l.map(esc).join(",")).join("\n");
  save(new Blob([`﻿${csv}\n`], { type: "text/csv;charset=utf-8" }), `statgarden-${slug(title)}.csv`);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

/** Lay the chart out like a title card: name on top, chart, then the stripe and the wordmark. */
export async function downloadPng(
  chartUrl: string,
  card: { title: string; subtitle: string; theme: ChartTheme; display: string },
) {
  const img = await loadImage(chartUrl);
  const scale = 2;
  const pad = 40 * scale;
  const w = img.width + pad * 2;
  const head = 92 * scale;
  const foot = 56 * scale;
  const h = head + img.height + foot;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const t = card.theme;

  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";

  ctx.fillStyle = t.text;
  ctx.font = `600 ${22 * scale}px ${card.display}`;
  ctx.letterSpacing = `${0.12 * 22 * scale}px`;
  ctx.fillText(card.title.toUpperCase(), w / 2, 46 * scale, w - pad * 2);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = t.text2;
  ctx.font = `400 ${12 * scale}px ${t.mono}`;
  ctx.fillText(card.subtitle, w / 2, 72 * scale, w - pad * 2);

  ctx.drawImage(img, pad, head);

  ctx.fillStyle = t.text2;
  ctx.font = `500 ${11 * scale}px ${t.mono}`;
  ctx.letterSpacing = `${0.2 * 11 * scale}px`;
  ctx.fillText("STATGARDEN", w / 2, h - 22 * scale);
  const band = 6 * scale;
  STRIPE.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect((w / STRIPE.length) * i, h - band, w / STRIPE.length + 1, band);
  });

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (blob) save(blob, `statgarden-${slug(card.title)}.png`);
}
