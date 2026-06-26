from __future__ import annotations

import logging

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.settings import get_settings

logger = logging.getLogger(__name__)


async def check_postgres() -> bool:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("PostgreSQL health check failed")
        return False
    finally:
        await engine.dispose()


async def check_redis() -> bool:
    settings = get_settings()
    client: Redis = Redis.from_url(settings.redis_url, socket_connect_timeout=3)
    try:
        return bool(await client.ping())
    except Exception:
        logger.exception("Redis health check failed")
        return False
    finally:
        await client.aclose()
