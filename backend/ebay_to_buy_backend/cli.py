import asyncio
import functools
import json
import logging
import sys
from pathlib import Path

import typer
import uvicorn

from . import config, excel, search
from .db import make_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)


def syncify(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return asyncio.run(fn(*args, **kwargs))
    return wrapper


app = typer.Typer(no_args_is_help=True, add_completion=False)


async def _close(pool):
    await asyncio.wait_for(pool.close(), timeout=90)


def _print_json(obj) -> None:
    typer.echo(json.dumps(obj, ensure_ascii=False, default=str, indent=2))


# ---------- serve -------------------------------------------------------------


@app.command()
def serve() -> None:
    """Запустить FastAPI-приложение через uvicorn."""
    uvicorn.run(
        "ebay_to_buy_backend.main:app",
        host=config.HTTP_HOST,
        port=config.HTTP_PORT,
        log_level="info",
    )


# ---------- targets -----------------------------------------------------------


@app.command("upsert-target")
@syncify
async def upsert_target(
    smart_part_id: str,
    target_qty: int,
    inactive: bool = typer.Option(False, "--inactive", help="is_active=false"),
) -> None:
    pool = await make_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO purchase_targets (smart_part_id, target_qty, is_active)
                VALUES ($1, $2, $3)
                ON CONFLICT (smart_part_id) DO UPDATE SET
                    target_qty = EXCLUDED.target_qty,
                    is_active  = EXCLUDED.is_active
                RETURNING smart_part_id, target_qty, is_active
                """,
                smart_part_id,
                target_qty,
                not inactive,
            )
        _print_json(dict(row))
    finally:
        await _close(pool)


@app.command("edit-target")
@syncify
async def edit_target(
    smart_part_id: str,
    target_qty: int = typer.Option(None, "--target-qty"),
    inactive: bool = typer.Option(None, "--inactive/--active", show_default=False),
) -> None:
    sets: list[str] = []
    params: list = []
    if target_qty is not None:
        params.append(target_qty)
        sets.append(f"target_qty = ${len(params)}")
    if inactive is not None:
        params.append(not inactive)
        sets.append(f"is_active = ${len(params)}")
    if not sets:
        raise typer.BadParameter("нечего обновлять")
    params.append(smart_part_id)
    sql = (
        f"UPDATE purchase_targets SET {', '.join(sets)} "
        f"WHERE smart_part_id = ${len(params)} "
        f"RETURNING smart_part_id, target_qty, is_active"
    )
    pool = await make_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)
        if row is None:
            raise typer.Exit(code=2)
        _print_json(dict(row))
    finally:
        await _close(pool)


# ---------- listings ----------------------------------------------------------


@app.command("attach-listing")
@syncify
async def attach_listing(
    smart_part_id: str,
    ebay_item_number: str,
    comment: str = typer.Option(None, "--comment"),
) -> None:
    pool = await make_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO ebay_listings (smart_part_id, ebay_item_number, comment)
                VALUES ($1, $2, $3)
                RETURNING id, smart_part_id, ebay_item_number, comment, is_ended
                """,
                smart_part_id,
                ebay_item_number,
                comment,
            )
        _print_json(dict(row))
    finally:
        await _close(pool)


@app.command("mark-ended")
@syncify
async def mark_ended(listing_id: int) -> None:
    pool = await make_pool()
    try:
        async with pool.acquire() as conn:
            tag = await conn.execute(
                "UPDATE ebay_listings SET is_ended = true WHERE id = $1",
                listing_id,
            )
        if tag.endswith(" 0"):
            typer.echo(f"объявление {listing_id} не найдено", err=True)
            raise typer.Exit(code=2)
        typer.echo(f"объявление {listing_id} помечено снятым")
    finally:
        await _close(pool)


# ---------- excel & search ----------------------------------------------------


@app.command("import-xlsx")
@syncify
async def import_xlsx(path: Path) -> None:
    data = path.read_bytes()
    pool = await make_pool()
    try:
        result = await excel.import_targets(pool, data)
        typer.echo(f"inserted={result.inserted} updated={result.updated}")
    finally:
        await _close(pool)


@app.command("export-xlsx")
@syncify
async def export_xlsx(
    output: Path = typer.Option(..., "--output"),
    is_need: bool = typer.Option(None, "--is-need/--no-is-need", show_default=False),
    is_active: bool = typer.Option(None, "--is-active/--no-is-active", show_default=False),
    has_active_ebay: bool = typer.Option(
        None, "--has-active-ebay/--no-active-ebay", show_default=False
    ),
    explode_articles: bool = typer.Option(False, "--explode-articles"),
    explode_active_ebay: bool = typer.Option(False, "--explode-active-ebay"),
    explode_ended_ebay: bool = typer.Option(False, "--explode-ended-ebay"),
) -> None:
    pool = await make_pool()
    try:
        data = await excel.export_overview(
            pool,
            is_need=is_need,
            is_active=is_active,
            has_active_ebay=has_active_ebay,
            explode_articles=explode_articles,
            explode_active_ebay=explode_active_ebay,
            explode_ended_ebay=explode_ended_ebay,
        )
        output.write_bytes(data)
        typer.echo(f"wrote {len(data)} bytes -> {output}")
    finally:
        await _close(pool)


@app.command("search-smart")
@syncify
async def search_smart_cmd(
    query: str,
    limit: int = typer.Option(20, "--limit"),
) -> None:
    pool = await make_pool()
    try:
        rows = await search.search_smart(pool, query, limit)
        _print_json(rows)
    finally:
        await _close(pool)
