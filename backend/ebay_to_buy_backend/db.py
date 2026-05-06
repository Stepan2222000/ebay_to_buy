import asyncio
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request

from . import config


async def make_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=config.DATABASE_URL,
        min_size=1,
        max_size=10,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await make_pool()
    yield
    await asyncio.wait_for(app.state.pool.close(), timeout=90)


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool
