# IMPLEMENTATION-PLAN

План реализации `ebay_to_buy`. Документ описывает **порядок сборки**; нормативная спецификация — `purchase-logic.yaml`. План не дублирует её, а ссылается на конкретные `definitions` и `steps`.

## Соглашения

- `[[id]]` — definition из `purchase-logic.yaml` (секция `definitions:`).
- `[[id#anchor]]` — анкер `<!-- ^anchor -->` внутри definition.
- `step:<id>` — шаг из секции `steps:` `purchase-logic.yaml`.
- Когда YAML что-то фиксирует (поле, лимит, правило), план **не переписывает** это; он указывает «по `[[id]]`» или «по `step:<id>`».
- Стэк (FastAPI, Next.js, typer, openpyxl, asyncpg) фиксируется в плане, потому что выбран явно. Минорные версии — на момент реализации.
- Внешние документы (postgres_fdw, openpyxl, asyncpg, FastAPI, Next.js App Router) — ссылка из текста, не цитируется.
- При конфликте плана с `purchase-logic.yaml` — приоритет у YAML.

## Принципы плана

- Build-order, не runtime-flow. Этапы выстроены по техническим зависимостям сборки (БД → backend → фронт), а не по дуге `step:read-purchase-overview → step:save-purchase-target`.
- Каждый `step:` и каждый `definition:` из YAML охвачен каким-то этапом; в конце — чек-лист покрытия.
- В каждом этапе есть «Что НЕ делаем» — граница со смежными этапами и явные anti-scope из YAML.
- Definition of done описан как **проверка в терминале** (см. `CLAUDE.md`).
- Валидация — на стороне БД везде, где это возможно (`[[validation and errors]]`). Backend и фронт её не дублируют, а пробрасывают.
- Любая ошибка наружу с traceback по `[[validation and errors]]` и `step:stop-with-error`. Никаких молчаливых fallback.

## Pre-stage ритуал (обязателен перед стартом каждого этапа)

1. **Обсуждение этапа** — зафиксировать с пользователем итоговый scope этапа и границы.
2. **Терминальная разведка** — на живой инфраструктуре (5402/5403/5406) проверить предположения этапа: схемы, поля, расширения, формат данных. Если разведка опровергает план — править план **до** реализации.
3. **Exa-ресёрч** — догнать актуальную документацию по подсистемам этапа (postgres_fdw, openpyxl, FastAPI, Next.js App Router и т.д.). Если новая версия меняет API — отразить в этапе.
4. Только после этого — реализация.

---

## Этап 1 — БД-слой: FDW, схема, валидация, `purchase_overview`

Закрывает фундамент: всё, без чего этапы 2 и 3 не имеют смысла. Все правила YAML, которые могут быть выражены на уровне БД, выражаем на уровне БД — это требование `[[validation and errors]]` и условие пользователя п.8.

- **Реализует steps:**
  - `step:validate-purchase-target` — целиком, как trigger + CHECK по `[[purchase_targets#rules]]` и `[[validation and errors]]`.
  - `step:save-purchase-target` — целиком, как `INSERT ... ON CONFLICT DO UPDATE` по `[[purchase_targets]]`; уважает `![[purchase_targets#rules]]` (ребро `step:save-purchase-target → step:refresh-overview`).
  - `step:validate-ebay-listing` — целиком, как trigger + CHECK + UNIQUE по `[[ebay_listings#rules]]` и `[[validation and errors]]`.
  - `step:save-ebay-listing` — целиком, как DML по `[[ebay_listings]]`; уважает `![[ebay_listings#rules]]`.
  - `step:mark-ebay-listing-ended` — как `UPDATE ebay_listings SET is_ended=true ...` (строка остаётся в таблице — прямое требование тела `step:mark-ebay-listing-ended`).
  - `step:refresh-overview` — как `CREATE VIEW purchase_overview` с актуальной формулой `![[need formula]]` (вьюха пересчитывает «на лету», поэтому `refresh-overview` для read-side тривиален — это просто новый `SELECT`).
  - `step:program-upsert-target` — целиком, без обёртки. По телу шага «программа пишет цель напрямую в `[[purchase_targets]]`» и по решению пользователя п.9 — никакого Python-API.
  - `step:stop-with-error` — БД-плечо: `RAISE EXCEPTION` с осмысленным сообщением по `[[validation and errors]]`.
