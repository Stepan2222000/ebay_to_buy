import Link from "next/link";
import { apiGet, ApiError } from "../../_lib/api";
import { OverviewRow, Listing } from "../../_lib/types";
import { TargetForm } from "../../_components/TargetForm";
import { NewListingForm, ListingRow } from "../../_components/ListingForm";
import { ErrorBox } from "../../_components/ErrorBox";
import { CopyChip, CopyChipList } from "../../_components/CopyChip";

type Params = Promise<{ smart_part_id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { smart_part_id } = await params;

  let row: OverviewRow | null = null;
  let listings: Listing[] = [];
  let loadError: ApiError | Error | null = null;
  try {
    // Сужаем overview запросом — q=smart_xxxxxxxx достанет одну строку,
    // а listings грузим параллельно.
    const [matches, foundListings] = await Promise.all([
      apiGet<OverviewRow[]>(
        `/overview?q=${encodeURIComponent(smart_part_id)}`,
      ),
      apiGet<Listing[]>(
        `/listings?smart_part_id=${encodeURIComponent(smart_part_id)}`,
      ).catch(() => [] as Listing[]),
    ]);
    row = matches.find((r) => r.smart_part_id === smart_part_id) ?? null;
    listings = foundListings;
  } catch (e) {
    loadError = e as ApiError;
  }

  if (loadError) {
    return (
      <main className="page">
        <h1 className="display-md">Не удалось загрузить цель.</h1>
        <ErrorBox error={loadError} />
      </main>
    );
  }

  if (!row) {
    return (
      <main className="page">
        <div className="page-head">
          <div>
            <span className="caption-up">цель</span>
            <h1 className="display-md" style={{ marginTop: 4 }}>Цель не найдена.</h1>
            <p className="body-md">
              {smart_part_id} нет в списке закупки. Создайте цель через{" "}
              <Link href="/targets/new" style={{ color: "var(--brand-coral)" }}>«Новая цель»</Link>.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Backend пока не отдаёт листинги отдельным эндпоинтом — собираем из overview.
  const activeNumbers = row.active_ebay_item_numbers?.split(", ").filter(Boolean) ?? [];
  const activeComments = row.active_ebay_comments?.split("\n") ?? [];
  const endedNumbers = row.ended_ebay_item_numbers?.split(", ").filter(Boolean) ?? [];
  const endedComments = row.ended_ebay_comments?.split("\n") ?? [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="caption-up">цель</span>
          <h1 className="display-md" style={{ marginTop: 4 }}>{row.smart_name}</h1>
          <div className="body-md" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <CopyChip text={row.smart_part_id} />
            {row.articles_text ? <CopyChipList raw={row.articles_text} /> : null}
          </div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary" href="/">К списку.</Link>
        </div>
      </div>

      <div className="card-stack">
        <section className="card">
          <span className="caption-up">наличие</span>
          <dl className="kv-grid" style={{ marginTop: 8 }}>
            <dt>Куплено</dt><dd>{row.stock_total_qty}</dd>
            <dt>Цель</dt><dd>{row.target_qty}</dd>
            <dt>Не хватает</dt>
            <dd>
              {row.need_qty} {row.is_need ? <span className="badge badge-need" style={{ marginLeft: 8 }}>нехватка</span> : null}
            </dd>
            <dt>Активна</dt>
            <dd>{row.is_active ? <span className="caption-up">да</span> : <span className="badge badge-paused">пауза</span>}</dd>
          </dl>
        </section>

        <section className="card">
          <span className="caption-up">редактирование цели</span>
          <div style={{ marginTop: 12 }}>
            <TargetForm
              mode="edit"
              smart_part_id={row.smart_part_id}
              smart_name={row.smart_name}
              initial={{
                smart_part_id: row.smart_part_id,
                target_qty: row.target_qty,
                is_active: row.is_active,
                created_at: row.created_at,
                updated_at: row.updated_at,
              }}
            />
          </div>
        </section>

        <section className="card">
          <span className="caption-up">активные eBay-объявления ({row.active_ebay_count})</span>
          <div className="card-stack" style={{ marginTop: 12 }}>
            {activeNumbers.length === 0 ? (
              <p className="body-sm" style={{ color: "var(--on-dark-soft)" }}>Нет активных объявлений.</p>
            ) : (
              activeNumbers.map((n, i) => (
                <ListingByNumber
                  key={n}
                  smart_part_id={row!.smart_part_id}
                  number={n}
                  comment={activeComments[i] ?? null}
                  isEnded={false}
                  listings={listings}
                />
              ))
            )}
          </div>
        </section>

        <section className="card">
          <span className="caption-up">снятые eBay-объявления ({row.ended_ebay_count})</span>
          <div className="card-stack" style={{ marginTop: 12 }}>
            {endedNumbers.length === 0 ? (
              <p className="body-sm" style={{ color: "var(--on-dark-soft)" }}>Нет снятых объявлений.</p>
            ) : (
              endedNumbers.map((n, i) => (
                <ListingByNumber
                  key={n}
                  smart_part_id={row!.smart_part_id}
                  number={n}
                  comment={endedComments[i] ?? null}
                  isEnded={true}
                  listings={listings}
                />
              ))
            )}
          </div>
        </section>

        <section className="card">
          <span className="caption-up">прикрепить новое объявление</span>
          <div style={{ marginTop: 12 }}>
            <NewListingForm smart_part_id={row.smart_part_id} />
          </div>
        </section>
      </div>
    </main>
  );
}

function ListingByNumber({
  smart_part_id,
  number,
  comment,
  isEnded,
  listings,
}: {
  smart_part_id: string;
  number: string;
  comment: string | null;
  isEnded: boolean;
  listings: Listing[];
}) {
  const found = listings.find((l) => l.ebay_item_number === number);
  const stub: Listing = found ?? {
    id: -1,
    smart_part_id,
    ebay_item_number: number,
    comment: comment,
    is_ended: isEnded,
    created_at: "",
    updated_at: "",
  };
  return <ListingRow listing={stub} />;
}
