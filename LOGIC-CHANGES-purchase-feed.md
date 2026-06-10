# Изменения логики: purchase_feed_components + тумблеры наличия (2026-06-06)

Ещё не отражено в purchase-logic.yaml — зафиксировано здесь.

## Что изменилось

### parts_uchet (uchet_parts/migration_008, migration_009)

`stock_raw` удалён, вместо него `purchase_feed_components`: каждый источник
наличия — отдельной колонкой, без встроенной политики «что считать наличием»:

| Колонка | Смысл |
|---|---|
| `smart_part_id`, `smart_name`, `product_type` | идентификация + категория (smart.parts, FDW) |
| `on_hand_new_qty` | new на руках |
| `on_hand_personal_qty` | personal на руках (раньше был зашит в arrived_qty) |
| `in_transit_linked_qty` | заведённые едущие с привязкой к eBay-заказу |
| `in_transit_unlinked_qty` | заведённые едущие БЕЗ привязки — зона риска двойного счёта с ebay_pending, контроль глазами |
| `ebay_ordered_pending_qty` | article match: заказано на eBay, не доставлено, не заведено |
| `kit_breakdown_qty` | потенциал разбора наборов (new) |
| `virtual_kit_qty` | потенциал виртуальной сборки (new) |
| `defect_qty` | дефект |

Отличие от stock_raw: smart'ы, где все items проданы (sold), больше не отдаются
нулевыми строками. Спека: uchet_parts/specs/purchase_feed_components.md.

### ebay_to_buy

- FDW: foreign table `parts_uchet.purchase_feed_components` (stock_raw удалён);
  в `smart.parts` добавлен `product_type`.
- `purchase_overview`: + колонка `product_type`; `stock_total_qty` = сумма ВСЕХ
  компонентов (дефолтная политика «всё считается наличием», теперь включая defect —
  на текущих данных defect_qty=0, сигнал не изменился: 373 need-позиции до и после).
- Новая SQL-функция `purchase_feed(p_product_types text[], p_include_personal,
  p_include_in_transit, p_include_ebay_pending, p_include_kit_breakdown,
  p_include_virtual_kit, p_include_defect, p_only_need)` — параметризуемый фид
  «что закупать»: наличие = on_hand_new + включённые тумблерами компоненты
  (все DEFAULT true), need = max(target − stock, 0), сортировка по need DESC.
  `on_hand_new` считается наличием всегда. Для программы-закупщика: SQL/FDW
  `SELECT * FROM purchase_feed(...)` или HTTP `GET /feed`.
- HTTP API: `GET /feed` (те же тумблеры query-параметрами), `GET /product-types`
  (категории среди целей, для UI), `product_type` (multi) в `/overview`
  и `/export.xlsx`.
- Фронт: колонка «категория», дропдаун-фильтр по категории (single-select,
  бэкенд поддерживает multi).

## Известные допущения

- `kit_breakdown_qty` и `virtual_kit_qty` перекрываются (одна деталь может
  посчитаться в обоих) — принято осознанно, точное распределение = оверинжиниринг.
- Привязка in-transit item к заказу необязательна (ручной приём не из eBay);
  двойной счёт unlinked-items контролируется глазами через колонку
  `in_transit_unlinked_qty`.

---

## 2026-06-10 — сезонный фильтр вместо категорий (vehicle classes, smart миграции 014-015)

Категорий `product_type` в закупке больше нет — в smart эталоном стали классы
техники (`parts.vehicle_classes`, слаги: boat/jetski/quad/snowmobile/motorcycle/auto)
с сезонами по месяцам (`smart.vehicle_classes.season_months`).

- FDW: `smart.parts` → колонка `vehicle_classes text[]` (вместо `product_type`);
  новая FT `smart.vehicle_classes` (slug, title_ru, season_months, position).
- `purchase_overview`: колонка `vehicle_classes` вместо `product_type`.
- `purchase_feed(p_months int[] DEFAULT NULL, ...)` — сезонный фильтр: деталь
  проходит, если хотя бы один её класс имеет пересечение season_months с p_months;
  NULL = все. Выдача: `vehicle_classes` вместо `product_type`.
- Глобальный сезонный режим: `app_settings` ключи `season-filter` (on|off,
  дефолт off) и `season-months-ahead` (N, дефолт 1); SQL-функция
  `effective_season_months()` → NULL (выключен) или [текущий месяц .. +N]
  с переходом через декабрь. Одна логика для UI-бэкенда и parser_ebay.
- HTTP: `GET/PUT /settings/season` (enabled, months_ahead, effective_months);
  `/feed`, `/overview`, `/export.xlsx` применяют глобальную настройку сами,
  параметр `product_type` удалён; `GET /product-types` удалён.
- Фронт: дропдаун «сезон» (все сезоны / сезонный режим + месяцев вперёд,
  пишет глобальную настройку), колонка «классы» чипами.
- parser_ebay: `--product-types` → `--ignore-season`; seed зовёт
  `purchase_feed(p_months := effective_season_months(), ...)`, фактическое
  окно месяцев фиксируется в `runs.params.months`.
