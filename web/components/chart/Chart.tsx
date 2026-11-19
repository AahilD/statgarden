"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartModel } from "@/lib/chartModel";
import { chartHeight, chartOption, DARK, LIGHT, type ChartTheme } from "@/lib/chartOption";
import { echarts, type EChartsType } from "@/lib/echarts";

/** A real font stack from the page (next/font gives fonts generated names), read off a hidden probe. */
export function pageFont(cls: "font-sans" | "font-mono" | "font-display") {
  const el = document.createElement("span");
  el.className = cls;
  el.hidden = true;
  document.body.appendChild(el);
  const f = getComputedStyle(el).fontFamily;
  el.remove();
  return f;
}

export function currentTheme(): ChartTheme {
  const dark = document.documentElement.dataset.theme === "dark";
  return { ...(dark ? DARK : LIGHT), sans: pageFont("font-sans"), mono: pageFont("font-mono") };
}

/** Follows the light/dark switch on <html>. */
function useChartTheme() {
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  useEffect(() => {
    const update = () => setTheme(currentTheme());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

export function Chart(p: { model: ChartModel; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<EChartsType | null>(null);
  const theme = useChartTheme();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    inst.current = c;
    const box = el.current;
    const ro = new ResizeObserver(() => {
      c.resize();
      setNarrow(box.clientWidth < 520);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    if (inst.current && theme) inst.current.setOption(chartOption(p.model, theme, { narrow }), { notMerge: true });
  }, [p.model, theme, narrow]);

  return <div ref={el} role="img" aria-label={p.label} style={{ height: chartHeight(p.model) }} className="w-full" />;
}
