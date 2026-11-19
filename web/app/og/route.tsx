// Link preview image for a shared view: /og?v=... (1200×630 PNG).
// Laid out like the PNG export: title, chart, the wordmark and the stripe.
// Not under /api, which is forwarded to FastAPI.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { ChartModel } from "@/lib/chartModel";
import { chartOption, isHorizontal, LIGHT } from "@/lib/chartOption";
import { echarts } from "@/lib/echarts";
import { STRIPE } from "@/lib/exporting";
import { formatValue } from "@/lib/format";
import { loadView } from "@/lib/view.server";

const W = 1200;
const H = 630;
const CHART_W = 1060;
const CHART_H = 360;
const T = LIGHT;
const MARK = ["#f88436", "#3d45aa", "#2e5a44", "#da3d20"];

const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource");
const fontFiles = [
  ["Jost", "jost/files/jost-latin-600-normal.woff", 600],
  ["Jost", "jost/files/jost-latin-ext-600-normal.woff", 600],
  ["Jost", "jost/files/jost-latin-500-normal.woff", 500],
  ["Jost", "jost/files/jost-latin-ext-500-normal.woff", 500],
  ["Mono", "jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff", 400],
  ["Mono", "jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff", 500],
] as const;

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    fontFiles.map(async ([name, file, weight]) => ({
      name,
      data: await readFile(path.join(FONT_DIR, file)),
      weight,
      style: "normal" as const,
    })),
  );
  return fonts;
}

/** Any chart as a text-free SVG (text is drawn around it in JSX, with the right fonts). */
function chartSvg(model: ChartModel, height: number) {
  const opt = chartOption(model, T, { animation: false }) as Record<string, unknown> & {
    series: Record<string, unknown>[];
  };
  const bare = (ax: unknown) => (ax ? { ...(ax as object), axisLabel: { show: false }, name: undefined } : ax);
  opt.xAxis = bare(opt.xAxis);
  opt.yAxis = bare(opt.yAxis);
  opt.grid = { left: 4, right: 4, top: 8, bottom: 8, containLabel: false };
  delete opt.legend;
  delete opt.tooltip;
  if (opt.visualMap) opt.visualMap = { ...(opt.visualMap as object), show: false };
  opt.series = opt.series.map((s) => ({
    ...s,
    label: { show: false },
    data: Array.isArray(s.data)
      ? s.data.map((d) => (d && typeof d === "object" && !Array.isArray(d) ? { ...d, label: { show: false } } : d))
      : s.data,
  }));
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: CHART_W, height });
  chart.setOption(opt);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One series of bars, drawn in JSX so the names and numbers are crisp. */
function Bars({ model }: { model: Extract<ChartModel, { kind: "bar" | "line" }> }) {
  const n = Math.min(8, model.categories.length);
  const data = model.series[0].data.slice(0, n);
  const max = Math.max(...data.map((v) => v ?? 0)) || 1;
  const rowH = CHART_H / Math.max(n, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: CHART_W, height: CHART_H, justifyContent: "center" }}>
      {data.map((v, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", height: rowH }}>
          <div style={{ width: 300, paddingRight: 18, justifyContent: "flex-end", display: "flex", fontFamily: "Jost", fontWeight: 500, fontSize: 24, color: T.text }}>
            {clip(model.categories[i], 24)}
          </div>
          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ width: `${Math.max(1, ((v ?? 0) / max) * 82)}%`, height: rowH * 0.62, background: MARK[0], borderRadius: "0 6px 6px 0" }} />
            <div style={{ marginLeft: 14, fontFamily: "Mono", fontSize: 22, color: T.text2 }}>
              {v === null ? "—" : formatValue(v, model.value)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <div style={{ display: "flex", gap: 26, marginBottom: 10, fontFamily: "Jost", fontWeight: 500, fontSize: 20, color: T.text2 }}>
      {names.slice(0, 6).map((name, i) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: T.series[i % T.series.length] }} />
          {clip(name, 18)}
        </div>
      ))}
    </div>
  );
}

