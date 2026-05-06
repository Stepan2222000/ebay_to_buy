# backend/

Тонкий FastAPI + Typer CLI поверх БД `ebay_to_buy@5406` (этап 1, `../db/`).

Спецификация — `../purchase-logic.yaml`, план — `../IMPLEMENTATION-PLAN.md` (Этап 2).

## Запуск

```sh
cp .env.example .env       # отредактировать DATABASE_URL при необходимости
uv sync                    # install + venv
uv run ebay-to-buy serve   # uvicorn на $HTTP_HOST:$HTTP_PORT
```

## CLI команды

```
ebay-to-buy serve
ebay-to-buy upsert-target SMART_PART_ID TARGET_QTY [--inactive]
ebay-to-buy edit-target SMART_PART_ID [--target-qty N] [--inactive | --active]
ebay-to-buy attach-listing SMART_PART_ID EBAY_NUMBER [--comment "..."]
ebay-to-buy mark-ended LISTING_ID
ebay-to-buy import-xlsx PATH
ebay-to-buy export-xlsx --output PATH [--is-need ...] [--explode-articles ...]
ebay-to-buy search-smart "QUERY" [--limit 20]
```

## HTTP-эндпоинты

| | |
|---|---|
| `GET /overview?is_need&is_active&has_active_ebay` | таблица `purchase_overview` |
| `GET /smart/search?q&limit` | поиск по `[[smart search]]` |
| `POST /targets` | upsert цели |
| `PATCH /targets/{smart_part_id}` | partial update |
| `POST /listings` | создать eBay-объявление |
| `PATCH /listings/{id}` | partial update объявления |
| `POST /listings/{id}/end` | пометить снятым |
| `GET /export.xlsx?...` | Excel-выгрузка |
| `POST /import.xlsx` | импорт целей из xlsx |

## Тестовые xlsx

```sh
uv run python samples/make_samples.py
```
Создаёт `samples/targets_ok.xlsx`, `samples/targets_bad_smart.xlsx`, `samples/targets_bad_qty.xlsx`.

Все ошибки — полный traceback в теле ответа / в stderr (`[[validation and errors]]`).
