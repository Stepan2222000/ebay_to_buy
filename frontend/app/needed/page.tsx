import { apiGet, ApiError } from "../_lib/api";
import { OverviewRow, OverviewFilters } from "../_lib/types";
import { OverviewTable } from "../_components/OverviewTable";
import { ErrorBox } from "../_components/ErrorBox";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters: OverviewFilters = { is_need: "true" };
  if (sp.is_active === "true" || sp.is_active === "false") filters.is_active = sp.is_active;
  if (sp.has_active_ebay === "true" || sp.has_active_ebay === "false") {
    filters.has_active_ebay = sp.has_active_ebay;
  }
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  try {
    const rows = await apiGet<OverviewRow[]>(`/overview?${qs}`);
    return (
      <OverviewTable
        rows={rows}
        title="Нехватка."
        subtitle="Только цели, по которым купленного количества меньше плана."
        filters={filters}
        basePath="/needed"
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