- **Опирается на definitions:**
  - `[[БД ebay_to_buy]]` — параметры подключения и назначение базы.
  - `[[smart catalog]]` — источник `parts.id`/`parts.name`/`parts.articles` через FDW; правило валидации «любая запись должна ссылаться на существующий `smart_part_id`» — реализуется триггером.
  - `[[stock_raw]]` — источник `total_qty` через FDW; используем **только** `total_qty` и `smart_name` (явное правило `[[stock_raw]]`: «`arrived_qty` и `in_transit_qty` отдельно не учитываются»; «если строки нет — наличие `0`»).
  - `[[purchase_targets]]` — все поля из `[[purchase_targets#fields]]` и все правила из `[[purchase_targets#rules]]`.
  - `[[ebay_listings]]` — все поля из `[[ebay_listings#fields]]` и все правила из `[[ebay_listings#rules]]`.
  - `[[need formula]]` — внутрь `purchase_overview`.
  - `[[purchase_overview]]` — колонки из `[[purchase_overview#columns]]`, правила из `[[purchase_overview#rules]]`.
  - `[[validation and errors]]` — формулировки `RAISE EXCEPTION`.
  - `[[audit]]` — минимальный уровень: `created_at`, `updated_at` (по тексту `[[audit]]` это и есть «минимально допустимо»; история изменений — опционально, в этап не входит).
- **Зависит от этапов:** —.
- **Pre-stage разведка (терминал):**
  - `psql -h 194.164.245.107 -p 5402 ... -d smart -c "\d parts"` — подтвердить набор колонок, упомянутых в `[[smart catalog]]` (`id`, `name`, `articles`).
  - `psql -h 194.164.245.107 -p 5403 ... -d parts_uchet -c "\d stock_raw"` — подтвердить наличие `smart_part_id`, `smart_name`, `total_qty`, упомянутых в `[[stock_raw]]`.
  - `psql -h 194.164.245.107 -p 5406 ... -d ebay_to_buy -c "SELECT version(); \dx"` — версия PG и список расширений; нужен `postgres_fdw`. Параметры подключения сверяем с `[[БД ebay_to_buy]]`.
- **Что делаем:**
  - В `ebay_to_buy@5406` — `CREATE EXTENSION postgres_fdw`. Этим закрываем «Подготовка БД и FDW — предпосылка работы, не runtime-flow» из `[[БД ebay_to_buy]]`.
  - Два **прямых** foreign server (без цепочки через 5403):
    - `CREATE SERVER smart_server` — host/port/dbname по `[[smart catalog]]`;
    - `CREATE SERVER parts_uchet_server` — host/port/dbname для `[[stock_raw]]`.
  - `CREATE USER MAPPING FOR admin SERVER ... OPTIONS (user '...', password '...')` — пароль не хардкодится в `main.sql`, передаётся через `psql -v` или `.env`.
  - `IMPORT FOREIGN SCHEMA public LIMIT TO (parts) FROM SERVER smart_server INTO smart` — локальная схема `smart`. Только `parts`, потому что `[[smart catalog]]` использует ровно её.
  - `IMPORT FOREIGN SCHEMA public LIMIT TO (stock_raw) FROM SERVER parts_uchet_server INTO parts_uchet` — локальная схема `parts_uchet`. Только `stock_raw`, потому что `[[stock_raw]]` единственная нужная вьюха.
  - `CREATE TABLE purchase_targets` строго по `![[purchase_targets#fields]]`:
    - `PRIMARY KEY (smart_part_id)` — закрывает «Дублей по `smart_part_id` быть не может» из `[[purchase_targets#rules]]`.
    - `CHECK (target_qty >= 1)` — по `[[purchase_targets#fields]]` («`integer`, минимум `1`») и по `[[purchase_targets#rules]]` («`target_qty=0` не используется»).
    - `is_active BOOLEAN NOT NULL DEFAULT true` — по `[[purchase_targets#fields]]`.
    - `created_at`/`updated_at` `DEFAULT now()` — `[[audit]]`.
    - Никакой колонки «комментарий» — `[[purchase_targets#rules]]` явно: «У цели нет комментария».
  - `CREATE TABLE ebay_listings` строго по `![[ebay_listings#fields]]`:
    - `id` — внутренний автоинкрементный (тип на момент реализации).
    - `ebay_item_number TEXT NOT NULL`, `UNIQUE (ebay_item_number)` — по `[[ebay_listings#rules]]` («Один `ebay_item_number` нельзя сохранить дважды»).
    - `CHECK (length(btrim(ebay_item_number)) > 0)` — по `[[validation and errors]]` («`ebay_item_number` не пустой»).
    - `is_ended BOOLEAN NOT NULL DEFAULT false`.
    - Несколько объявлений на один `smart_part_id` разрешены — это `[[ebay_listings#rules]]`.
    - Не делаем никакого превращения номера в URL — `[[ebay_listings#rules]]`: «Номер eBay не превращается в ссылку на уровне БД».
  - Триггеры `BEFORE INSERT OR UPDATE OF smart_part_id` на обеих таблицах:
    - проверяют существование в `smart.parts` — закрывают `[[smart catalog]]` (правило «запись останавливается ошибкой») и `[[purchase_targets#rules]]` («Перед записью SQL проверяет, что `smart_part_id` существует»);
    - формируют сообщения по `[[validation and errors]]` — это `step:stop-with-error` на уровне БД.
  - Триггер `BEFORE UPDATE` для авто-`updated_at` — `[[audit]]`.
  - `CREATE VIEW purchase_overview` — колонки строго из `![[purchase_overview#columns]]`:
    - LEFT JOIN на `parts_uchet.stock_raw` по `smart_part_id`, `coalesce(stock_raw.total_qty, 0) AS stock_total_qty` — реализует `[[need formula]]`.
    - `need_qty = greatest(target_qty - stock_total_qty, 0)` и `is_need = target_qty > stock_total_qty` — `[[need formula]]`.
    - `articles_text` — `array_to_string(parts.articles, ', ')`.
    - `active_*` агрегаты: `count(*) FILTER (WHERE NOT is_ended)`, `string_agg(ebay_item_number, ', ') FILTER (WHERE NOT is_ended)`, аналогично для комментариев.
    - `ended_*` — то же самое для `is_ended`.
    - Содержит **все** цели из `[[purchase_targets]]` — `[[purchase_overview#rules]]`: «Вьюха содержит все цели».
