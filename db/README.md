# db/

Схема БД `ebay_to_buy@2.26.53.128:5406`. Спецификация — `../purchase-logic.yaml`, план — `../IMPLEMENTATION-PLAN.md` (Этап 1).

## Запуск

```sh
PGPASSWORD=Password123 psql -h 2.26.53.128 -p 5406 -U admin -d ebay_to_buy -f db/main.sql
```

Скрипт идемпотентен: повторный прогон не падает и не теряет данные в `purchase_targets` / `ebay_listings`.

## Что внутри

- `postgres_fdw` к `smart@5402` (foreign table `smart.parts`) и `parts_uchet@5403` (foreign table `parts_uchet.stock_raw`).
- Таблицы `purchase_targets`, `ebay_listings` со всеми CHECK/UNIQUE/PK по YAML.
- Триггеры валидации `smart_part_id` (через `EXISTS smart.parts`) и авто-`updated_at`.
- Вьюха `purchase_overview` — агрегат целей, наличия и eBay-объявлений по `[[purchase_overview]]` + `[[need formula]]`.
