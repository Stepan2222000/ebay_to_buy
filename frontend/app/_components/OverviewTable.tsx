"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { OverviewRow, OverviewFilters, SortKey, Listing } from "../_lib/types";
import { exportXlsxHref } from "../_lib/api";
import { articleContactKey, listingContactKey, splitArticles } from "../_lib/contactKeys";
import { ActiveSelect } from "./ActiveSelect";
import { CopyChipList } from "./CopyChip";
import { EbayCell } from "./EbayCell";
import { OverviewControls } from "./OverviewControls";
import { SortableHeader } from "./SortableHeader";
import { ALL_COLUMNS, COL_LABELS, ColumnKey, DEFAULT_WIDTH, NUMERIC } from "./overviewColumns";

const MIN_WIDTH = 60;

const CONTACTED_KEY = "ebay:contacted";
const CONTACTED_TTL = 7 * 24 * 60 * 60 * 1000;
const CONTACT_MODE_KEY = "ebay:contact-mode";

// Если ничего не пропало — возвращаем тот же объект, чтобы setState с шаллоу-сравнением
// не дёргал re-render всей таблицы каждые 60 секунд.
function pruneContacted(map: Record<string, number>): Record<string, number> {
  const now = Date.now();
  let dirty = false;
  for (const v of Object.values(map)) {
    if (typeof v !== "number" || now - v >= CONTACTED_TTL) { dirty = true; break; }
  }
  if (!dirty) return map;
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number" && now - v < CONTACTED_TTL) next[k] = v;
  }
  return next;
}

function loadContacted(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONTACTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const pruned = pruneContacted(parsed as Record<string, number>);
    if (pruned !== parsed) window.localStorage.setItem(CONTACTED_KEY, JSON.stringify(pruned));
    return pruned;
  } catch { return {}; }
}