- **Что НЕ делаем:**
  - НЕ пишем Python/CLI/HTTP/UI — это этапы 2 и 3.
  - НЕ реализуем `[[smart search]]` — это этап 2.
  - НЕ делаем `[[Excel import]]`/`[[Excel export]]` — это этап 2.
  - НЕ делаем history-таблицу — она опциональна по `[[audit]]` и в этап не входит.
  - НЕ читаем `arrived_qty`/`in_transit_qty` отдельно — `[[stock_raw]]` явно это запрещает.
  - НЕ удаляем закрытые объявления — `[[ebay_listings#rules]]`: «Снятое объявление остаётся как история».
  - НЕ делаем `target_qty=0` веткой — `[[purchase_targets#rules]]` явно это запрещает (для паузы — `is_active=false`).
  - НЕ учитываем `is_active` в `is_need` — `[[need formula]]` и `purpose:` явно: «`is_need` считается только по количеству, без учёта `is_active`».
  - НЕ делаем materialized view — `[[need formula]]` подразумевает мгновенную актуальность.
  - НЕ оборачиваем `step:program-upsert-target` Python-слоем (см. п.9 пользователя; шаг закрывается прямым SQL).
- **Артефакты:**
  - `db/main.sql` — идемпотентный, с `DROP ... CASCADE` блоком в начале;
  - `db/.env.example` — параметры по `[[БД ebay_to_buy]]` + креды для FDW user mappings;
  - короткий README с командой запуска.
- **Definition of done (терминал):**
  - `psql ... -f db/main.sql` отрабатывает дважды подряд без ошибок (идемпотентность).
  - Сценарий `step:program-upsert-target → step:validate-purchase-target → step:stop-with-error`:
    `INSERT INTO purchase_targets (smart_part_id, target_qty) VALUES ('smart_99999999', 5)` — падает с traceback по `[[validation and errors]]`.
  - `INSERT ... target_qty = 0` — падает по `CHECK` (`[[purchase_targets#rules]]`).
  - Двойной `INSERT` одного `ebay_item_number` — падает по `UNIQUE` (`[[ebay_listings#rules]]`).
  - Сценарий `step:save-purchase-target → step:refresh-overview`:
    после валидной вставки `SELECT * FROM purchase_overview WHERE smart_part_id='<...>'` отдаёт строку с правильными `stock_total_qty`/`need_qty`/`is_need` (`[[need formula]]`) и разнесёнными `active_ebay_*`/`ended_ebay_*` колонками (`[[purchase_overview#columns]]`).
  - Сценарий `step:mark-ebay-listing-ended`: `UPDATE ebay_listings SET is_ended=true ...` переводит номер из `active_ebay_*` в `ended_ebay_*` без удаления — соответствует телу `step:mark-ebay-listing-ended`.
  - **Обсуждение и подтверждение:** все DDL и тестовые сценарии прогнаны и показаны до перехода к этапу 2.

