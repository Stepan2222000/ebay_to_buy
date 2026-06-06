import asyncpg

# Пять бакетов по [[smart search]]:
#   1 — точный smart_part_id
#   2 — точный артикул
#   3 — артикул starts-with
#   4 — артикул contains
#   5 — название contains
# DISTINCT ON (smart_part_id) ORDER BY smart_part_id, bucket_rank — каждый smart
# попадает в самый высокий бакет, потом приклеиваем purchase_feed_components
# и существующую цель. stock_total — дефолтная политика «всё считается наличием».
_SEARCH_SQL = """
WITH q AS (SELECT lower($1::text) AS needle),
buckets AS (
    SELECT sp.id   AS smart_part_id,
           sp.name AS smart_name,
           array_to_string(sp.articles, ', ') AS articles_text,
           1 AS bucket_rank
    FROM smart.parts sp, q
    WHERE lower(sp.id) = q.needle

    UNION ALL
    SELECT sp.id, sp.name, array_to_string(sp.articles, ', '), 2
    FROM smart.parts sp, q
    WHERE EXISTS (SELECT 1 FROM unnest(sp.articles) a WHERE lower(a) = q.needle)

    UNION ALL
    SELECT sp.id, sp.name, array_to_string(sp.articles, ', '), 3
    FROM smart.parts sp, q
    WHERE EXISTS (SELECT 1 FROM unnest(sp.articles) a WHERE lower(a) LIKE q.needle || '%')

    UNION ALL
    SELECT sp.id, sp.name, array_to_string(sp.articles, ', '), 4
    FROM smart.parts sp, q
    WHERE EXISTS (SELECT 1 FROM unnest(sp.articles) a WHERE lower(a) LIKE '%' || q.needle || '%')

    UNION ALL
    SELECT sp.id, sp.name, array_to_string(sp.articles, ', '), 5
    FROM smart.parts sp, q
    WHERE lower(sp.name) LIKE '%' || q.needle || '%'
),
deduped AS (
    SELECT DISTINCT ON (smart_part_id) smart_part_id, smart_name, articles_text, bucket_rank
    FROM buckets
    ORDER BY smart_part_id, bucket_rank
)
SELECT d.smart_part_id,
       d.smart_name,
       d.articles_text,
       (COALESCE(sr.on_hand_new_qty,0) + COALESCE(sr.on_hand_personal_qty,0)
            + COALESCE(sr.in_transit_linked_qty,0) + COALESCE(sr.in_transit_unlinked_qty,0)
            + COALESCE(sr.ebay_ordered_pending_qty,0)
            + COALESCE(sr.kit_breakdown_qty,0) + COALESCE(sr.virtual_kit_qty,0)
            + COALESCE(sr.defect_qty,0)) AS stock_total_qty,
       pt.target_qty             AS existing_target_qty,
       pt.is_active              AS existing_is_active,
       d.bucket_rank
FROM      deduped d
LEFT JOIN parts_uchet.purchase_feed_components sr ON sr.smart_part_id = d.smart_part_id
LEFT JOIN purchase_targets      pt ON pt.smart_part_id = d.smart_part_id
ORDER BY d.bucket_rank, d.smart_part_id
LIMIT $2
"""


async def search_smart(pool: asyncpg.Pool, q: str, limit: int) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_SQL, q, limit)
    return [dict(r) for r in rows]
