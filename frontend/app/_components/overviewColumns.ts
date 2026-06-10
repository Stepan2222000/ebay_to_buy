// Все колонки overview в одном месте (порядок по умолчанию + подписи + flags).
//
// Объединённая «eBay» колонка заменяет 6 raw-полей backend:
//   active_ebay_count / active_ebay_item_numbers / active_ebay_comments
//   ended_ebay_count  / ended_ebay_item_numbers  / ended_ebay_comments
// Inline-edit и создание объявлений живут внутри неё.

export type ColumnKey =
  | "smart_part_id"
  | "smart_name"
  | "vehicle_classes"
  | "articles_text"
  | "ebay"
  | "target_qty"
  | "stock_total_qty"
  | "need_qty"
  | "is_need"
  | "is_active"
  | "created_at"
  | "updated_at";

export const ALL_COLUMNS: readonly ColumnKey[] = [
  "smart_part_id",
  "smart_name",
  "vehicle_classes",
  "articles_text",
  "ebay",
  "target_qty",
  "stock_total_qty",
  "need_qty",
  "is_need",
  "is_active",
  "created_at",
  "updated_at",
];

export const COL_LABELS: Record<ColumnKey, string> = {
  smart_part_id:   "smart-артикул",
  smart_name:      "название",
  vehicle_classes: "классы",
  articles_text:   "артикулы",
  ebay:            "eBay-объявления",
  target_qty:      "цель",
  stock_total_qty: "наличие",
  need_qty:        "не хватает",
  is_need:         "нехватка",
  is_active:       "активная цель",
  created_at:      "создано",
  updated_at:      "обновлено",
};

export const NUMERIC: Set<ColumnKey> = new Set([
  "target_qty",
  "stock_total_qty",
  "need_qty",
]);

export const DEFAULT_WIDTH: Record<ColumnKey, number> = {
  smart_part_id:   150,
  smart_name:      260,
  vehicle_classes: 170,
  articles_text:   300,
  ebay:            480,
  target_qty:      80,
  stock_total_qty: 90,
  need_qty:        100,
  is_need:         110,
  is_active:       120,
  created_at:      150,
  updated_at:      150,
};
