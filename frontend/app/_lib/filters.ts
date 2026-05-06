import { OverviewFilters, SortKey } from "./types";

const SORT_KEYS = new Set<SortKey>([
  "needed-priority",
  "smart_part_id",
  "need_qty_desc",
  "created_desc",
]);

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && SORT_KEYS.has(value as SortKey);
}

export function pickFilters(
  s: Partial<Record<keyof OverviewFilters, string>>,
  defaults?: Partial<OverviewFilters>,
): OverviewFilters {
  const out: OverviewFilters = { ...(defaults ?? {}) };
  for (const k of ["is_need", "is_active", "has_active_ebay", "has_ended_ebay"] as const) {
    if (s[k] === "true" || s[k] === "false") out[k] = s[k];
  }
  if (s.q && s.q.trim()) out.q = s.q.trim();
  if (s.min_need_qty && /^\d+$/.test(s.min_need_qty)) out.min_need_qty = s.min_need_qty;
  if (isSortKey(s.sort)) out.sort = s.sort;
  return out;
}

export function buildQs(filters: OverviewFilters, fallbackSort: SortKey): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "" && v !== null) q.set(k, String(v));
  }
  if (!q.has("sort")) q.set("sort", fallbackSort);
  return q.toString();
}
