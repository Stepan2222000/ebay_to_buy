FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-install-project --no-dev

COPY ebay_to_buy_backend ./ebay_to_buy_backend
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8000

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "ebay-to-buy", "serve"]
