import logging
import traceback

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def install(app: FastAPI) -> None:
    @app.exception_handler(Exception)
    async def handle_any(request: Request, exc: Exception) -> JSONResponse:
        status = 422 if isinstance(exc, asyncpg.PostgresError) else 500
        tb = traceback.format_exc()
        logger.error("request %s %s -> %s", request.method, request.url.path, exc)
        logger.error(tb)
        # CORS-заголовки тут вручную: app.add_exception_handler перехватывает
        # запрос ДО CORSMiddleware, поэтому стандартное middleware их не добавит.
        origin = request.headers.get("origin")
        headers: dict[str, str] = {}
        if origin:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Vary"] = "Origin"
        return JSONResponse(
            status_code=status,
            content={"error": str(exc), "traceback": tb},
            headers=headers,
        )
