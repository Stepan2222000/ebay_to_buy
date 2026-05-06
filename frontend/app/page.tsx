import { apiGet, ApiError } from "./_lib/api";
import { OverviewRow, OverviewFilters } from "./_lib/types";
import { OverviewTable } from "./_components/OverviewTable";
import { ErrorBox } from "./_components/ErrorBox";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

function pickFilters(s: Partial<Record<keyof OverviewFilters, string>>): OverviewFilters {
  const allowed: Array<keyof OverviewFilters> = ["is_need", "is_active", "has_active_ebay"];
  const out: OverviewFilters = {};
  for (const k of allowed) {
    if (s[k] === "true" || s[k] === "false") out[k] = s[k];
  }
  return out;
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = pickFilters(sp);
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  try {
    const rows = await apiGet<OverviewRow[]>(`/overview${qs ? "?" + qs : ""}`);
    return (
      <OverviewTable
        rows={rows}
        title="Список закупки."
        subtitle="Все цели по smart-артикулам и их eBay-объявления."
        filters={filters}
        basePath="/"
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
