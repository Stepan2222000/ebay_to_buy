-- =============================================================================
-- ebay_to_buy: схема БД, FDW и валидация
-- PostgreSQL 18, host 194.164.245.107, port 5406, dbname ebay_to_buy
--
-- Спецификация: ../purchase-logic.yaml
-- План этапа:   ../IMPLEMENTATION-PLAN.md  (Этап 1)
--
-- Запуск:
--   PGPASSWORD=Password123 psql -h 194.164.245.107 -p 5406 -U admin \
--                               -d ebay_to_buy -f db/main.sql
--
-- Скрипт идемпотентен: повторный прогон не падает и не теряет данные
-- в purchase_targets / ebay_listings.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1. FDW: postgres_fdw, серверы, user mappings, локальные схемы
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS smart_server
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host '194.164.245.107', port '5402', dbname 'smart');

CREATE SERVER IF NOT EXISTS parts_uchet_server
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host '194.164.245.107', port '5403', dbname 'parts_uchet');

CREATE USER MAPPING IF NOT EXISTS FOR admin
    SERVER smart_server
    OPTIONS (user 'admin', password 'Password123');

CREATE USER MAPPING IF NOT EXISTS FOR admin
    SERVER parts_uchet_server
    OPTIONS (user 'admin', password 'Password123');

CREATE SCHEMA IF NOT EXISTS smart;
CREATE SCHEMA IF NOT EXISTS parts_uchet;


-- =============================================================================
-- SECTION 2. Foreign tables (только нужные колонки по purchase-logic.yaml)
-- =============================================================================

-- [[smart catalog]]: используем только id, name, articles
DROP FOREIGN TABLE IF EXISTS smart.parts CASCADE;
CREATE FOREIGN TABLE smart.parts (
    id        text   NOT NULL,
    name      text   NOT NULL,
    articles  text[] NOT NULL
) SERVER smart_server
  OPTIONS (schema_name 'public', table_name 'parts');

-- [[stock_raw]]: новый stock_raw (parts_uchet) отдаёт разбивку наличия.
-- Для сигнала закупки берём «всё, что реально/потенциально доступно без покупки»:
--   total_pipeline_qty  — годное на руках + едущее + заказано на eBay (без дефекта)
--   as_kit_component_qty — детали, доступные через разбор разрешённых наборов
--   as_virtual_kit_qty   — наборы, собираемые виртуально из свободных компонент
-- stock_total_qty = сумма трёх (см. purchase_overview / search.py).
DROP FOREIGN TABLE IF EXISTS parts_uchet.stock_raw CASCADE;
CREATE FOREIGN TABLE parts_uchet.stock_raw (
    smart_part_id        text,
    smart_name           text,
    total_pipeline_qty   integer,
    as_kit_component_qty integer,
    as_virtual_kit_qty   integer
) SERVER parts_uchet_server
  OPTIONS (schema_name 'public', table_name 'stock_raw');


-- =============================================================================
-- SECTION 3. Local tables  (CREATE IF NOT EXISTS — данные оператора живут)
-- =============================================================================

-- [[purchase_targets]]: одна цель = одна строка по smart_part_id
CREATE TABLE IF NOT EXISTS purchase_targets (
    smart_part_id text        PRIMARY KEY,
    target_qty    integer     NOT NULL CHECK (target_qty >= 1),
    is_active     boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- [[ebay_listings]]: eBay-объявления, прикреплённые к smart_part_id
CREATE TABLE IF NOT EXISTS ebay_listings (
    id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    smart_part_id     text        NOT NULL,
    ebay_item_number  text        NOT NULL CHECK (length(btrim(ebay_item_number)) > 0),
    comment           text,
    is_ended          boolean     NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ebay_item_number)
);

CREATE INDEX IF NOT EXISTS ebay_listings_smart_part_id_idx
    ON ebay_listings (smart_part_id);


-- =============================================================================
-- SECTION 4. Trigger functions
-- =============================================================================

-- Общий хелпер для updated_at — переиспользуется обеими таблицами.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Валидация smart_part_id для purchase_targets:
-- закрывает [[smart catalog]] («запись останавливается ошибкой»)
-- и [[purchase_targets#rules]] («Перед записью SQL проверяет ...»).
-- Паттерн взят из uchet_parts/main.sql:296.
CREATE OR REPLACE FUNCTION validate_purchase_target_smart_id() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM smart.parts WHERE id = NEW.smart_part_id) THEN
        RAISE EXCEPTION 'smart_part_id % не существует в smart.parts (purchase_targets)',
            NEW.smart_part_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Валидация smart_part_id для ebay_listings (отдельная функция —
-- ради понятного traceback по [[validation and errors]]).
CREATE OR REPLACE FUNCTION validate_ebay_listing_smart_id() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM smart.parts WHERE id = NEW.smart_part_id) THEN
        RAISE EXCEPTION 'smart_part_id % не существует в smart.parts (ebay_listings)',
            NEW.smart_part_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- SECTION 5. Triggers (CREATE OR REPLACE — PG14+, проверено на PG18.3)