---

## Этап 2 — Backend: FastAPI + CLI поверх БД этапа 1

Тонкая прослойка над БД. Валидация остаётся в `[[validation and errors]]` (этап 1) — backend не дублирует, а только пробрасывает SQL-ошибку и форматирует traceback (`step:stop-with-error`). CLI — для импорта/экспорта/поиска. HTTP — для фронта этапа 3.

- **Реализует steps:**
  - `step:read-purchase-overview` — HTTP `GET /overview` (`![[purchase_overview#rules]]`).
  - `step:inspect-needed-items` — query `is_need=true` к `/overview` (`is_active=false` не меняет `is_need` — это явно в теле `step:inspect-needed-items` и в `[[need formula]]`).
  - `step:inspect-all-targets` — query без фильтров; включает позиции без нехватки/неактивные/без eBay/со снятыми eBay (тело `step:inspect-all-targets`).
  - `step:search-smart-for-target` — HTTP `GET /smart/search?q=...` и CLI `search-smart` по `[[smart search]]`.
  - `step:choose-smart-result` — HTTP отдаёт результаты, CLI делает interactive prompt; «автоматического выбора по артикулу нет» — тело `step:choose-smart-result` и `[[smart search]]`.
  - `step:edit-purchase-target` — HTTP `PATCH /targets/{smart_part_id}` и CLI `edit-target`; перед записью обращается к `step:validate-purchase-target` (= тригген БД из этапа 1).
  - `step:attach-or-update-ebay-listing` — HTTP `POST /listings`/`PATCH /listings/{id}` и CLI `attach-listing` (`![[ebay_listings#fields]]`); перед записью — `step:validate-ebay-listing`.
  - `step:mark-ebay-listing-ended` — HTTP `POST /listings/{id}/end` и CLI `mark-ended`. Удаления не делаем (тело `step:mark-ebay-listing-ended`).
  - `step:import-targets-from-excel` — HTTP `POST /import.xlsx` и CLI `import-xlsx` по `[[Excel import]]`. Для каждой строки файла — `step:validate-purchase-target`; на ошибке — `step:stop-with-error`.
  - `step:export-overview-to-excel` — HTTP `GET /export.xlsx?...` и CLI `export-xlsx` по `[[Excel export]]`.
  - `step:stop-with-error` — Python-плечо: traceback в stderr / 422 или 500 с полным телом ошибки. Никаких молчаливых fallback (`[[validation and errors]]`).
  - `step:refresh-overview` — на стороне backend сводится к новому `SELECT` из `purchase_overview` после успешной мутации (вьюха актуальна; `[[need formula]]`).

  `step:program-upsert-target` остаётся в этапе 1 (прямой SQL по решению пользователя п.9 — backend этого не оборачивает).
  `step:validate-purchase-target`, `step:save-purchase-target`, `step:validate-ebay-listing`, `step:save-ebay-listing` — реализованы в БД этапа 1; backend только триггерит DML.
- **Опирается на definitions:**
  - `[[purchase_overview]]` — формат ответа `GET /overview`; колонки строго из `[[purchase_overview#columns]]`; в фильтре уважаем `[[purchase_overview#rules]]` («потребители фильтруют `is_need=true` и при необходимости `is_active=true`»).
  - `[[smart search]]` — алгоритм `GET /smart/search`: вход и пять приоритетов релевантности — точно по тексту `[[smart search]]`.
  - `[[Excel import]]` — формат файла из `![[Excel import#columns]]`, поведение из `![[Excel import#rules]]`.
  - `[[Excel export]]` — фильтры из `![[Excel export#filters]]`, формат колонок из `![[Excel export#fields]]`.
  - `[[validation and errors]]` — формат traceback и политика «не скрывать».
- **Зависит от этапов:** 1.
- **Pre-stage разведка (терминал и exa):**
  - Прогнать smart-поиск как чистый SQL (5 веток UNION ALL по бакетам из `[[smart search]]`) на живой 5406+FDW; убедиться, что push-down работает (`EXPLAIN VERBOSE`) — это критично для `step:search-smart-for-target` на больших каталогах.
  - exa: проверить актуальные релизы `fastapi`, `asyncpg`, `typer`, `openpyxl` (на момент написания плана — `0.115.x`, `0.30.0`, `0.25.1`, `3.1.5` соответственно). При расхождении — обновить pin.
  - Локально создать sample.xlsx с колонками из `![[Excel import#columns]]` и проверить, что `openpyxl.load_workbook` его читает; write-only пишет файл, открываемый в LibreOffice.
