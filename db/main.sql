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

-- [[smart catalog]]: используем id, name, articles, product_type.
-- С миграции 015 в smart колонки parts.product_type НЕТ — тип вычисляется
-- из классов техники (vehicle_classes) во VIEW parts_with_components,
-- поэтому foreign table смотрит на view (read-only, нам только чтение).
DROP FOREIGN TABLE IF EXISTS smart.parts CASCADE;
CREATE FOREIGN TABLE smart.parts (
    id           text   NOT NULL,
    name         text   NOT NULL,
    articles     text[] NOT NULL,
    product_type text
) SERVER smart_server
  OPTIONS (schema_name 'public', table_name 'parts_with_components');

-- [[purchase_feed_components]]: компоненты наличия из parts_uchet (замена
-- stock_raw, см. uchet_parts/specs/purchase_feed_components.md). Каждый источник
-- отдельной колонкой; что считать наличием — решают тумблеры purchase_feed().
-- По умолчанию наличием считается ВСЁ (сумма всех компонентов).
DROP FOREIGN TABLE IF EXISTS parts_uchet.stock_raw CASCADE;
DROP FOREIGN TABLE IF EXISTS parts_uchet.purchase_feed_components CASCADE;
CREATE FOREIGN TABLE parts_uchet.purchase_feed_components (
    smart_part_id            text,
    smart_name               text,
    product_type             text,
    on_hand_new_qty          integer,
    on_hand_personal_qty     integer,
    in_transit_linked_qty    integer,
    in_transit_unlinked_qty  integer,
    ebay_ordered_pending_qty integer,
    kit_breakdown_qty        integer,
    virtual_kit_qty          integer,
    defect_qty               integer
) SERVER parts_uchet_server
  OPTIONS (schema_name 'public', table_name 'purchase_feed_components');


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
WITH stock AS (
    -- дефолтная политика: наличием считается ВСЁ (все компоненты, включая
    -- потенциалы и дефект). Выборочная политика — через purchase_feed().
    SELECT smart_part_id,
           (on_hand_new_qty + on_hand_personal_qty
            + in_transit_linked_qty + in_transit_unlinked_qty
            + ebay_ordered_pending_qty
            + kit_breakdown_qty + virtual_kit_qty + defect_qty) AS stock_total_qty
    FROM parts_uchet.purchase_feed_components
)
SELECT
    pt.smart_part_id,
    sp.name                                                AS smart_name,
    sp.product_type,
    array_to_string(sp.articles, ', ')                     AS articles_text,
    pt.target_qty,
    COALESCE(sr.stock_total_qty, 0)                        AS stock_total_qty,
    GREATEST(pt.target_qty - COALESCE(sr.stock_total_qty, 0), 0) AS need_qty,
    pt.target_qty > COALESCE(sr.stock_total_qty, 0)        AS is_need,
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
FROM      purchase_targets pt
LEFT JOIN smart.parts      sp ON sp.id            = pt.smart_part_id
LEFT JOIN stock            sr ON sr.smart_part_id = pt.smart_part_id
LEFT JOIN ebay_listings    el ON el.smart_part_id = pt.smart_part_id
GROUP BY
    pt.smart_part_id,
    sp.name,
    sp.product_type,
    sp.articles,
    sr.stock_total_qty,
    pt.target_qty,
    pt.is_active,
    pt.created_at,
    pt.updated_at;

COMMENT ON VIEW purchase_overview IS
    'Главная вьюха ebay_to_buy: цели + наличие из parts_uchet.purchase_feed_components (дефолтная политика: всё считается наличием) + агрегаты по eBay-объявлениям. См. purchase-logic.yaml [[purchase_overview]].';

-- =============================================================================
-- SECTION 6b. Функция purchase_feed — фид «что закупать» с тумблерами наличия
-- =============================================================================
-- Параметризуемая «вьюха»: компоненты наличия включаются/выключаются флагами,
-- по умолчанию ВСЁ включено. on_hand_new считается наличием всегда.
-- Потребители: HTTP GET /feed (бэкенд) и прямой SQL/FDW (программа-закупщик):
--   SELECT * FROM purchase_feed();                                -- всё к закупке
--   SELECT * FROM purchase_feed(ARRAY['Для мототехники']);        -- категория
--   SELECT * FROM purchase_feed(p_include_ebay_pending := false); -- едущее с eBay не считать

DROP FUNCTION IF EXISTS purchase_feed;

