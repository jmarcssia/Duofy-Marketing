from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.calendar_scheduler import start_calendar_scheduler, stop_calendar_scheduler
from app.db import AsyncSessionLocal
from app.document_formatting import reformat_legacy_outputs
from app.health import check_postgres, check_redis
from app.routers import (
    admin,
    agents,
    auth,
    brands,
    calendar,
    chat,
    content,
    documents,
    memory,
    metrics,
    operations,
    outputs,
    press,
    reports,
    research,
    tasks,
)
from app.schemas import HealthResponse, ServiceHealth
from app.settings import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    scheduler_task = start_calendar_scheduler()
    try:
        async with AsyncSessionLocal() as session:
            result = await reformat_legacy_outputs(session, limit=80)
            if result["reformatted"]:
                logger.info("Legacy outputs reformatted: %s", result)
    except Exception:
        logger.exception("Failed to reformat legacy outputs during startup.")
    try:
        yield
    finally:
        await stop_calendar_scheduler(scheduler_task)


app = FastAPI(
    title="DUOFY V1 API",
    version="0.1.0",
    description="Fundacao tecnica da API DUOFY V1.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(brands.router)
app.include_router(admin.router)
app.include_router(agents.router)
app.include_router(chat.router)
app.include_router(content.router)
app.include_router(documents.router)
app.include_router(memory.router)
app.include_router(outputs.router)
app.include_router(research.router)
app.include_router(calendar.router)
app.include_router(press.router)
app.include_router(metrics.router)
app.include_router(operations.router)
app.include_router(reports.router)
app.include_router(tasks.router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    postgres_ok = await check_postgres()
    redis_ok = await check_redis()
    status = "ok" if postgres_ok and redis_ok else "degraded"

    if status != "ok":
        logger.warning("Health check degraded: postgres=%s redis=%s", postgres_ok, redis_ok)

    return HealthResponse(
        status=status,
        services={
            "api": ServiceHealth(status="ok"),
            "postgres": ServiceHealth(status="ok" if postgres_ok else "error"),
            "redis": ServiceHealth(status="ok" if redis_ok else "error"),
        },
    )
