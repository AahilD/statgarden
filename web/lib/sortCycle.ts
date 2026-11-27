// How every sortable table on the site sorts, so they all behave the same:
// first click on a column sorts low to high, the second high to low, the third goes back to
// the table's own order.
export type SortDir = "asc" | "desc";
export type SortState = { by: string; dir: SortDir } | null;

export function nextSort(cur: SortState | undefined, by: string): SortState {
  if (!cur || cur.by !== by) return { by, dir: "asc" };
  if (cur.dir === "asc") return { by, dir: "desc" };
  return null;
}