- **Что делаем:**
  - **Стэк:** Python 3.12+, `fastapi`, `uvicorn`, `asyncpg`, `typer`, `openpyxl` (lxml), `python-dotenv`, `pydantic` (поверх FastAPI). Pandas — не подключаем.
  - **Подключение к БД:** одна `asyncpg.create_pool(...)` на старте FastAPI (через lifespan); CLI — собственный pool на запуск. Backend ходит **только** в `ebay_to_buy@5406` (параметры из `[[БД ebay_to_buy]]`); 5402 и 5403 — только через FDW из этапа 1.
  - **HTTP API (минимум для фронта):**
    - `GET /overview` — реализует `step:read-purchase-overview`. Query-параметры — комбинации фильтров из `![[Excel export#filters]]` (`is_need`, `is_active`, `has_active_ebay`). Колонки в JSON — ровно `[[purchase_overview#columns]]`.
      - `?is_need=true` — `step:inspect-needed-items`.
      - без фильтров — `step:inspect-all-targets`.
    - `GET /smart/search?q=...&limit=...` — реализует `step:search-smart-for-target`. Алгоритм — пять UNION ALL веток с `bucket_rank` по приоритетам `[[smart search]]`:
      1. точный `smart_part_id`,
      2. точный артикул,
      3. артикул starts-with,
      4. артикул contains,
      5. название contains.
      Возврат — поля из `[[smart search]]` («`smart_part_id`, название, артикулы через запятую, текущее `stock_total_qty`, существующая цель если есть»).
    - `POST /targets` (upsert), `PATCH /targets/{smart_part_id}` — реализуют `step:edit-purchase-target`; кладут в `[[purchase_targets]]` через DML, валидация — триггерами этапа 1.
    - `POST /listings`, `PATCH /listings/{id}` — реализуют `step:attach-or-update-ebay-listing`.
    - `POST /listings/{id}/end` — реализует `step:mark-ebay-listing-ended` (`UPDATE ... SET is_ended=true`; запись остаётся).
    - `GET /export.xlsx?...` — реализует `step:export-overview-to-excel`. Стрим `openpyxl` write-only с фильтрами по `![[Excel export#filters]]` и раскладкой колонок по `![[Excel export#fields]]`.
    - `POST /import.xlsx` — реализует `step:import-targets-from-excel`. Multipart, синхронно, по `![[Excel import#columns]]` и `![[Excel import#rules]]`.
  - Все HTTP-обработчики ловят `asyncpg.PostgresError` и возвращают 422/500 с **полным текстом** ошибки + traceback в логе. Это `step:stop-with-error` на HTTP-уровне; никаких user-friendly подмен — `[[validation and errors]]`.
  - **CLI (`typer`):** `import-xlsx`, `export-xlsx`, `search-smart`, `attach-listing`, `mark-ended`, `edit-target`, `choose-smart-result` (interactive prompt после `step:search-smart-for-target`).
  - **Excel-импорт** (`step:import-targets-from-excel`):
    - входные колонки строго по `![[Excel import#columns]]`;
    - построчный `INSERT ... ON CONFLICT (smart_part_id) DO UPDATE` — реализует «upsert» из `![[Excel import#rules]]`;
    - отсутствие строки в файле не удаляет/деактивирует существующую цель — `![[Excel import#rules]]`;
    - eBay через этот импорт не грузим — `![[Excel import#rules]]`;
    - первая невалидная строка — `ROLLBACK` + traceback с номером строки (`![[Excel import#rules]]`: «При ошибке валидации импорт останавливается с полным traceback» + `step:stop-with-error`).
  - **Excel-экспорт** (`step:export-overview-to-excel`):
    - `openpyxl` в `write_only=True`;
    - фильтры — все комбинации из `![[Excel export#filters]]`;
    - выбор полей — `![[Excel export#fields]]`; артикулы и eBay-объявления раскладываются в отдельные колонки `article_1, article_2, ...`, `active_ebay_item_number_1`, `active_ebay_comment_1`, ..., `ended_ebay_item_number_1`, `ended_ebay_comment_1`, ... (явно перечислено в `![[Excel export#fields]]`);
    - количество N-х колонок = max по выборке. Цель раскладки — «человек может выделить ячейки и скопировать их целиком» (тело `[[Excel export]]`).