function shallowEqualMap(a: Record<string, number>, b: Record<string, number>) {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

function formatTs(value: string | null | undefined) {
  if (!value) return "";
  return value.replace("T", " ").replace(/\.\d+Z?$/, "");
}

function isListingContacted(contactedMap: Record<string, number>, id: number) {
  return !!contactedMap[listingContactKey(id)] || !!contactedMap[String(id)];
}

function isOverviewRowContacted(
  row: OverviewRow,
  listings: Listing[],
  contactMode: boolean,
  contactedMap: Record<string, number>,
) {
  if (!contactMode) return false;
  if (listings.some((l) => isListingContacted(contactedMap, l.id))) return true;
  return splitArticles(row.articles_text).some((article) =>
    !!contactedMap[articleContactKey(row.smart_part_id, article)],
  );
}

function contactKeysForOverviewRow(row: OverviewRow, listings: Listing[]) {
  const keys = new Set<string>();
  for (const article of splitArticles(row.articles_text)) {
    keys.add(articleContactKey(row.smart_part_id, article));
  }
  for (const listing of listings) {
    keys.add(listingContactKey(listing.id));
    keys.add(String(listing.id));
  }
  return keys;
}

function renderCell(
  row: OverviewRow,
  col: ColumnKey,
  listings: Listing[],
  contactMode: boolean,
  contactedMap: Record<string, number>,
  onContact: (targetKey: string) => void,
  rowContacted: boolean,
  onClearRowContacts: () => void,
) {
  const raw = row[col as keyof OverviewRow];
  if (col === "smart_part_id") {
    return <Link href={`/targets/${raw}`} className="smart-id">{String(raw)}</Link>;
  }
  if (col === "articles_text") {
    return (
      <CopyChipList
        raw={String(raw ?? "")}
        isContacted={(article) =>
          contactMode && !!contactedMap[articleContactKey(row.smart_part_id, article)]
        }
        onContact={(article) => onContact(articleContactKey(row.smart_part_id, article))}
      />
    );
  }
  if (col === "ebay") {
    return (
      <EbayCell
        smart_part_id={row.smart_part_id}
        listings={listings}
        contactMode={contactMode}
        contactedMap={contactedMap}
        onContact={onContact}
        rowContacted={rowContacted}
        onClearRowContacts={onClearRowContacts}
      />
    );
  }
  if (col === "is_need") {
    return raw
      ? <span className="badge badge-need">нехватка</span>
      : <span className="badge badge-stocked">в норме</span>;
  }
  if (col === "is_active") {
    return <ActiveSelect smart_part_id={row.smart_part_id} is_active={Boolean(raw)} />;
  }
  if (col === "created_at" || col === "updated_at") {
    return <span className="mono">{formatTs(String(raw ?? ""))}</span>;
  }
  if (NUMERIC.has(col)) {
    return String(raw ?? 0);
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

function loadOrder(key: string | undefined): ColumnKey[] {
  if (!key || typeof window === "undefined") return [...ALL_COLUMNS];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [...ALL_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL_COLUMNS];
    const known = parsed.filter((c): c is ColumnKey => c in COL_LABELS);
    const missing = ALL_COLUMNS.filter((c) => !known.includes(c));
    return [...known, ...missing];
  } catch {
    return [...ALL_COLUMNS];
  }
}

function loadSizes(key: string | undefined): Record<ColumnKey, number> {
  const out: Record<ColumnKey, number> = { ...DEFAULT_WIDTH };
  if (!key || typeof window === "undefined") return out;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const c of ALL_COLUMNS) {
        const v = (parsed as Record<string, unknown>)[c];
        if (typeof v === "number" && v >= MIN_WIDTH && v < 1200) out[c] = v;
      }
    }
  } catch { /* ignore */ }
  return out;
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
  layoutStorageKey,
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
  layoutStorageKey?: string;
}) {
  const orderKey   = layoutStorageKey ? `${layoutStorageKey}:order` : undefined;
  const sizesKey   = layoutStorageKey ? `${layoutStorageKey}:sizes` : undefined;

  const [hiddenCols, setHiddenCols] = useState<ColumnKey[]>([]);
  const [order, setOrder] = useState<ColumnKey[]>([...ALL_COLUMNS]);
  const [sizes, setSizes] = useState<Record<ColumnKey, number>>({ ...DEFAULT_WIDTH });
  const [contactMode, setContactMode] = useState(false);
  const [contactedMap, setContactedMap] = useState<Record<string, number>>({});

  // Localstorage читаем только на клиенте — на SSR пусто, иначе hydration mismatch.
  useEffect(() => {
    if (hideStorageKey) {
      try {
        const raw = window.localStorage.getItem(hideStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed))
            setHiddenCols(parsed.filter((c) => c in COL_LABELS) as ColumnKey[]);
        }
      } catch { /* ignore */ }
    }
    setOrder(loadOrder(orderKey));
    setSizes(loadSizes(sizesKey));
    setContactMode(window.localStorage.getItem(CONTACT_MODE_KEY) === "on");
    setContactedMap(loadContacted());
  }, [hideStorageKey, orderKey, sizesKey]);

  // Раз в минуту прорежаем устаревшие записи, чтобы метки сами уходили после 7 дней.
  // Если ничего не изменилось — возвращаем prev, чтобы re-render всей таблицы не запускался.
  useEffect(() => {
    const t = window.setInterval(() => {
      setContactedMap((prev) => {
        const fresh = loadContacted();
        return shallowEqualMap(prev, fresh) ? prev : fresh;
      });
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  function toggleContactMode() {
    setContactMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(CONTACT_MODE_KEY, next ? "on" : "off");
      return next;
    });
  }

  function onContact(targetKey: string) {
    if (!contactMode) return;
    setContactedMap((prev) => {
      const next = { ...prev, [targetKey]: Date.now() };
      window.localStorage.setItem(CONTACTED_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetContacts() {
    if (!window.confirm("Сбросить все отметки контактов?")) return;
    setContactedMap({});
    window.localStorage.removeItem(CONTACTED_KEY);
  }

  function clearRowContacts(row: OverviewRow, listings: Listing[]) {
    const keys = contactKeysForOverviewRow(row, listings);
    if (keys.size === 0) return;
    setContactedMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      }
      if (!changed) return prev;
      if (Object.keys(next).length === 0) window.localStorage.removeItem(CONTACTED_KEY);
      else window.localStorage.setItem(CONTACTED_KEY, JSON.stringify(next));
      return next;
    });
  }

  function persistHidden(next: ColumnKey[]) {
    setHiddenCols(next);
    if (hideStorageKey) window.localStorage.setItem(hideStorageKey, JSON.stringify(next));
  }
  function persistOrder(next: ColumnKey[]) {
    setOrder(next);
    if (orderKey) window.localStorage.setItem(orderKey, JSON.stringify(next));
  }
  function persistSizes(next: Record<ColumnKey, number>) {
    setSizes(next);
    if (sizesKey) window.localStorage.setItem(sizesKey, JSON.stringify(next));
  }

  function resetLayout() {
    persistOrder([...ALL_COLUMNS]);
    persistSizes({ ...DEFAULT_WIDTH });
  }

  // resize: финальная ширина хранится в ref-е, чтобы onUp видел свежее значение,
  // а не замыкание на старый sizes.
  const resizeRef = useRef<{
    col: ColumnKey;
    startX: number;
    startW: number;
    currentW: number;
  } | null>(null);
  const onResizeStart = useCallback((e: React.MouseEvent, col: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startW = sizes[col] ?? DEFAULT_WIDTH[col];
    resizeRef.current = { col, startX: e.clientX, startW, currentW: startW };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const next = Math.max(MIN_WIDTH, r.startW + dx);
      r.currentW = next;
      setSizes((prev) => ({ ...prev, [r.col]: next }));
    };
    const onUp = () => {
      const r = resizeRef.current;
      if (r && sizesKey) {
        setSizes((prev) => {
          const merged = { ...prev, [r.col]: r.currentW };
          window.localStorage.setItem(sizesKey, JSON.stringify(merged));
          return merged;
        });
      }
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sizes, sizesKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id as ColumnKey);
    const newIdx = order.indexOf(over.id as ColumnKey);
    if (oldIdx < 0 || newIdx < 0) return;
    persistOrder(arrayMove(order, oldIdx, newIdx));
  }

  const visibleColumns = useMemo(
    () => order.filter((c) => !hiddenCols.includes(c)),
    [order, hiddenCols],
  );

  const listingsBySmart = useMemo(() => {
    const m = new Map<string, Listing[]>();
    for (const l of listings) {
      const arr = m.get(l.smart_part_id);
      if (arr) arr.push(l);
      else m.set(l.smart_part_id, [l]);
    }
    return m;
  }, [listings]);

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
        onResetLayout={layoutStorageKey ? resetLayout : undefined}
        visibleRows={rows.length}
        contactMode={contactMode}
        onToggleContactMode={toggleContactMode}
        onResetContacts={resetContacts}
      />

      {rows.length === 0 ? (
        <div className="empty" data-testid="empty">
          Целей по фильтру не нашлось. Попробуйте сбросить фильтры или добавить цель.
        </div>
      ) : (
        <div className="table-wrap">
          <DndContext
            id="overview-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={handleDragEnd}
          >
            <table className="table table-resizable">
              <thead>
                <tr>
                  <SortableContext
                    items={visibleColumns}
                    strategy={horizontalListSortingStrategy}
                  >
                    {visibleColumns.map((c, i) => (
                      <SortableHeader
                        key={c}
                        id={c}
                        className={NUMERIC.has(c) ? "num" : undefined}
                        width={sizes[c] ?? DEFAULT_WIDTH[c]}
                        onResizeStart={onResizeStart}
                        isLast={i === visibleColumns.length - 1}
                      >
                        {COL_LABELS[c]}
                      </SortableHeader>
                    ))}
                  </SortableContext>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowListings = listingsBySmart.get(r.smart_part_id) ?? [];
                  const rowContacted = isOverviewRowContacted(
                    r,
                    rowListings,
                    contactMode,
                    contactedMap,
                  );
                  const rowClass = [
                    r.is_active ? "" : "muted",
                    rowContacted ? "contacted" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <tr key={r.smart_part_id} className={rowClass}>
                      {visibleColumns.map((c) => (
                        <td
                          key={c}
                          className={NUMERIC.has(c) ? "num" : undefined}
                          style={{ width: sizes[c] ?? DEFAULT_WIDTH[c] }}
                        >
                          {renderCell(
                            r,
                            c,
                            rowListings,
                            contactMode,
                            contactedMap,
                            onContact,
                            rowContacted,
                            () => clearRowContacts(r, rowListings),
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DndContext>
        </div>
      )}
    </main>
  );
}
