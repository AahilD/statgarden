// Server side: turn a shared link's ?v= into its numbers and chart, for link
// previews (og:image) and the page title. Talks to FastAPI directly.
import type { FieldMeta, QueryResult } from "./api";
import { betterFor } from "./shade";
import { buildChartModel, type ChartModel } from "./chartModel";
import { decodeSpec, type PivotSpec } from "./spec";
import { forQuery } from "./specOps";
import { chartTitle, filterLine } from "./viewTitle";

const API_URL = process.env.STATGARDEN_API_URL ?? "http://localhost:8000";

export type View = { spec: PivotSpec; result: QueryResult; model: ChartModel; title: string; subtitle: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** One view's numbers, or null if the API can't be reached (callers draw without them). */
export async function queryView(spec: PivotSpec): Promise<QueryResult | null> {
  try {
    return await post<QueryResult>("/query", forQuery(spec));
  } catch {
    return null;
  }
}

/** null when the link has no view, or the view has nothing to show. */
export async function loadView(v: string | null | undefined): Promise<View | null> {
  const spec = decodeSpec(v);
  if (!spec || spec.values.length === 0) return null;
  try {
    const [result, meta] = await Promise.all([
      post<QueryResult>("/query", forQuery(spec)),
      get<{ fields: FieldMeta[] }>(`/meta/fields?dataset=${encodeURIComponent(spec.dataset)}`),
    ]);
    const byId = new Map(meta.fields.map((f) => [f.id, f]));
    const model = buildChartModel(result, spec.chart, (v) => betterFor(v, spec));
    return {
      spec,
      result,
      model,
      title: chartTitle(model),
      subtitle: filterLine(spec.filters, (id) => byId.get(id)?.label ?? id, (id) => byId.get(id)),
    };
  } catch {
    return null;
  }
}