function mix(a: string, b: string, t: number) {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)).join(",")})`;
}

/** A heatmap drawn in JSX, so the row and column names show. */
function Heat({ model }: { model: Extract<ChartModel, { kind: "heatmap" }> }) {
  const ys = model.ys.slice(0, 10);
  const xs = model.xs.slice(0, 12);
  const vals = model.cells.map((c) => c[2]).filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const span = Math.max(...vals) - lo || 1;
  const at = new Map(model.cells.map(([x, y, v]) => [`${x},${y}`, v]));
  const cellH = (CHART_H - 34) / ys.length;
  const label = { fontFamily: "Jost", fontWeight: 500, fontSize: 20, color: T.text };
  return (
    <div style={{ display: "flex", flexDirection: "column", width: CHART_W }}>
      <div style={{ display: "flex", height: 30, marginLeft: 220, fontFamily: "Mono", fontSize: 17, color: T.text2 }}>
        {xs.map((x) => (
          <div key={x} style={{ display: "flex", flex: 1, justifyContent: "center" }}>{clip(x, 10)}</div>
        ))}
      </div>
      {ys.map((y, yi) => (
        <div key={y} style={{ display: "flex", height: cellH, alignItems: "center" }}>
          <div style={{ ...label, display: "flex", width: 220, paddingRight: 14, justifyContent: "flex-end" }}>{clip(y, 18)}</div>
          {xs.map((x, xi) => {
            const v = at.get(`${xi},${yi}`) ?? null;
            return (
              <div
                key={x}
                style={{ display: "flex", flex: 1, height: cellH - 3, margin: "0 1.5px", borderRadius: 4, background: v === null ? T.line : mix(T.heat[0], T.heat[1], (v - lo) / span) }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Category names under a text-free bar or line chart: all of them when they fit, else the two ends. */
function Categories({ names }: { names: string[] }) {
  const style = { display: "flex", width: CHART_W, marginTop: 6, fontFamily: "Mono", fontSize: 18, color: T.text2 };
  if (names.length <= 10)
    return (
      <div style={{ ...style, padding: "0 4px" }}>
        {names.map((n, i) => (
          <div key={i} style={{ display: "flex", flex: 1, justifyContent: "center" }}>{clip(n, 12)}</div>
        ))}
      </div>
    );
  return (
    <div style={{ ...style, justifyContent: "space-between" }}>
      <span>{names[0]}</span>
      <span>{names.at(-1)}</span>
    </div>
  );
}

function ChartArea({ model }: { model: ChartModel }) {
  if (model.kind === "empty") return <div style={{ display: "flex", height: CHART_H }} />;
  if (model.kind === "heatmap") return <Heat model={model} />;
  if (model.kind === "bar" && model.series.length === 1 && isHorizontal(model)) return <Bars model={model} />;
  const names = model.series.map((s) => s.name);
  const h = names.length > 1 ? CHART_H - 40 : CHART_H;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Legend names={names} />
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
      <img src={chartSvg(model, h)} width={CHART_W} height={h} alt="" />
      {model.kind === "scatter" ? (
        <div style={{ display: "flex", justifyContent: "space-between", width: CHART_W, marginTop: 6, fontFamily: "Mono", fontSize: 18, color: T.text2 }}>
          <span>{`↑ ${model.y.label}`}</span>
          <span>{`${model.x.label} →`}</span>
        </div>
      ) : (
        <Categories names={model.categories} />
      )}
    </div>
  );
}

function Card(p: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: T.surface, alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 34 }}>
        <div style={{ display: "flex", fontFamily: "Jost", fontWeight: 600, fontSize: 40, letterSpacing: 4, color: T.text, textAlign: "center" }}>
          {clip(p.title.toUpperCase(), 44)}
        </div>
        {p.subtitle && (
          <div style={{ display: "flex", marginTop: 8, fontFamily: "Mono", fontSize: 20, color: T.text2 }}>{clip(p.subtitle, 80)}</div>
        )}
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>{p.children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", width: 22, height: 22, gap: 2 }}>
          {MARK.map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", fontFamily: "Mono", fontWeight: 500, fontSize: 18, letterSpacing: 4, color: T.text2 }}>STATGARDEN</div>
      </div>
      <div style={{ display: "flex", width: W, height: 12 }}>
        {STRIPE.map((c) => (
          <div key={c} style={{ flex: 1, background: c }} />
        ))}
      </div>
    </div>
  );
}

export async function GET(req: NextRequest) {
  const view = await loadView(req.nextUrl.searchParams.get("v"));
  const body = view ? (
    <Card title={view.title} subtitle={view.subtitle}>
      <ChartArea model={view.model} />
    </Card>
  ) : (
    <Card title="StatGarden" subtitle="NBA stats you can pivot, chart and share" />
  );
  return new ImageResponse(body, {
    width: W,
    height: H,
    fonts: await loadFonts(),
    // a view's numbers only change when new games load, so previews can be reused for a while
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
