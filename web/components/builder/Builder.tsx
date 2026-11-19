"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type FieldMeta } from "@/lib/api";
import { decodeSpec, defaultSpec, encodeSpec, type PivotSpec } from "@/lib/spec";
import { addField, defaultWell, forQuery, type Well } from "@/lib/specOps";
import { FieldList, FieldPill } from "./FieldList";
import { Toolbar } from "./Toolbar";
import { ChartWells, Wells } from "./Wells";
import { ChartPanel, ViewSwitch, csvAction } from "./ChartPanel";
import { PivotTable } from "@/components/table/PivotTable";
import { toWide } from "@/lib/pivot";

export function Builder() {
  const params = useSearchParams();
  const [spec, setSpec] = useState<PivotSpec>(() => decodeSpec(params.get("v")) ?? defaultSpec());
  const [dragging, setDragging] = useState<FieldMeta | null>(null);
  const [showFields, setShowFields] = useState(false); // phones: field list is collapsible

  const fieldsQ = useQuery({ queryKey: ["fields", spec.dataset], queryFn: () => api.fields(spec.dataset) });
  const seasonsQ = useQuery({ queryKey: ["seasons", spec.dataset], queryFn: () => api.seasons(spec.dataset) });
  const fields = useMemo(
    () => new Map((fieldsQ.data?.fields ?? []).map((f) => [f.id, f])),
    [fieldsQ.data],
  );

  // keep the link in step with the view (replaceState: no history entry per drag)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (params.get("v")) return;
    }
    const t = setTimeout(() => {
      window.history.replaceState(null, "", `/lab?v=${encodeSpec(spec)}`);
    }, 250);
    return () => clearTimeout(t);
  }, [spec, params]);

  const sent = useMemo(() => forQuery(spec), [spec]);
  const resultQ = useQuery({
    queryKey: ["query", sent],
    queryFn: () => api.query(sent),
    enabled: sent.values.length > 0 && fieldsQ.isSuccess,
    placeholderData: keepPreviousData,
  });

  // spread the long result into table rows and column groups once, here
  const wide = useMemo(() => (resultQ.data ? toWide(resultQ.data) : undefined), [resultQ.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging(fields.get(String(e.active.id)) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const field = fields.get(String(e.active.id));
    const well = e.over?.id as Well | undefined;
    if (field && well) setSpec((s) => addField(s, field, well));
  }
  function add(field: FieldMeta) {
    setSpec((s) => addField(s, field, defaultWell(field)));
    setShowFields(false);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <Toolbar spec={spec} setSpec={setSpec} seasons={seasonsQ.data ?? []} />

        <div className="mt-5 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="md:sticky md:top-[78px] md:self-start">
            <button
              type="button"
              onClick={() => setShowFields((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded-btn border border-line bg-surface px-3 py-2 text-sm md:hidden"
              aria-expanded={showFields}
            >
              <span className="label-mono">Fields</span>
              <span className="text-ink-2">{showFields ? "Hide" : "Show"}</span>
            </button>
            <div className={`${showFields ? "block" : "hidden"} md:block`}>
              <FieldList
                groups={fieldsQ.data?.groups ?? []}
                fields={fieldsQ.data?.fields ?? []}
                loading={fieldsQ.isLoading}
                error={fieldsQ.error?.message}
                onAdd={add}
              />
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <Wells spec={spec} setSpec={setSpec} fields={fields} dragging={dragging} />
            <ViewSwitch
              view={spec.chart.view}
              setSpec={setSpec}
              status={resultStatus(resultQ.isFetching, wide?.rows.length, resultQ.data?.elapsed_ms, resultQ.data?.cached)}
              onCsv={csvAction(resultQ.data, wide, spec)}
            />
            {spec.chart.view !== "table" && (
              <ChartPanel
                spec={spec}
                setSpec={setSpec}
                result={resultQ.data}
                fields={fields}
                error={resultQ.error?.message}
              >
                <ChartWells spec={spec} setSpec={setSpec} fields={fields} dragging={dragging} />
              </ChartPanel>
            )}
            {spec.chart.view !== "chart" && (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {spec.values.length === 0 ? (
                  <Empty text="Add a value (a number like Points) to see results." />
                ) : resultQ.error ? (
                  <Empty text={resultQ.error.message} tone="error" />
                ) : resultQ.data && wide ? (
                  <PivotTable result={resultQ.data} wide={wide} spec={spec} setSpec={setSpec} />
                ) : (
                  <div className="h-64 animate-pulse" />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragging ? <FieldPill field={dragging} floating /> : null}</DragOverlay>
    </DndContext>
  );
}

function resultStatus(fetching: boolean, count?: number, ms?: number, cached?: boolean) {
  if (fetching) return "Working…";
  if (count === undefined) return "";
  return `${count.toLocaleString()} rows · ${cached ? "cached" : `${ms} ms`}`;
}

function Empty({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <p className={`px-4 py-16 text-center text-sm ${tone === "error" ? "text-red" : "text-ink-2"}`}>{text}</p>
  );
}
