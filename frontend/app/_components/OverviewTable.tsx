import Link from "next/link";
import { Download } from "lucide-react";
import { OverviewRow, OverviewFilters } from "../_lib/types";
import { exportXlsxHref } from "../_lib/api";

const COLS: { key: keyof OverviewRow; label: string; align?: "right" }[] = [
  { key: "smart_part_id", label: "smart_part_id" },
  { key: "smart_name", label: "название" },
  { key: "articles_text", label: "артикулы" },
  { key: "target_qty", label: "цель", align: "right" },
  { key: "stock_total_qty", label: "наличие", align: "right" },
  { key: "need_qty", label: "не хватает", align: "right" },
  { key: "is_need", label: "is_need" },
  { key: "is_active", label: "активна" },
  { key: "active_ebay_count", label: "активные eBay", align: "right" },
  { key: "active_ebay_item_numbers", label: "номера активных" },
  { key: "active_ebay_comments", label: "комментарии активных" },
  { key: "ended_ebay_count", label: "снятые eBay", align: "right" },
  { key: "ended_ebay_item_numbers", label: "номера снятых" },
  { key: "ended_ebay_comments", label: "комментарии снятых" },
  { key: "created_at", label: "создано" },
  { key: "updated_at", label: "обновлено" },
];

function formatTs(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "");
}

function FilterPills({
  current,
  basePath,
}: { current: OverviewFilters; basePath: string }) {
  const toggles = [
    { key: "is_need", label: "is_need=true" },
    { key: "is_active", label: "is_active=true" },
    { key: "has_active_ebay", label: "active_ebay > 0" },
  ] as const;
  return (
    <div className="filter-row">
      {toggles.map((t) => {
        const active = current[t.key] === "true";
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(current)) if (k !== t.key && v) next.set(k, v);
        if (!active) next.set(t.key, "true");
        const href = `${basePath}${next.toString() ? "?" + next.toString() : ""}`;
        return (
          <Link key={t.key} href={href} className={`filter-pill${active ? " active" : ""}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function OverviewTable({
  rows,
  title,
  subtitle,
  filters,
  basePath,
}: {
  rows: OverviewRow[];
  title: string;
  subtitle?: string;
  filters: OverviewFilters;
  basePath: string;
}) {
  const exportQs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) exportQs.set(k, v);
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

      <div style={{ marginBottom: 24 }}>
        <FilterPills current={filters} basePath={basePath} />
      </div>

      {rows.length === 0 ? (
        <div className="empty">Целей пока нет. Добавьте первую через «Добавить цель.».</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "num" : undefined}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.smart_part_id} className={`row-link${r.is_active ? "" : " muted"}`}>
                  {COLS.map((c) => {
                    const raw = r[c.key];
                    if (c.key === "smart_part_id") {
                      return (
                        <td key={c.key}>
                          <Link href={`/targets/${raw}`} className="smart-id">{String(raw)}</Link>
                        </td>
                      );
                    }
                    if (c.key === "is_need") {
                      return (
                        <td key={c.key}>
                          {raw
                            ? <span className="badge badge-need">нехватка</span>
                            : <span className="badge badge-stocked">в норме</span>}
                        </td>
                      );
                    }
                    if (c.key === "is_active") {
                      return (
                        <td key={c.key}>
                          {raw
                            ? <span className="caption-up">активна</span>
                            : <span className="badge badge-paused">пауза</span>}
                        </td>
                      );
                    }
                    if (c.key === "created_at" || c.key === "updated_at") {
                      return <td key={c.key} className="mono">{formatTs(String(raw))}</td>;
                    }
                    if (c.align === "right") return <td key={c.key} className="num">{String(raw ?? 0)}</td>;
                    return <td key={c.key}>{raw === null || raw === undefined ? "" : String(raw)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