- **Что НЕ делаем:**
  - НЕ дублируем валидацию из `[[purchase_targets#rules]]`/`[[ebay_listings#rules]]`/`[[validation and errors]]` в pydantic. Источник правды — БД (этап 1). Pydantic — только парсинг payload и сериализация ответа.
  - НЕ строим UI — это этап 3.
  - НЕ делаем фоновые задачи / cron / webhook'и — YAML их не описывает.
  - НЕ оборачиваем `step:program-upsert-target` — пользователь явно выбрал прямой SQL.
  - НЕ ставим pandas. Если внутри этапа окажется, что нужен — обсуждаем отдельно.
  - НЕ делаем аутентификацию — внутреннее API в локальной сети. Если потребуется — в пост-этапы.
  - НЕ загружаем eBay через Excel-импорт — прямой запрет в `![[Excel import#rules]]`.
  - НЕ предлагаем «автоматический выбор по артикулу» в `step:search-smart-for-target` — это запрет в `[[smart search]]` и в теле `step:choose-smart-result`.
- **Артефакты:**
  - `backend/<package>/` (`main.py` для FastAPI, `cli.py` для typer, `db.py`, `excel.py`, `search.py`);
  - `pyproject.toml` (минимальные `>=`-границы для FastAPI/asyncpg/typer/openpyxl);
  - `samples/` с эталонными xlsx (валидный + невалидный для негативного теста).
- **Definition of done (терминал):**
  - `uvicorn ...` стартует, `curl http://localhost:8000/overview?is_need=true` отдаёт JSON, эквивалентный `SELECT ... FROM purchase_overview WHERE is_need` — это `step:read-purchase-overview` + `step:inspect-needed-items`.
  - `curl '/smart/search?q=174'` отдаёт результаты в порядке бакетов из `[[smart search]]` — `step:search-smart-for-target`.
  - `python -m <pkg> import-xlsx samples/targets_ok.xlsx` — все строки в БД (`step:import-targets-from-excel` happy path); `samples/targets_bad_smart.xlsx` — 0 изменений + traceback (`step:stop-with-error`).
  - `python -m <pkg> export-xlsx --filter is_need=true --output /tmp/out.xlsx` — файл открывается в LibreOffice, артикулы и eBay разнесены по столбцам строго по `![[Excel export#fields]]`.
  - `curl -X POST /listings/{id}/end` — `is_ended=true` в БД, в overview номер ушёл из `active_*` в `ended_*` (`step:mark-ebay-listing-ended`).
  - Невалидный POST (`target_qty=0`, несуществующий smart, дубль `ebay_item_number`) — 4xx/5xx с traceback по `[[validation and errors]]`.
  - **Обсуждение и подтверждение:** все API/CLI команды показаны и приняты до перехода к этапу 3.

---

## Этап 3 — Frontend: Next.js 15 (App Router)

UI поверх HTTP API этапа 2. Бизнес-логики не содержит — только отображение и формы. Это «веб-интерфейс», упомянутый в `purpose:` и `[[purchase_overview]]`.

- **Реализует steps:**
  - `step:read-purchase-overview` — главная страница overview (Server Component читает `GET /overview`); следует `![[purchase_overview#rules]]`.
  - `step:inspect-needed-items` — пресет-страница / фильтр `is_need=true`. Тело `step:inspect-needed-items`: «`is_active=false` не меняет `is_need`, но означает ручную паузу» — отражаем в UI отдельной колонкой `is_active`.
  - `step:inspect-all-targets` — таблица без фильтров, включающая позиции без нехватки/неактивные/без eBay/со снятыми eBay (тело `step:inspect-all-targets`).
  - `step:search-smart-for-target` — UI-автокомплит (input → `GET /smart/search`).
  - `step:choose-smart-result` — пользователь выбирает результат вручную (явно «автоматического выбора нет» — `[[smart search]]`, тело `step:choose-smart-result`).
  - `step:edit-purchase-target` — форма редактирования `target_qty`/`is_active` (тело `step:edit-purchase-target`).
  - `step:attach-or-update-ebay-listing` — форма прикрепить/обновить eBay-объявление (`![[ebay_listings#fields]]`).
  - `step:mark-ebay-listing-ended` — кнопка «снять с публикации»; запись остаётся (тело шага).
  - `step:export-overview-to-excel` — кнопка «Excel-экспорт» с настройкой фильтров (`![[Excel export#filters]]`) и колонок (`![[Excel export#fields]]`); ребро `step:export-overview-to-excel → step:read-purchase-overview` («после выгрузки продолжаем работу») — после скачивания возвращаемся на overview.
  - `step:refresh-overview` — на стороне UI это `router.refresh()` после успешной мутации; ребра `... → step:refresh-overview` уважаем явно.
  - `step:stop-with-error` — UI-плечо: рендер ошибки с **полным телом** ответа backend (`[[validation and errors]]`).
