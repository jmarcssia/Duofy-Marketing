from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.settings import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()


def build_engine(*, null_pool: bool = False) -> AsyncEngine:
    """Cria um engine async novo.

    `null_pool=True` abre/fecha a conexão a cada uso em vez de reciclá-la entre
    chamadas — obrigatório para qualquer consumidor que rode múltiplos
    `asyncio.run()` no mesmo processo de vida longa (cada `asyncio.run()` cria um
    event loop novo; uma conexão asyncpg pooled fica presa ao loop em que foi aberta
    e uma chamada seguinte que a reusa quebra com "attached to a different loop").
    Já era o caso do TestClient/fixtures do pytest (loops distintos por teste) — e
    também do worker Celery, que chama `asyncio.run()` uma vez por tarefa.
    """
    if null_pool or settings.app_env in {"test", "testing"}:
        return create_async_engine(settings.database_url, poolclass=NullPool)
    return create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
    )


engine = build_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
