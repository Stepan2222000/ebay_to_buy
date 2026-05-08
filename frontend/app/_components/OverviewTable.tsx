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
import {
  OverviewRow, OverviewFilters, SortKey, Listing,
  ContactMark, ContactModeValue,
} from "../_lib/types";
import { ApiError, apiSend, exportXlsxHref } from "../_lib/api";
import { articleContactKey, listingContactKey, splitArticles } from "../_lib/contactKeys";
import { ActiveSelect } from "./ActiveSelect";
import { ContactError } from "./ContactError";
import { CopyChipList } from "./CopyChip";
import { EbayCell } from "./EbayCell";
import { OverviewControls } from "./OverviewControls";
import { SortableHeader } from "./SortableHeader";
import { ALL_COLUMNS, COL_LABELS, ColumnKey, DEFAULT_WIDTH, NUMERIC } from "./overviewColumns";

const MIN_WIDTH = 60;

const MIGRATED_FLAG = "ebay:migrated-to-db";
const LEGACY_CONTACTED = "ebay:contacted";
const LEGACY_CONTACT_MODE = "ebay:contact-mode";

function contactsToMap(items: ContactMark[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.target_key] = Date.parse(it.marked_at);
  return out;
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
  initialContacts,
  initialContactMode,
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
  initialContacts: ContactMark[];
  initialContactMode: ContactModeValue;
}) {
  const orderKey   = layoutStorageKey ? `${layoutStorageKey}:order` : undefined;
  const sizesKey   = layoutStorageKey ? `${layoutStorageKey}:sizes` : undefined;

  const [hiddenCols, setHiddenCols] = useState<ColumnKey[]>([]);
  const [order, setOrder] = useState<ColumnKey[]>([...ALL_COLUMNS]);
  const [sizes, setSizes] = useState<Record<ColumnKey, number>>({ ...DEFAULT_WIDTH });
  const [contactMode, setContactMode] = useState(initialContactMode === "on");
  const [contactedMap, setContactedMap] = useState<Record<string, number>>(
    () => contactsToMap(initialContacts),
  );
  const [contactError, setContactError] = useState<string | null>(null);

  function showApiError(e: unknown, fallback: string) {
    setContactError(e instanceof ApiError ? `${fallback}: ${e.message}` : fallback);
  }

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
  }, [hideStorageKey, orderKey, sizesKey]);

  // Одноразовая миграция localStorage → БД. После успеха ставим флаг и чистим старое.
  useEffect(() => {
    if (window.localStorage.getItem(MIGRATED_FLAG) === "1") return;
    const oldContacts = window.localStorage.getItem(LEGACY_CONTACTED);
    const oldMode = window.localStorage.getItem(LEGACY_CONTACT_MODE);
    if (!oldContacts && !oldMode) {
      window.localStorage.setItem(MIGRATED_FLAG, "1");
      return;
    }
    (async () => {
      try {
        if (oldContacts) {
          const parsed = JSON.parse(oldContacts) as Record<string, unknown>;
          const keys = Object.keys(parsed).filter((k) => typeof parsed[k] === "number");
          await Promise.all(keys.map((k) =>
            apiSend("/contacts", "POST", { target_key: k }),
          ));
        }
        if (oldMode === "on" || oldMode === "off") {
          await apiSend("/settings/contact-mode", "PUT", { value: oldMode });
        }
        window.localStorage.removeItem(LEGACY_CONTACTED);
        window.localStorage.removeItem(LEGACY_CONTACT_MODE);
        window.localStorage.setItem(MIGRATED_FLAG, "1");
        const fresh = await (await fetch(
          (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/contacts",
          { cache: "no-store" },
        )).json() as ContactMark[];
        setContactedMap(contactsToMap(fresh));
        if (oldMode === "on" || oldMode === "off") setContactMode(oldMode === "on");
      } catch (e) {
        // Миграция повторится в следующей сессии. Тосты тут не показываем,
        // чтобы не пугать пользователя при offline-старте.
        console.warn("contact migration failed", e);
      }
    })();
  }, []);

  // Refetch contacts при возврате во вкладку (multi-tab / multi-browser sync).
  useEffect(() => {
    const onFocus = async () => {
      try {
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/contacts",
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as ContactMark[];
        setContactedMap(contactsToMap(data));
      } catch { /* ignore — user will see it next focus */ }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function toggleContactMode() {
    const prev = contactMode;
    const next = !prev;
    setContactMode(next);
    try {
      await apiSend("/settings/contact-mode", "PUT", { value: next ? "on" : "off" });
    } catch (e) {
      setContactMode(prev);
      showApiError(e, "Не удалось сохранить режим контактов");
    }
  }

  async function onContact(targetKey: string) {
    if (!contactMode) return;
    const prev = contactedMap;
    setContactedMap({ ...prev, [targetKey]: Date.now() });
    try {
      await apiSend("/contacts", "POST", { target_key: targetKey });
    } catch (e) {
      setContactedMap(prev);
      showApiError(e, "Не удалось сохранить отметку контакта");
    }
  }

  async function resetContacts() {
    if (!window.confirm("Сбросить все отметки контактов?")) return;
    const prev = contactedMap;
    setContactedMap({});
    try {
      await apiSend("/contacts", "DELETE");
    } catch (e) {
      setContactedMap(prev);
      showApiError(e, "Не удалось сбросить отметки");
    }
  }

  async function clearRowContacts(row: OverviewRow, rowListings: Listing[]) {
    const keys = contactKeysForOverviewRow(row, rowListings);
    if (keys.size === 0) return;
    const prev = contactedMap;
    const next: Record<string, number> = { ...prev };
    let changed = false;
    for (const key of keys) {
      if (key in next) { delete next[key]; changed = true; }
    }
    if (!changed) return;
    setContactedMap(next);
    try {
      await Promise.all([...keys]
        .filter((k) => k in prev)
        .map((k) => apiSend(`/contacts/${encodeURIComponent(k)}`, "DELETE")),
      );
    } catch (e) {
      setContactedMap(prev);
      showApiError(e, "Не удалось снять отметку строки");
    }
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
      <ContactError message={contactError} onDismiss={() => setContactError(null)} />
    </main>
  );
}
