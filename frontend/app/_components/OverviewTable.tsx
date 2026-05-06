"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { OverviewRow, OverviewFilters, SortKey } from "../_lib/types";
import { exportXlsxHref } from "../_lib/api";
import { CopyChip, CopyChipList } from "./CopyChip";
import { OverviewControls } from "./OverviewControls";
import { COL_LABELS, ColumnKey, NUMERIC } from "./overviewColumns";

const ALL_COLUMNS: ColumnKey[] = Object.keys(COL_LABELS) as ColumnKey[];

function formatTs(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "");
}

function renderCell(row: OverviewRow, col: ColumnKey) {
  const raw = row[col];
  if (col === "smart_part_id") {
    return <Link href={`/targets/${raw}`} className="smart-id">{String(raw)}</Link>;
  }
  if (col === "articles_text") {
    return <CopyChipList raw={String(raw ?? "")} />;
  }
  if (col === "active_ebay_item_numbers" || col === "ended_ebay_item_numbers") {
    return <CopyChipList raw={(raw as string | null) ?? ""} />;
  }
  if (col === "active_ebay_comments" || col === "ended_ebay_comments") {
    if (!raw) return null;
    return (
      <div style={{ whiteSpace: "pre-line", color: "var(--on-dark-soft)" }}>{String(raw)}</div>
    );
  }
  if (col === "is_need") {
    return raw
      ? <span className="badge badge-need">нехватка</span>
      : <span className="badge badge-stocked">в норме</span>;
  }
  if (col === "is_active") {
    return raw
      ? <span className="caption-up">активна</span>
      : <span className="badge badge-paused">пауза</span>;
  }
  if (col === "created_at" || col === "updated_at") {
    return <span className="mono">{formatTs(String(raw ?? ""))}</span>;
  }
  if (NUMERIC.has(col)) {
    return String(raw ?? 0);
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

export function OverviewTable({
  rows,
  title,
  subtitle,
  filters,
  basePath,
  defaultSort,
  enableHide = false,
  hideStorageKey,
}: {
  rows: OverviewRow[];
  title: string;
  subtitle?: string;
  filters: OverviewFilters;
  basePath: string;
  defaultSort: SortKey;
  enableHide?: boolean;
  hideStorageKey?: string;
}) {
  const [hiddenCols, setHiddenCols] = useState<ColumnKey[]>([]);

  useEffect(() => {
    if (!hideStorageKey) return;
    try {
      const raw = window.localStorage.getItem(hideStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHiddenCols(parsed.filter((c) => c in COL_LABELS) as ColumnKey[]);
      }
    } catch { /* ignore */ }
  }, [hideStorageKey]);

  function persistHidden(next: ColumnKey[]) {
    setHiddenCols(next);
    if (hideStorageKey) {
      window.localStorage.setItem(hideStorageKey, JSON.stringify(next));
    }
  }

  const visibleColumns = ALL_COLUMNS.filter((c) => !hiddenCols.includes(c));

  const exportQs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "" && v !== null) exportQs.set(k, String(v));
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="caption-up">список закупки</span>
          <h1 className="display-md" style={{ marginTop: 4 }}>{title}</h1>
          {subtitle ? <p className="body-md">{subtitle}</p> : null}
        </div>
        <div className="page-actions">
          <a
            className="btn btn-secondary"
            href={exportXlsxHref(exportQs)}
            data-testid="export-xlsx"
          >
            <Download size={16} strokeWidth={2} /> Скачать Excel.
          </a>
          <Link href="/targets/new" className="btn btn-primary">Добавить цель.</Link>
        </div>
      </div>

      <OverviewControls
        basePath={basePath}
        current={filters}
        defaultSort={defaultSort}
        hiddenCols={hiddenCols}
        onHiddenChange={persistHidden}
        enableHide={enableHide}
        visibleRows={rows.length}
      />

      {rows.length === 0 ? (
        <div className="empty" data-testid="empty">
          Целей по фильтру не нашлось. Попробуйте сбросить фильтры или добавить цель.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {visibleColumns.map((c) => (
                  <th key={c} className={NUMERIC.has(c) ? "num" : undefined}>
                    {COL_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.smart_part_id} className={`row-link${r.is_active ? "" : " muted"}`}>
                  {visibleColumns.map((c) => (
                    <td key={c} className={NUMERIC.has(c) ? "num" : undefined}>
                      {renderCell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