- **Опирается на definitions:**
  - `[[purchase_overview]]` — структура таблицы; колонки из `![[purchase_overview#columns]]`; фильтры из `![[purchase_overview#rules]]`.
  - `[[smart search]]` — поведение автокомплита и порядок результатов.
  - `[[Excel export]]` — UI настроек экспорта (фильтры из `![[Excel export#filters]]`, чекбоксы колонок из `![[Excel export#fields]]`).
  - `[[validation and errors]]` — рендер ошибок: «веб-интерфейс и фоновые операции показывают полный traceback».
- **Зависит от этапов:** 1, 2.
- **Pre-stage разведка (exa и терминал):**
  - exa: подтвердить, что Next.js 15 App Router + Server Components — стабильная цель; перепроверить рекомендуемый паттерн server-side fetch к FastAPI (`fetch` в server component, без `cache: 'force-cache'` для админ-данных — overview обязан быть актуальным по `[[need formula]]`).
  - Снять схему ответов backend этапа 2 в OpenAPI и при необходимости сгенерировать TS-типы (`openapi-typescript`).
  - Убедиться вручную (curl + браузер), что CORS из FastAPI открыт под dev-origin фронта.
- **Что делаем:**
  - **Стэк:** Next.js 15 (App Router, RSC), TypeScript, минимальный CSS, `openapi-typescript` для синхронизации типов с FastAPI.
  - **Маршруты:**
    - `/` (или `/overview`) — таблица из `![[purchase_overview#columns]]`. Server Component делает `fetch('/overview')`. Фильтры через querystring (комбинации из `![[Excel export#filters]]`). Реализует `step:read-purchase-overview` и `step:inspect-all-targets`.
    - `/needed` — пресет `is_need=true` (`step:inspect-needed-items`).
    - `/targets/new` — форма поиска smart (`step:search-smart-for-target`), выбор результата (`step:choose-smart-result`), ввод `target_qty`/`is_active` по `![[purchase_targets#fields]]`, POST на `/targets`.
    - `/targets/[smart_part_id]` — детальная карточка: редактирование цели (`step:edit-purchase-target`), список eBay-объявлений (активные/снятые из колонок `[[purchase_overview#columns]]`), формы прикрепить/обновить (`step:attach-or-update-ebay-listing`), снять (`step:mark-ebay-listing-ended`).
    - Кнопка «Excel-экспорт» в шапке overview — открывает `GET /export.xlsx?...` с текущими фильтрами и доп.чекбоксами по `![[Excel export#fields]]`. Реализует `step:export-overview-to-excel`; ребро возврата на overview уважаем.
  - **Поведение ошибок:** любой не-2xx ответ от backend разворачивается на странице с **полным текстом** (включая traceback), без user-friendly подмены — это прямое требование `[[validation and errors]]` («веб-интерфейс ... показывают полный traceback») и `step:stop-with-error`.
  - **Обновление overview:** перезапрос через `router.refresh()` после успешной мутации — это и есть `step:refresh-overview` со стороны UI.
- **Что НЕ делаем:**
  - НЕ повторяем валидацию `[[purchase_targets#rules]]`/`[[ebay_listings#rules]]` на клиенте. Только базовый required/тип для UX (`required`, `min={1}` для number); реальная валидация — в БД (этап 1) через backend (этап 2).
  - НЕ кэшируем admin-данные дольше одного перехода — `[[need formula]]` требует мгновенной актуальности.
  - НЕ строим SPA из всех страниц — там, где можно, оставляем серверные компоненты.
  - НЕ добавляем аутентификацию/роли — этим этап не занимается.
  - НЕ реализуем UI-импорт Excel в первой версии. CLI этапа 2 покрывает; YAML не требует UI-импорта (`step:import-targets-from-excel` агностичен к интерфейсу). Если попросят — добавим как отдельный этап.
  - НЕ делаем «автоматический выбор по артикулу» в smart-поиске — `[[smart search]]` и тело `step:choose-smart-result` запрещают.
  - НЕ затрагиваем `parts_shop/web/` — это другой проект (магазин для клиентов), не имеет отношения к `[[purchase_overview]]`.
- **Артефакты:**
  - `frontend/` (или другой каталог по соглашению реализатора) с минимальным `package.json`, `app/...` маршрутами, общим API-клиентом, сгенерированными типами.
