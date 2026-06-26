from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select

from app.calendar_service import execute_calendar_event
from app.db import AsyncSessionLocal
from app.models import CalendarEvent
from app.settings import get_settings

logger = logging.getLogger(__name__)

POLL_SECONDS = 60
LOCK_SECONDS = 900


async def execute_due_calendar_events() -> int:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=3)
    executed = 0
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.status == "scheduled",
                    CalendarEvent.assigned_agent_slug.is_not(None),
                    CalendarEvent.start_at <= datetime.now(UTC),
                )
                .order_by(CalendarEvent.start_at.asc())
                .limit(5)
            )
            events = list(result.scalars().all())
            for event in events:
                lock_key = f"duofy:calendar:event:{event.id}:lock"
                locked = await redis.set(lock_key, "1", ex=LOCK_SECONDS, nx=True)
                if not locked:
                    continue
                event.status = "in_progress"
                await db.commit()
                await db.refresh(event)
                await execute_calendar_event(db, event)
                executed += 1
    finally:
        await redis.aclose()
    return executed


async def calendar_scheduler_loop() -> None:
    while True:
        try:
            count = await execute_due_calendar_events()
            if count:
                logger.info("Executed %s scheduled calendar event(s).", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Calendar scheduler tick failed.")
        await asyncio.sleep(POLL_SECONDS)


def start_calendar_scheduler() -> asyncio.Task[None]:
    return asyncio.create_task(calendar_scheduler_loop(), name="duofy-calendar-scheduler")


async def stop_calendar_scheduler(task: asyncio.Task[None]) -> None:
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
