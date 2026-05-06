"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Columns3, Search, X } from "lucide-react";
import { OverviewFilters, SortKey } from "../_lib/types";
import { COL_LABELS, ColumnKey } from "./overviewColumns";
import { Dropdown } from "./Dropdown";

const PILLS: Array<{ key: keyof OverviewFilters; label: string }> = [
  { key: "is_need",         label: "только нехватка" },
  { key: "is_active",       label: "только активные" },
  { key: "has_active_ebay", label: "есть активные eBay" },
  { key: "has_ended_ebay",  label: "есть снятые eBay" },
];

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
  visibleRows,
}: {
  basePath: string;
  current: OverviewFilters;
  defaultSort: SortKey;
  hiddenCols: ColumnKey[];
  onHiddenChange: (next: ColumnKey[]) => void;
  enableHide: boolean;
  visibleRows: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const debounceRef = useRef<number | null>(null);

  // Debounced auto-apply поиска (300 мс). Никакой кнопки «Применить.».
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed === (current.q ?? "")) return;
    debounceRef.current = window.setTimeout(() => {
      pushWith({ q: trimmed || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Синк локального input-state с URL после внешней навигации (Сброс., pill).
  useEffect(() => { setQ(current.q ?? ""); }, [current.q]);

  function pushWith(updates: Partial<OverviewFilters>) {
    const merged: OverviewFilters = { ...current, ...updates };
    const next: Record<string, string> = {};
    for (const k of Object.keys(merged) as Array<keyof OverviewFilters>) {
      const v = merged[k];
      if (v === undefined || v === "" || v === null) continue;
      next[k] = String(v);
    }
    const qs = new URLSearchParams(next).toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function togglePill(key: keyof OverviewFilters) {
    const cur = current[key] as string | undefined;
    pushWith({ [key]: cur ? undefined : ("true" as OverviewFilters[typeof key]) });
  }

  function clearAll() {
    setQ("");
    router.push(basePath);
  }

  function setHidden(c: ColumnKey, visible: boolean) {
    onHiddenChange(
      visible ? hiddenCols.filter((x) => x !== c) : [...hiddenCols, c],
    );
  }

  const activeSort = current.sort ?? defaultSort;
  const sortLabel = SORT_OPTIONS.find((o) => o.key === activeSort)?.label ?? "сортировка";
  const anyFilter =
    Object.entries(current).some(([k, v]) => k !== "sort" && v !== undefined && v !== "") ||
    (current.sort && current.sort !== defaultSort);

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-pills" role="group" aria-label="Фильтры">
          {PILLS.map((p) => {
            const active = current[p.key] === "true";
            return (
              <button
                key={String(p.key)}
                type="button"
                className={`pill${active ? " active" : ""}`}
                onClick={() => togglePill(p.key)}
                data-testid={`pill-${String(p.key)}`}
                aria-pressed={active}
              >
                {p.label}
              </button>
            );
          })}
          {anyFilter ? (
            <button type="button" className="pill pill-reset" onClick={clearAll}>
              <X size={12} strokeWidth={2.5} /> сброс
            </button>
          ) : null}
        </div>

        <div className="toolbar-search">
          <Search size={16} strokeWidth={2} />
          <input
            type="search"
            className="toolbar-input"
            placeholder="Поиск по smart-артикулу, названию или артикулу"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="overview-q"
          />
          {q ? (
            <button type="button" className="toolbar-search-clear" onClick={() => setQ("")} aria-label="Очистить">
              <X size={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <Dropdown
          icon={<ArrowDownUp size={14} strokeWidth={2} />}
          label={sortLabel}
          align="right"
          width={260}
          testId="sort-dropdown"
        >
          {(close) => (
            <ul className="menu">
              {SORT_OPTIONS.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    className={`menu-item${activeSort === o.key ? " active" : ""}`}
                    onClick={() => { pushWith({ sort: o.key }); close(); }}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dropdown>

        {enableHide ? (
          <Dropdown
            icon={<Columns3 size={14} strokeWidth={2} />}
            label="колонки"
            align="right"
            width={280}
            testId="cols-dropdown"
          >
            {() => (
              <div className="menu">
                <div className="menu-header">
                  <span className="caption-up">видимые колонки</span>
                  <button
                    type="button"
                    className="menu-link"
                    onClick={() => onHiddenChange([])}
                  >
                    показать все
                  </button>
                </div>
                {(Object.keys(COL_LABELS) as ColumnKey[]).map((c) => (
                  <label key={c} className="menu-toggle">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.includes(c)}
                      onChange={(e) => setHidden(c, e.target.checked)}
                    />
                    <span>{COL_LABELS[c]}</span>
                  </label>
                ))}
              </div>
            )}
          </Dropdown>
        ) : null}
      </div>

      <div className="toolbar-counts" data-testid="row-counts">
        Показано {visibleRows}.
      </div>
    </div>
  );
}