- **Definition of done (терминал и браузер):**
  - `next dev` запускается, `/` отдаёт таблицу overview, идентичную выдаче `curl /overview` — `step:read-purchase-overview`.
  - Через UI добавление новой цели (`step:search-smart-for-target → step:choose-smart-result → step:edit-purchase-target → step:save-purchase-target → step:refresh-overview`) → строка в БД (`psql`), нехватка пересчиталась по `[[need formula]]`.
  - Попытка добавить цель с несуществующим smart → страница с traceback по `[[validation and errors]]`, БД без изменений (`SELECT count(*) FROM purchase_targets` неизменно).
  - Снятие eBay в UI (`step:mark-ebay-listing-ended`) → `is_ended=true` в БД, в `active_ebay_*` номера нет, в `ended_ebay_*` появился — соответствует `[[purchase_overview#columns]]`.
  - Скачанный Excel-файл из UI идентичен файлу из CLI этапа 2 при тех же фильтрах (`step:export-overview-to-excel`).
  - **Финальная проверка:** оператор открывает UI и проходит сценарии `step:read-purchase-overview → step:inspect-needed-items → step:attach-or-update-ebay-listing → step:mark-ebay-listing-ended → step:refresh-overview` без побочных ошибок.

---

## Чек-лист покрытия `purchase-logic.yaml`

**Definitions:**

| definition | этап(ы) |
|---|---|
| `[[БД ebay_to_buy]]` | 1 (полностью), 2 (DSN) |
| `[[smart catalog]]` | 1 (FDW + триггер-валидация), 2 (источник для `step:search-smart-for-target`) |
| `[[stock_raw]]` | 1 (FDW + использование в `purchase_overview`) |
| `[[purchase_targets]]` (`#fields`, `#rules`) | 1 |
| `[[ebay_listings]]` (`#fields`, `#rules`) | 1 |
| `[[need formula]]` | 1 (внутри view) |
| `[[purchase_overview]]` (`#columns`, `#rules`) | 1 (view), 2 (HTTP), 3 (UI) |
| `[[smart search]]` | 2 (SQL+HTTP+CLI), 3 (UI) |
| `[[Excel import]]` (`#columns`, `#rules`) | 2 |
| `[[Excel export]]` (`#filters`, `#fields`) | 2 (генератор), 3 (UI-кнопка) |
| `[[validation and errors]]` | 1 (БД), 2 (HTTP/CLI), 3 (UI) |
| `[[audit]]` | 1 (минимум: `created_at`/`updated_at`); полная история — пост-этап |

**Steps:**

| step | этап(ы) | как реализован |
|---|---|---|
| `step:read-purchase-overview` | 2, 3 | `GET /overview` + Server Component |
| `step:inspect-needed-items` | 2, 3 | query `is_need=true` |
| `step:inspect-all-targets` | 2, 3 | query без фильтров |
| `step:search-smart-for-target` | 2, 3 | SQL UNION ALL по `[[smart search]]` |
| `step:choose-smart-result` | 2 (CLI), 3 (UI) | пользовательский выбор |
| `step:program-upsert-target` | 1 | прямой SQL по `[[purchase_targets]]` |
| `step:import-targets-from-excel` | 2 | `[[Excel import]]` |
| `step:edit-purchase-target` | 2, 3 | `PATCH /targets/{...}` + форма |
| `step:validate-purchase-target` | 1 | trigger + CHECK по `[[purchase_targets#rules]]` |
| `step:save-purchase-target` | 1 | `INSERT ... ON CONFLICT DO UPDATE` |
| `step:attach-or-update-ebay-listing` | 2, 3 | DML + форма |
| `step:validate-ebay-listing` | 1 | trigger + CHECK + UNIQUE по `[[ebay_listings#rules]]` |
| `step:save-ebay-listing` | 1 | DML по `[[ebay_listings]]` |
| `step:mark-ebay-listing-ended` | 1 (UPDATE), 2, 3 | `is_ended=true`, без удаления |
| `step:refresh-overview` | 1 (view), 3 (`router.refresh`) | пересчёт `[[need formula]]` мгновенно |
| `step:export-overview-to-excel` | 2, 3 | `[[Excel export]]` + UI кнопка |
| `step:stop-with-error` | 1, 2, 3 | `RAISE EXCEPTION` / traceback / рендер по `[[validation and errors]]` |

## Возможные пост-этапы (не входят в три основных)

- Полный `[[audit]]`: история изменений `target_qty`, `is_active`, eBay-полей.
- Аутентификация / роли — если выйдем за периметр локальной сети.
- UI-импорт Excel поверх `step:import-targets-from-excel`.
- Webhooks / cron-синхронизация — только если появится явное требование сверх YAML.
