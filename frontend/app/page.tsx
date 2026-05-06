import { apiGet, ApiError } from "./_lib/api";
import { OverviewRow, OverviewFilters, SortKey } from "./_lib/types";
import { buildQs, pickFilters } from "./_lib/filters";
import { OverviewTable } from "./_components/OverviewTable";
import { ErrorBox } from "./_components/ErrorBox";

const DEFAULT_SORT: SortKey = "smart_part_id";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = pickFilters(sp);
  const qs = buildQs(filters, DEFAULT_SORT);
  try {
    const rows = await apiGet<OverviewRow[]>(`/overview${qs ? "?" + qs : ""}`);
    return (
      <OverviewTable
        rows={rows}
        title="Список закупки."
        subtitle="Все цели по smart-артикулам и их eBay-объявления."
        filters={filters}
        basePath="/"
        defaultSort={DEFAULT_SORT}
      />
    );
  } catch (e) {
    return (
      <main className="page">
        <h1 className="display-md">Не удалось загрузить overview.</h1>
        <ErrorBox error={e as ApiError} />
      </main>
    );
  }
}
