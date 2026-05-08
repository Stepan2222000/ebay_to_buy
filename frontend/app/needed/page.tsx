import { apiGet, ApiError } from "../_lib/api";
import { OverviewRow, OverviewFilters, SortKey, Listing, ContactMark, ContactModeValue } from "../_lib/types";
import { buildQs, pickFilters } from "../_lib/filters";
import { OverviewTable } from "../_components/OverviewTable";
import { ErrorBox } from "../_components/ErrorBox";

const DEFAULT_SORT: SortKey = "needed-priority";

type Search = Promise<Partial<Record<keyof OverviewFilters, string>>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = pickFilters(sp, { is_need: "true" });
  const qs = buildQs(filters, DEFAULT_SORT);
  try {
    const [rows, listings, contacts, mode] = await Promise.all([
      apiGet<OverviewRow[]>(`/overview?${qs}`),
      apiGet<Listing[]>("/listings"),
      apiGet<ContactMark[]>("/contacts"),
      apiGet<{ value: ContactModeValue }>("/settings/contact-mode"),
    ]);
    return (
      <OverviewTable
        rows={rows}
        listings={listings}
        title="Нехватка."
        subtitle="Только цели с дефицитом. Сверху те, на которые ещё не писали продавцам, и где дефицит больше."
        filters={filters}
        basePath="/needed"
        defaultSort={DEFAULT_SORT}
        enableHide
        hideStorageKey="overview-needed:hidden-cols"
        layoutStorageKey="overview-needed:layout"
        initialContacts={contacts}
        initialContactMode={mode.value}
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
