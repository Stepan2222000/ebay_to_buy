import datetime as dt
from typing import Annotated, Literal

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import config, errors, excel, search
from .db import get_pool, lifespan

app = FastAPI(title="ebay_to_buy backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
errors.install(app)


# ---------- /overview ---------------------------------------------------------


@app.get("/overview")
async def get_overview(
    is_need: bool | None = None,
    is_active: bool | None = None,
    has_active_ebay: bool | None = None,
    has_ended_ebay: bool | None = None,
    q: str | None = None,
    min_need_qty: int | None = None,
    sort: str = "smart_part_id",
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    sql, params = excel._build_overview_query(
        is_need=is_need, is_active=is_active,
        has_active_ebay=has_active_ebay, has_ended_ebay=has_ended_ebay,
        q=q, min_need_qty=min_need_qty, sort=sort,
    )
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows]


# ---------- /feed (фид закупки с тумблерами наличия) --------------------------


@app.get("/feed")
async def get_feed(
    include_personal: bool = True,
    include_in_transit: bool = True,
    include_ebay_pending: bool = True,
    include_kit_breakdown: bool = True,
    include_virtual_kit: bool = True,
    include_defect: bool = True,
    only_need: bool = True,
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    """Что закупать: активные цели, наличие = on_hand_new + включённые компоненты.

    Та же логика, что SQL-функция purchase_feed() — её и зовём, логика одна.
    Сезонное окно берётся из глобальной настройки (effective_season_months()).
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM purchase_feed(effective_season_months(), $1, $2, $3, $4, $5, $6, $7)",
            include_personal,
            include_in_transit,
            include_ebay_pending,
            include_kit_breakdown,
            include_virtual_kit,
            include_defect,
            only_need,
        )
    return [dict(r) for r in rows]


# ---------- /smart/search -----------------------------------------------------


@app.get("/smart/search")
async def smart_search(
    q: str,
    limit: int = 20,
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    if not q.strip():
        raise HTTPException(status_code=422, detail="параметр q обязателен")
    if not (1 <= limit <= 100):
        raise HTTPException(status_code=422, detail="limit должен быть 1..100")
    return await search.search_smart(pool, q.strip(), limit)


# ---------- /targets ----------------------------------------------------------


class TargetUpsertIn(BaseModel):
    smart_part_id: str
    target_qty: int
    is_active: bool = True


class TargetPatchIn(BaseModel):
    target_qty: int | None = None
    is_active: bool | None = None


@app.post("/targets")
async def upsert_target(
    payload: TargetUpsertIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO purchase_targets (smart_part_id, target_qty, is_active)
            VALUES ($1, $2, $3)
            ON CONFLICT (smart_part_id) DO UPDATE SET
                target_qty = EXCLUDED.target_qty,
                is_active  = EXCLUDED.is_active
            RETURNING smart_part_id, target_qty, is_active, created_at, updated_at
            """,
            payload.smart_part_id,
            payload.target_qty,
            payload.is_active,
        )
    return dict(row)


@app.patch("/targets/{smart_part_id}")
async def patch_target(
    smart_part_id: str,
    payload: TargetPatchIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    sets: list[str] = []
    params: list = []
    if payload.target_qty is not None:
        params.append(payload.target_qty)
        sets.append(f"target_qty = ${len(params)}")
    if payload.is_active is not None:
        params.append(payload.is_active)
        sets.append(f"is_active = ${len(params)}")
    if not sets:
        raise HTTPException(status_code=422, detail="нечего обновлять")
    params.append(smart_part_id)
    sql = (
        f"UPDATE purchase_targets SET {', '.join(sets)} "
        f"WHERE smart_part_id = ${len(params)} "
        f"RETURNING smart_part_id, target_qty, is_active, created_at, updated_at"
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    if row is None:
        raise HTTPException(status_code=404, detail=f"цель {smart_part_id} не найдена")
    return dict(row)


# ---------- /listings ---------------------------------------------------------


class ListingCreateIn(BaseModel):
    smart_part_id: str
    ebay_item_number: str
    comment: str | None = None


class ListingPatchIn(BaseModel):
    ebay_item_number: str | None = None
    comment: str | None = None
    is_ended: bool | None = None


@app.get("/listings")
async def list_listings(
    smart_part_id: str | None = None,
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict]:
    if smart_part_id is None:
        sql = """
            SELECT id, smart_part_id, ebay_item_number, comment, is_ended,
                   created_at, updated_at
            FROM ebay_listings
            ORDER BY smart_part_id, created_at, id
        """
        params: list = []
    else:
        sql = """
            SELECT id, smart_part_id, ebay_item_number, comment, is_ended,
                   created_at, updated_at
            FROM ebay_listings
            WHERE smart_part_id = $1
            ORDER BY created_at, id
        """
        params = [smart_part_id]
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows]


@app.post("/listings")
async def create_listing(
    payload: ListingCreateIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO ebay_listings (smart_part_id, ebay_item_number, comment)
            VALUES ($1, $2, $3)
            RETURNING id, smart_part_id, ebay_item_number, comment, is_ended,
                      created_at, updated_at
            """,
            payload.smart_part_id,
            payload.ebay_item_number,
            payload.comment,
        )
    return dict(row)


@app.patch("/listings/{listing_id}")
async def patch_listing(
    listing_id: int,
    payload: ListingPatchIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    sets: list[str] = []
    params: list = []
    fields = (
        ("ebay_item_number", payload.ebay_item_number),
        ("comment",          payload.comment),
        ("is_ended",         payload.is_ended),
    )
    for name, value in fields:
        if value is not None:
            params.append(value)
            sets.append(f"{name} = ${len(params)}")
    if not sets:
        raise HTTPException(status_code=422, detail="нечего обновлять")
    params.append(listing_id)
    sql = (
        f"UPDATE ebay_listings SET {', '.join(sets)} "
        f"WHERE id = ${len(params)} "
        f"RETURNING id, smart_part_id, ebay_item_number, comment, is_ended, "
        f"created_at, updated_at"
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    if row is None:
        raise HTTPException(status_code=404, detail=f"объявление {listing_id} не найдено")
    return dict(row)


@app.post("/listings/{listing_id}/end")
async def end_listing(
    listing_id: int,
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE ebay_listings SET is_ended = true WHERE id = $1",
            listing_id,
        )
    # asyncpg возвращает строку 'UPDATE n'
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail=f"объявление {listing_id} не найдено")
    return Response(status_code=204)


@app.delete("/listings/{listing_id}", status_code=204)
async def delete_listing(
    listing_id: int,
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM ebay_listings WHERE id = $1",
            listing_id,
        )
    # asyncpg возвращает 'DELETE n'
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail=f"объявление {listing_id} не найдено")
    return Response(status_code=204)


# ---------- /contacts (UI-метки 7 дней) --------------------------------------


class ContactBulkItem(BaseModel):
    target_key: str = Field(min_length=1, max_length=512)
    marked_at: dt.datetime


@app.get("/contacts")
async def list_contacts(pool: asyncpg.Pool = Depends(get_pool)) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT target_key, marked_at FROM contact_marks "
            "WHERE marked_at > now() - interval '7 days' "
            "ORDER BY marked_at DESC"
        )
    return [dict(r) for r in rows]


@app.put("/contacts/bulk")
async def replace_contacts(
    items: list[ContactBulkItem],
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Полная замена снимка отметок одной транзакцией: source-of-truth = клиент.

    Используется фронтом как periodic backup из LS. Никакого merge — тупо replace.
    """
    rows = [(it.target_key, it.marked_at) for it in items]
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM contact_marks")
            if rows:
                await conn.executemany(
                    "INSERT INTO contact_marks (target_key, marked_at) VALUES ($1, $2)",
                    rows,
                )
    return {"count": len(rows)}


@app.delete("/contacts", status_code=204)
async def delete_all_contacts(pool: asyncpg.Pool = Depends(get_pool)) -> Response:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM contact_marks")
    return Response(status_code=204)


# ---------- /settings/contact-mode (одна строка app_settings) ----------------


class ContactModeIn(BaseModel):
    value: Literal["on", "off"]


@app.get("/settings/contact-mode")
async def get_contact_mode(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM app_settings WHERE key = 'contact-mode'"
        )
    return {"value": row["value"] if row else "off"}


@app.put("/settings/contact-mode")
async def set_contact_mode(
    payload: ContactModeIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) "
            "VALUES ('contact-mode', $1, now()) "
            "ON CONFLICT (key) DO UPDATE "
            "SET value = EXCLUDED.value, updated_at = now()",
            payload.value,
        )
    return {"value": payload.value}


# ---------- /settings/season (глобальный сезонный режим; его же читает parser_ebay)


class SeasonSettingsIn(BaseModel):
    enabled: bool
    months_ahead: int = Field(ge=0, le=11)


@app.get("/settings/season")
async def get_season_settings(pool: asyncpg.Pool = Depends(get_pool)) -> dict:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM app_settings WHERE key IN ('season-filter', 'season-months-ahead')"
        )
        months = await conn.fetchval("SELECT effective_season_months()")
    kv = {r["key"]: r["value"] for r in rows}
    return {
        "enabled": kv.get("season-filter") == "on",
        "months_ahead": int(kv.get("season-months-ahead", "1")),
        "effective_months": list(months) if months is not None else None,
    }


@app.put("/settings/season")
async def set_season_settings(
    payload: SeasonSettingsIn,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            for key, value in (
                ("season-filter", "on" if payload.enabled else "off"),
                ("season-months-ahead", str(payload.months_ahead)),
            ):
                await conn.execute(
                    "INSERT INTO app_settings (key, value, updated_at) "
                    "VALUES ($1, $2, now()) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
                    key, value,
                )
        months = await conn.fetchval("SELECT effective_season_months()")
    return {
        "enabled": payload.enabled,
        "months_ahead": payload.months_ahead,
        "effective_months": list(months) if months is not None else None,
    }


# ---------- /export.xlsx, /import.xlsx ----------------------------------------


_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@app.get("/export.xlsx")
async def export_xlsx(
    is_need: bool | None = None,
    is_active: bool | None = None,
    has_active_ebay: bool | None = None,
    has_ended_ebay: bool | None = None,
    q: str | None = None,
    min_need_qty: int | None = None,
    sort: str = "smart_part_id",
    explode_articles: bool = False,
    explode_active_ebay: bool = False,
    explode_ended_ebay: bool = False,
    pool: asyncpg.Pool = Depends(get_pool),
) -> StreamingResponse:
    data = await excel.export_overview(
        pool,
        is_need=is_need,
        is_active=is_active,
        has_active_ebay=has_active_ebay,
        has_ended_ebay=has_ended_ebay,
        q=q,
        min_need_qty=min_need_qty,
        sort=sort,
        explode_articles=explode_articles,
        explode_active_ebay=explode_active_ebay,
        explode_ended_ebay=explode_ended_ebay,
    )
    return StreamingResponse(
        iter([data]),
        media_type=_XLSX_MEDIA,
        headers={
            "Content-Disposition": 'attachment; filename="purchase_overview.xlsx"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/import.xlsx")
async def import_xlsx(
    file: UploadFile,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    content = await file.read()
    result = await excel.import_targets(pool, content)
    return {"inserted": result.inserted, "updated": result.updated}
