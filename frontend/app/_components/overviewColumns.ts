import { OverviewRow } from "../_lib/types";

// Человеческие подписи колонок (для шапки таблицы и popover-списка).
export const COL_LABELS: Record<keyof OverviewRow, string> = {
  smart_part_id:            "smart-артикул",
  smart_name:               "название",
  articles_text:            "артикулы",
  target_qty:               "цель",
  stock_total_qty:          "наличие",
  need_qty:                 "не хватает",
  is_need:                  "нехватка",
  is_active:                "активная цель",
  active_ebay_count:        "активных eBay",
  active_ebay_item_numbers: "номера активных",
  active_ebay_comments:     "комментарии активных",
  ended_ebay_count:         "снятых eBay",
  ended_ebay_item_numbers:  "номера снятых",
  ended_ebay_comments:      "комментарии снятых",
  created_at:               "создано",
  updated_at:               "обновлено",
};

export type ColumnKey = keyof OverviewRow;

// Выравнивание чисел справа.
export const NUMERIC: Set<ColumnKey> = new Set([
  "target_qty",
  "stock_total_qty",
  "need_qty",
  "active_ebay_count",
  "ended_ebay_count",
]);
