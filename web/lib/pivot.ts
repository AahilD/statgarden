// Spread the API's long result (one row per row-group x column-group) into a
// wide table: column-field combinations become column groups.
import type { QueryResult, ResultField } from "./api";

export type ColumnGroup = { id: string; labels: string[] }; // labels: one per column field
export type WideRow = {
  id: string;
  dims: Record<string, string>;
  cells: Record<string, number | null>; // `${groupId}|${valueKey}`
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
      };
      rowsById.set(rowId, wr);
    }
    for (const v of res.values) {
      const raw = r[v.key];
      wr.cells[`${groupId}|${v.key}`] = typeof raw === "number" ? raw : raw == null ? null : Number(raw);
    }
  }
  return { rows: [...rowsById.values()], groups: orderGroups([...groups.values()], res.column_fields) };
}
