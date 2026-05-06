import { apiGet, ApiError } from "../_lib/api";
import { OverviewRow, OverviewFilters, SortKey } from "../_lib/types";
import { buildQs, pickFilters } from "../_lib/filters";
import { OverviewTable } from "../_components/OverviewTable";
import { ErrorBox } from "../_components/ErrorBox";

const DEFAULT_SORT: SortKey = "needed-priority";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  // На /needed по умолчанию is_need=true. Пользователь может переключить через tristate.
  const filters = pickFilters(sp, { is_need: "true" });
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
