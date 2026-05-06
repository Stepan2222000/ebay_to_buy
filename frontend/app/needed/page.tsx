import { apiGet, ApiError } from "../_lib/api";
import { OverviewRow, OverviewFilters, SortKey } from "../_lib/types";
import { OverviewTable } from "../_components/OverviewTable";
import { ErrorBox } from "../_components/ErrorBox";

const DEFAULT_SORT: SortKey = "needed-priority";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

function pickFilters(s: Partial<Record<keyof OverviewFilters, string>>): OverviewFilters {
  const out: OverviewFilters = {};
  // На /needed по умолчанию is_need=true, но пользователь может его изменить через tristate.
  out.is_need = s.is_need === "true" || s.is_need === "false" ? s.is_need : "true";
  for (const k of ["is_active", "has_active_ebay", "has_ended_ebay"] as const) {
    if (s[k] === "true" || s[k] === "false") out[k] = s[k];
  }
  if (s.q && s.q.trim()) out.q = s.q.trim();
  if (s.min_need_qty && /^\d+$/.test(s.min_need_qty)) out.min_need_qty = s.min_need_qty;
  if (s.sort === "needed-priority" || s.sort === "smart_part_id"
      || s.sort === "need_qty_desc" || s.sort === "created_desc") out.sort = s.sort;
  return out;
}

function buildQs(filters: OverviewFilters, fallbackSort: SortKey): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "" && v !== null) q.set(k, String(v));
  }
  if (!q.has("sort")) q.set("sort", fallbackSort);
  return q.toString();
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = pickFilters(sp);
  const qs = buildQs(filters, DEFAULT_SORT);
  try {
    const rows = await apiGet<OverviewRow[]>(`/overview?${qs}`);
    return (
      <OverviewTable
        rows={rows}
        title="Нехватка."
        subtitle="Только цели с дефицитом. Сверху те, на которые ещё не писали продавцам, и где дефицит больше."
        filters={filters}
        basePath="/needed"
        defaultSort={DEFAULT_SORT}
        enableHide
        hideStorageKey="overview-needed:hidden-cols"
      />
    );
  } catch (e) {
    return (
      <main className="page">
        <h1 className="display-md">Не удалось загрузить нехватку.</h1>
        <ErrorBox error={e as ApiError} />
      </main>
    );
  }
}
