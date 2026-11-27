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
import { addField, defaultWell, forQuery, switchDataset, type Well } from "@/lib/specOps";
import { calcField, calcFits, deleteCalc, newCalcId, saveCalc } from "@/lib/calcs";
import { CalcEditor } from "./CalcEditor";
import { forgetCalc, rememberCalc, useSavedCalcs, type SavedCalc } from "@/lib/savedCalcs";
import { FieldList, FieldPill } from "./FieldList";
import { Toolbar } from "./Toolbar";
import { Chevron, Wells, WellsSummary } from "./Wells";
import { usePanels } from "@/lib/usePanels";
import { ChartPanel, ResultFooter, ViewSwitch, csvAction } from "./ChartPanel";
import { PivotTable } from "@/components/table/PivotTable";
import { toWide } from "@/lib/pivot";

const ALL_ROWS = 5000; // the most the API returns

export function Builder() {
  const params = useSearchParams();
  const [spec, setSpec] = useState<PivotSpec>(() => decodeSpec(params.get("v")) ?? defaultSpec());
  const [dragging, setDragging] = useState<FieldMeta | null>(null);
  const [showFields, setShowFields] = useState(false); // phones: field list is collapsible
  const { panels, set: setPanels } = usePanels(); // wider screens: field list and builder can fold away
  const focused = !panels.fields && !panels.builder;

  const [editing, setEditing] = useState<string | "new" | null>(null); // calc being made or changed

  const fieldsQ = useQuery({ queryKey: ["fields", spec.dataset], queryFn: () => api.fields(spec.dataset) });
  const seasonsQ = useQuery({ queryKey: ["seasons", spec.dataset], queryFn: () => api.seasons(spec.dataset) });
  const datasetsQ = useQuery({ queryKey: ["datasets"], queryFn: api.datasets, staleTime: Infinity });
  const savedCalcs = useSavedCalcs();
  const savedHere = useMemo(() => {
    const inView = new Set(spec.calcs.map((c) => c.label.toLowerCase()));
    return savedCalcs.filter((c) => !inView.has(c.label.toLowerCase()));
  }, [savedCalcs, spec.calcs]);
  function addSaved(c: SavedCalc) {
    setSpec((s) => {
      if (s.calcs.length >= 8) return s;
      const id = newCalcId(s, c.label);
      return addField(saveCalc(s, { ...c, id }), calcField({ ...c, id }), "values");
    });
  }
  const calcFields = useMemo(
    () => spec.calcs.map((c) => calcField(c, !fieldsQ.data || calcFits(c, fieldsQ.data.fields))),
    [spec.calcs, fieldsQ.data],
  );
  const fields = useMemo(
    () => new Map([...(fieldsQ.data?.fields ?? []), ...calcFields].map((f) => [f.id, f])),
    [fieldsQ.data, calcFields],
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

  // a histogram counts every match, not just the rows the table shows, so it gets its own query
  const histogram = spec.chart.type === "histogram" && spec.chart.view !== "table";
  const histSent = useMemo(() => ({ ...sent, limit: ALL_ROWS }), [sent]);
  const histQ = useQuery({
    queryKey: ["query", histSent],
    queryFn: () => api.query(histSent),
    enabled: histogram && sent.values.length > 0 && fieldsQ.isSuccess,
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
    if (!panels.builder) setPanels({ builder: true }); // somewhere to drop it
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
    <DndContext id="lab" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <Toolbar
          spec={spec}
          setSpec={setSpec}
          seasons={seasonsQ.data ?? []}
          datasets={datasetsQ.data ?? []}
          onDataset={(id) => {
            setEditing(null);
            setSpec((s) => switchDataset(s, id));
          }}
          focused={focused}
          onFocus={() => {
            setShowFields(false);
            setPanels(focused ? { fields: true, builder: true } : { fields: false, builder: false });
          }}
        />

        <div
          className={`mt-5 grid gap-4 ${panels.fields ? "md:grid-cols-[240px_minmax(0,1fr)]" : "md:grid-cols-[40px_minmax(0,1fr)]"}`}
        >
          {!panels.fields && (
            <button
              type="button"
              onClick={() => setPanels({ fields: true })}
              aria-label="Show the field list"
              title="Show the field list"
              className="hidden h-40 flex-col items-center gap-2 rounded-card border border-line bg-surface py-3 text-ink-2 hover:text-ink md:sticky md:top-[78px] md:flex"
            >
              <Chevron right />
              {/* reads bottom to top, like a book spine */}
              <span className="title-caps rotate-180 text-[13px] text-ink [writing-mode:vertical-rl]">Fields</span>
            </button>
          )}
          <aside className={`relative md:sticky md:top-[78px] md:self-start ${panels.fields ? "" : "md:hidden"}`}>
            <button
              type="button"
              onClick={() => setPanels({ fields: false })}
              aria-label="Hide the field list"
              title="Hide the field list"
              className="absolute right-2 top-2 z-10 hidden h-7 w-7 place-items-center rounded-btn text-ink-2 hover:bg-sunken hover:text-ink md:grid"
            >
              <Chevron left />
            </button>
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
                key={spec.dataset}
                inUse={fieldsInUse(spec)}
                groups={fieldsQ.data?.groups ?? []}
                fields={fieldsQ.data?.fields ?? []}
                loading={fieldsQ.isLoading}
                error={fieldsQ.error?.message}
                onAdd={add}
                calcs={calcFields}
                onNewCalc={() => setEditing("new")}
                onEditCalc={(id) => setEditing(id)}
                saved={savedHere}
                onAddSaved={addSaved}
                onForgetSaved={forgetCalc}
                editor={
                  editing ? (
                    <CalcEditor
                      key={editing}
                      calc={editing === "new" ? null : (spec.calcs.find((c) => c.id === editing) ?? null)}
                      dataset={spec.dataset}
                      fields={fieldsQ.data?.fields ?? []}
                      onClose={() => setEditing(null)}
                      onDelete={editing === "new" ? undefined : () => {
                        setSpec((s) => deleteCalc(s, editing));
                        setEditing(null);
                      }}
                      onSave={(c) => {
                        rememberCalc(c);
                        setSpec((s) => {
                          const id = c.id ?? newCalcId(s, c.label);
                          const next = saveCalc(s, { ...c, id });
                          return c.id ? next : addField(next, calcField({ ...c, id }), "values");
                        });
                        setEditing(null);
                      }}
                    />
                  ) : undefined
                }
              />
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            {panels.builder ? (
              <Wells
                spec={spec}
                setSpec={setSpec}
                fields={fields}
                dragging={dragging}
                onCollapse={() => setPanels({ builder: false })}
              />
            ) : (
              <WellsSummary spec={spec} fields={fields} onExpand={() => setPanels({ builder: true })} />
            )}
            <ViewSwitch spec={spec} setSpec={setSpec} result={resultQ.data} wide={wide} onCsv={csvAction(resultQ.data, wide, spec)} />
            {spec.chart.view !== "table" && (
              <ChartPanel
                spec={spec}
                setSpec={setSpec}
                result={histogram ? histQ.data : resultQ.data}
                fields={fields}
                error={(histogram ? histQ.error : resultQ.error)?.message}
              />
            )}
            {spec.chart.view !== "chart" && (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {spec.values.length === 0 ? (
                  <Empty text="Add a value (a number like Points) to see results." />
                ) : resultQ.error ? (
                  <Empty text={resultQ.error.message} tone="error" />
                ) : resultQ.data && wide ? (
                  <PivotTable result={resultQ.data} wide={wide} spec={spec} setSpec={setSpec} fields={fields} />
                ) : (
                  <div className="h-64 animate-pulse" />
                )}
              </div>
            )}
            {spec.values.length > 0 && !resultQ.error && !(histogram && spec.chart.view === "chart") && (
              <ResultFooter
                count={wide?.rows.length}
                limit={spec.limit}
                more={resultQ.data?.more}
                ms={resultQ.data?.elapsed_ms}
                cached={resultQ.data?.cached}
                loading={resultQ.isFetching}
              />
            )}
          </section>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragging ? <FieldPill field={dragging} floating /> : null}</DragOverlay>
    </DndContext>
  );
}

function Empty({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <p className={`px-4 py-16 text-center text-sm ${tone === "error" ? "text-red" : "text-ink-2"}`}>{text}</p>
  );
}

/** Fields the view uses, so the field list can open their groups. Season and type live in the top bar. */
function fieldsInUse(spec: PivotSpec): string[] {
  return [
    ...spec.values.map((v) => v.field),
    ...spec.rows,
    ...spec.columns,
    ...spec.filters.map((f) => f.field).filter((f) => f !== "season" && f !== "season_type"),
  ];
}