CREATE FUNCTION purchase_feed(
    p_product_types         text[]  DEFAULT NULL,  -- NULL = все категории
    p_include_personal      boolean DEFAULT true,  -- personal на руках
    p_include_in_transit    boolean DEFAULT true,  -- заведённые едущие (linked+unlinked)
    p_include_ebay_pending  boolean DEFAULT true,  -- заказано на eBay, не заведено
    p_include_kit_breakdown boolean DEFAULT true,  -- потенциал разбора наборов
    p_include_virtual_kit   boolean DEFAULT true,  -- потенциал виртуальной сборки
    p_include_defect        boolean DEFAULT true,  -- дефектные
    p_only_need             boolean DEFAULT true   -- только строки с нехваткой
) RETURNS TABLE (
    smart_part_id            text,
    smart_name               text,
    product_type             text,
    articles_text            text,
    target_qty               integer,
    stock_qty                integer,
    need_qty                 integer,
    on_hand_new_qty          integer,
    on_hand_personal_qty     integer,
    in_transit_linked_qty    integer,
    in_transit_unlinked_qty  integer,
    ebay_ordered_pending_qty integer,
    kit_breakdown_qty        integer,
    virtual_kit_qty          integer,
    defect_qty               integer
) LANGUAGE sql STABLE AS $$
WITH base AS (
    SELECT
        pt.smart_part_id,
        sp.name                            AS smart_name,
        sp.product_type,
        array_to_string(sp.articles, ', ') AS articles_text,
        pt.target_qty,
        (COALESCE(c.on_hand_new_qty, 0)
         + CASE WHEN p_include_personal      THEN COALESCE(c.on_hand_personal_qty, 0)     ELSE 0 END
         + CASE WHEN p_include_in_transit    THEN COALESCE(c.in_transit_linked_qty, 0)
                                                  + COALESCE(c.in_transit_unlinked_qty, 0) ELSE 0 END
         + CASE WHEN p_include_ebay_pending  THEN COALESCE(c.ebay_ordered_pending_qty, 0) ELSE 0 END
         + CASE WHEN p_include_kit_breakdown THEN COALESCE(c.kit_breakdown_qty, 0)        ELSE 0 END
         + CASE WHEN p_include_virtual_kit   THEN COALESCE(c.virtual_kit_qty, 0)          ELSE 0 END
         + CASE WHEN p_include_defect        THEN COALESCE(c.defect_qty, 0)               ELSE 0 END
        )                                  AS stock_qty,
        COALESCE(c.on_hand_new_qty, 0)          AS on_hand_new_qty,
        COALESCE(c.on_hand_personal_qty, 0)     AS on_hand_personal_qty,
        COALESCE(c.in_transit_linked_qty, 0)    AS in_transit_linked_qty,
        COALESCE(c.in_transit_unlinked_qty, 0)  AS in_transit_unlinked_qty,
        COALESCE(c.ebay_ordered_pending_qty, 0) AS ebay_ordered_pending_qty,
        COALESCE(c.kit_breakdown_qty, 0)        AS kit_breakdown_qty,
        COALESCE(c.virtual_kit_qty, 0)          AS virtual_kit_qty,
        COALESCE(c.defect_qty, 0)               AS defect_qty
    FROM purchase_targets pt
    LEFT JOIN smart.parts sp ON sp.id = pt.smart_part_id
    LEFT JOIN parts_uchet.purchase_feed_components c ON c.smart_part_id = pt.smart_part_id
    WHERE pt.is_active
      AND (p_product_types IS NULL OR sp.product_type = ANY (p_product_types))
)
SELECT
    smart_part_id, smart_name, product_type, articles_text,
    target_qty, stock_qty,
    GREATEST(target_qty - stock_qty, 0) AS need_qty,
    on_hand_new_qty, on_hand_personal_qty,
    in_transit_linked_qty, in_transit_unlinked_qty,
    ebay_ordered_pending_qty, kit_breakdown_qty, virtual_kit_qty, defect_qty
FROM base
WHERE NOT p_only_need OR target_qty > stock_qty
ORDER BY GREATEST(target_qty - stock_qty, 0) DESC, smart_part_id;
$$;

COMMENT ON FUNCTION purchase_feed IS
    'Фид закупки: активные цели с нехваткой, наличие = on_hand_new + включённые тумблерами компоненты (по умолчанию все). p_only_need=false — все активные цели. Фильтр категорий p_product_types (NULL = все).';

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
