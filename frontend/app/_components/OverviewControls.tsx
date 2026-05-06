"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Settings2, X } from "lucide-react";
import { OverviewFilters, SortKey } from "../_lib/types";
import { ColumnKey, COL_LABELS } from "./overviewColumns";

const TRISTATE: Array<{ key: keyof OverviewFilters; label: string }> = [
  { key: "is_need",         label: "только нехватка" },
  { key: "is_active",       label: "только активные" },
  { key: "has_active_ebay", label: "есть активные eBay" },
  { key: "has_ended_ebay",  label: "есть снятые eBay" },
];

const TRISTATE_NEXT: Record<string, string | undefined> = {
  "":      "true",
  "true":  "false",
  "false": undefined,
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "needed-priority", label: "по приоритету закупки" },
  { key: "smart_part_id",   label: "по smart-артикулу" },
  { key: "need_qty_desc",   label: "по дефициту" },
  { key: "created_desc",    label: "по дате создания" },
];

export function OverviewControls({
  basePath,
  current,
  defaultSort,
  hiddenCols,
  onHiddenChange,
  enableHide,
  totalRows,
  visibleRows,
}: {
  basePath: string;
  current: OverviewFilters;
  defaultSort: SortKey;
  hiddenCols: ColumnKey[];
  onHiddenChange: (next: ColumnKey[]) => void;
  enableHide: boolean;
  totalRows?: number;
  visibleRows: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [minNeed, setMinNeed] = useState(current.min_need_qty ?? "");
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  // Закрываем popover при клике снаружи.
  useEffect(() => {
    if (!colsOpen) return;
    const handler = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) {
        setColsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colsOpen]);

  function pushWith(updates: Partial<OverviewFilters>) {
    const next: Record<string, string> = {};
    const merged: OverviewFilters = { ...current, ...updates };
    for (const k of Object.keys(merged) as Array<keyof OverviewFilters>) {
      const v = merged[k];
      if (v === undefined || v === "" || v === null) continue;
      next[k] = String(v);
    }
    const qs = new URLSearchParams(next).toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function cycleTristate(key: keyof OverviewFilters) {
    const cur = (current[key] as string | undefined) ?? "";
    const next = TRISTATE_NEXT[cur];
    pushWith({ [key]: next as OverviewFilters[typeof key] });
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: q.trim() || undefined, min_need_qty: minNeed || undefined });
  }

  function clearAll() {
    setQ("");
    setMinNeed("");
    router.push(basePath);
  }

  function toggleCol(col: ColumnKey, checked: boolean) {
    const next = checked
      ? hiddenCols.filter((c) => c !== col)
      : [...hiddenCols, col];
    onHiddenChange(next);
  }

  const anyFilter =
    Object.entries(current).some(([k, v]) =>
      k !== "sort" && v !== undefined && v !== "",
    ) || (current.sort && current.sort !== defaultSort);

  return (
    <div>
      <div className="filter-row" role="group" aria-label="Фильтры">
        {TRISTATE.map((t) => {
          const v = current[t.key] as string | undefined;
          const label =
            v === "true" ? t.label
            : v === "false" ? `НЕ: ${t.label}`
            : t.label;
          return (
            <button
              key={String(t.key)}
              type="button"
              className={`filter-pill${v === "true" ? " active" : v === "false" ? " active" : ""}`}
              onClick={() => cycleTristate(t.key)}
              data-testid={`pill-${String(t.key)}`}
              data-state={v ?? ""}
              style={v === "false" ? { color: "var(--error-product)", borderColor: "rgba(191,77,67,0.4)", background: "rgba(191,77,67,0.08)" } : undefined}
            >
              {label}
            </button>
          );
        })}
        {anyFilter ? (
          <button type="button" className="filter-pill" onClick={clearAll}>
            <X size={12} strokeWidth={2} /> Сброс.
          </button>
        ) : null}
      </div>

      <form className="controls" style={{ marginTop: 12 }} onSubmit={applySearch}>
        <div style={{ position: "relative", flex: 1, maxWidth: 480 }}>
          <Search
            size={16}
            strokeWidth={2}
            style={{ position: "absolute", left: 12, top: 11, color: "var(--on-dark-soft)" }}
          />
          <input
            className="input"
            placeholder="Поиск по smart-артикулу, названию или артикулу"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 36 }}
            data-testid="overview-q"
          />
        </div>
        <input
          className="input num-input"
          type="number"
          min={0}
          placeholder="мин. дефицит"
          value={minNeed}
          onChange={(e) => setMinNeed(e.target.value)}
          data-testid="overview-min-need"
        />
        <button className="btn btn-secondary" type="submit">Применить.</button>

        <select
          className="select"
          style={{ width: "auto" }}
          value={current.sort ?? defaultSort}
          onChange={(e) => pushWith({ sort: e.target.value as SortKey })}
          data-testid="overview-sort"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>

        {enableHide ? (
          <div className="popover-wrap" ref={colsRef}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setColsOpen((v) => !v)}
              data-testid="cols-toggle"
            >
              <Settings2 size={16} strokeWidth={2} /> Колонки.
            </button>
            {colsOpen ? (
              <div className="popover">
                <div className="caption-up" style={{ marginBottom: 4 }}>видимые колонки</div>
                {(Object.keys(COL_LABELS) as ColumnKey[]).map((c) => (
                  <label key={c} className="toggle">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.includes(c)}
                      onChange={(e) => toggleCol(c, e.target.checked)}
                    />
                    {COL_LABELS[c]}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="row-counts" data-testid="row-counts">
        Показано {visibleRows}{totalRows !== undefined && totalRows !== visibleRows ? ` из ${totalRows}` : ""}.
      </div>
    </div>
  );
}