-- =============================================================================

CREATE OR REPLACE TRIGGER purchase_targets_smart_id_check
    BEFORE INSERT OR UPDATE OF smart_part_id ON purchase_targets
    FOR EACH ROW
    EXECUTE FUNCTION validate_purchase_target_smart_id();

CREATE OR REPLACE TRIGGER purchase_targets_set_updated_at
    BEFORE UPDATE ON purchase_targets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER ebay_listings_smart_id_check
    BEFORE INSERT OR UPDATE OF smart_part_id ON ebay_listings
    FOR EACH ROW
    EXECUTE FUNCTION validate_ebay_listing_smart_id();

CREATE OR REPLACE TRIGGER ebay_listings_set_updated_at
    BEFORE UPDATE ON ebay_listings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SECTION 6. View purchase_overview
-- Колонки строго по [[purchase_overview#columns]];
-- нехватка по [[need formula]] (без учёта is_active);
-- содержит все цели — [[purchase_overview#rules]].
-- =============================================================================

DROP VIEW IF EXISTS purchase_overview CASCADE;

CREATE VIEW purchase_overview AS
SELECT
    pt.smart_part_id,
    sp.name                                                AS smart_name,
    array_to_string(sp.articles, ', ')                     AS articles_text,
    pt.target_qty,
    (COALESCE(sr.total_pipeline_qty,0) + COALESCE(sr.as_kit_component_qty,0)
        + COALESCE(sr.as_virtual_kit_qty,0))               AS stock_total_qty,
    GREATEST(pt.target_qty - (COALESCE(sr.total_pipeline_qty,0)
        + COALESCE(sr.as_kit_component_qty,0) + COALESCE(sr.as_virtual_kit_qty,0)), 0) AS need_qty,
    pt.target_qty > (COALESCE(sr.total_pipeline_qty,0)
        + COALESCE(sr.as_kit_component_qty,0) + COALESCE(sr.as_virtual_kit_qty,0)) AS is_need,
    pt.is_active,

    COUNT(el.id)         FILTER (WHERE NOT el.is_ended)
                                                           AS active_ebay_count,
    STRING_AGG(el.ebay_item_number, ', ' ORDER BY el.created_at, el.id)
                         FILTER (WHERE NOT el.is_ended)
                                                           AS active_ebay_item_numbers,
    STRING_AGG(el.comment, E'\n' ORDER BY el.created_at, el.id)
                         FILTER (WHERE NOT el.is_ended)
                                                           AS active_ebay_comments,

    COUNT(el.id)         FILTER (WHERE el.is_ended)
                                                           AS ended_ebay_count,
    STRING_AGG(el.ebay_item_number, ', ' ORDER BY el.created_at, el.id)
                         FILTER (WHERE el.is_ended)
                                                           AS ended_ebay_item_numbers,
    STRING_AGG(el.comment, E'\n' ORDER BY el.created_at, el.id)
                         FILTER (WHERE el.is_ended)
                                                           AS ended_ebay_comments,

    pt.created_at,
    pt.updated_at
FROM      purchase_targets       pt
LEFT JOIN smart.parts            sp ON sp.id            = pt.smart_part_id
LEFT JOIN parts_uchet.stock_raw  sr ON sr.smart_part_id = pt.smart_part_id
LEFT JOIN ebay_listings          el ON el.smart_part_id = pt.smart_part_id
GROUP BY
    pt.smart_part_id,
    sp.name,
    sp.articles,
    sr.total_pipeline_qty,
    sr.as_kit_component_qty,
    sr.as_virtual_kit_qty,
    pt.target_qty,
    pt.is_active,
    pt.created_at,
    pt.updated_at;

COMMENT ON VIEW purchase_overview IS
    'Главная вьюха ebay_to_buy: цели + наличие из parts_uchet.stock_raw + агрегаты по eBay-объявлениям. См. purchase-logic.yaml [[purchase_overview]].';

-- =============================================================================
-- SECTION 7. UI state — отметки контактов и однотумблерные настройки
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_marks (
    target_key text PRIMARY KEY,
    marked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_marks_marked_at_idx
    ON contact_marks (marked_at DESC);

COMMENT ON TABLE contact_marks IS
    'UI-метки «контактировал по этому таргету» с TTL 7 дней (фильтр на read). target_key — ''listing:<id>'' или ''article:<smart_part_id>:<encoded>''.';

CREATE TABLE IF NOT EXISTS app_settings (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES ('contact-mode', 'off')
    ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE app_settings IS
    'Однострочные UI-настройки приложения. Сейчас: contact-mode=on|off для подсветки контактных меток.';

COMMIT;
