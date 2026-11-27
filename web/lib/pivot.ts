// Spread the API's long result (one row per row-group x column-group) into a
// wide table: column-field combinations become column groups.
import type { QueryResult, ResultField } from "./api";

export type ColumnGroup = { id: string; labels: string[] }; // labels: one per column field
export type WideRow = {
  id: string;
  dims: Record<string, string>;
  cells: Record<string, number | null>; // `${groupId}|${valueKey}`
  links: Record<string, string | null>; // field id → page on the site, for row fields that have one
};
export type Wide = { rows: WideRow[]; groups: ColumnGroup[] };

const SEP = "␟";

function dimValue(row: QueryResult["rows"][number], f: ResultField) {
  const v = row[`d_${f.id}`];
  return v === null || v === undefined ? "—" : String(v);
}

function identity(row: QueryResult["rows"][number], f: ResultField) {
  const key = row[`d_${f.id}__key`];
  return key !== undefined && key !== null ? String(key) : dimValue(row, f);
}

/** The site page a row field's value opens, if any. */
function linkFor(row: QueryResult["rows"][number], f: ResultField): string | null {
  const v = row[`d_${f.id}`];
  if (v === null || v === undefined) return null;
  if (f.link === "player") {
    const key = row[`d_${f.id}__key`];
    return key == null ? null : `/players/${key}`;
  }
  if (f.link === "team") return `/teams/${v}`;
  if (f.link === "game") {
    const game = row[`d_${f.id}__game`];
    return game == null ? null : `/games/${game}`;
  }
  return null;
}

function orderGroups(groups: ColumnGroup[], fields: ResultField[]) {
  return groups.sort((a, b) => {
    for (let i = 0; i < fields.length; i++) {
      const bins = fields[i].bins;
      const x = a.labels[i];
      const y = b.labels[i];
      if (x === y) continue;
      if (bins) {
        const ix = bins.indexOf(x);
        const iy = bins.indexOf(y);
        if (ix !== iy) return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy);
      }
      return x.localeCompare(y, undefined, { numeric: true });
    }
    return 0;
  });
}

export function toWide(res: QueryResult): Wide {
  const rowsById = new Map<string, WideRow>();
  const groups = new Map<string, ColumnGroup>();
  const gameSeen = new Map<string, Set<string | null>>();

  for (const r of res.rows) {
    const rowId = res.row_fields.map((f) => identity(r, f)).join(SEP) || "all";
    const labels = res.column_fields.map((f) => dimValue(r, f));
    const groupId = labels.join(SEP) || "all";
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, labels });

    let wr = rowsById.get(rowId);
    if (!wr) {
      wr = {
        id: rowId,
        dims: Object.fromEntries(res.row_fields.map((f) => [f.id, dimValue(r, f)])),
        cells: {},
        links: Object.fromEntries(res.row_fields.filter((f) => f.link).map((f) => [f.id, linkFor(r, f)])),
      };
      rowsById.set(rowId, wr);
    }
    // with column fields a row arrives once per column group: a date is one game only if every
    // group says the same game
    for (const f of res.row_fields) {
      if (f.link !== "game") continue;
      const k = `${rowId}${SEP}${f.id}`;
      gameSeen.set(k, (gameSeen.get(k) ?? new Set()).add(linkFor(r, f)));
    }
    for (const v of res.values) {
      const raw = r[v.key];
      wr.cells[`${groupId}|${v.key}`] = typeof raw === "number" ? raw : raw == null ? null : Number(raw);
    }
  }
  for (const wr of rowsById.values()) {
    for (const f of res.row_fields) {
      if (f.link !== "game") continue;
      const seen = gameSeen.get(`${wr.id}${SEP}${f.id}`);
      wr.links[f.id] = seen && seen.size === 1 ? [...seen][0] : null;
    }
  }
  return { rows: [...rowsById.values()], groups: orderGroups([...groups.values()], res.column_fields) };
}
