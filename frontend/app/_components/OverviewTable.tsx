"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { OverviewRow, OverviewFilters, SortKey, Listing } from "../_lib/types";
import { exportXlsxHref } from "../_lib/api";
import { CopyChip, CopyChipList } from "./CopyChip";
import { EbayCell } from "./EbayCell";
import { OverviewControls } from "./OverviewControls";
import { ALL_COLUMNS, COL_LABELS, ColumnKey, NUMERIC } from "./overviewColumns";

function formatTs(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "");
}

function renderCell(row: OverviewRow, col: ColumnKey, listings: Listing[]) {
  const raw = row[col as keyof OverviewRow];
  if (col === "smart_part_id") {
    return <Link href={`/targets/${raw}`} className="smart-id">{String(raw)}</Link>;
  }
  if (col === "articles_text") {
    return <CopyChipList raw={String(raw ?? "")} />;
  }
  if (col === "ebay") {
    return <EbayCell smart_part_id={row.smart_part_id} listings={listings} />;
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
  listings,
  title,
  subtitle,
  filters,
  basePath,
  defaultSort,
  enableHide = false,
  hideStorageKey,
}: {
  rows: OverviewRow[];
  listings: Listing[];
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
        if (Array.isArray(parsed))
          setHiddenCols(parsed.filter((c) => c in COL_LABELS) as ColumnKey[]);
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

  // Группируем listings по smart_part_id один раз.
  const listingsBySmart = new Map<string, Listing[]>();
  for (const l of listings) {
    const arr = listingsBySmart.get(l.smart_part_id);
    if (arr) arr.push(l);
    else listingsBySmart.set(l.smart_part_id, [l]);
  }

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
                  <th
                    key={c}
                    className={`${NUMERIC.has(c) ? "num" : ""} col-${c.replace(/_/g, "-")}`}
                  >
                    {COL_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.smart_part_id} className={r.is_active ? "" : "muted"}>
                  {visibleColumns.map((c) => (
                    <td
                      key={c}
                      className={`${NUMERIC.has(c) ? "num" : ""} col-${c.replace(/_/g, "-")}`}
                    >
                      {renderCell(r, c, listingsBySmart.get(r.smart_part_id) ?? [])}
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
