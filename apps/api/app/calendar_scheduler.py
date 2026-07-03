from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar_service import execute_calendar_event
from app.calendar_workflow import RESEARCH_EVENT_TYPES, execute_research, is_research_event
from app.db import AsyncSessionLocal
from app.models import CalendarEvent, User
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
            executed += await _execute_due_research_events(db, redis)
    finally:
        await redis.aclose()
    return executed


async def _execute_due_research_events(db: AsyncSession, redis: Redis) -> int:
    """Execução automática segura de eventos de PESQUISA do workflow.

    Só dispara quem o gestor marcou como automático, com horário vencido e autor definido.
    Idempotência: mesmo lock Redis NX + guarda de status em execute_research. Falha vira
    status='failed' + last_error, sem mascarar. Cocriação segue exigindo aprovação humana.
    """
    now = datetime.now(UTC)
    result = await db.execute(
        select(CalendarEvent)
        .where(
            CalendarEvent.execution_mode == "auto",
            CalendarEvent.status.in_(("ready", "scheduled")),
            CalendarEvent.auto_execute_at.is_not(None),
            CalendarEvent.auto_execute_at <= now,
            CalendarEvent.created_by.is_not(None),
            or_(
                CalendarEvent.event_type.in_(RESEARCH_EVENT_TYPES),
                CalendarEvent.assigned_agent_slug == "research_agent",
            ),
        )
        .order_by(CalendarEvent.auto_execute_at.asc())
        .limit(3)
    )
    executed = 0
    for event in list(result.scalars().all()):
        if not is_research_event(event):
            continue
        lock_key = f"duofy:calendar:event:{event.id}:lock"
        if not await redis.set(lock_key, "1", ex=LOCK_SECONDS, nx=True):
            continue
        user = await db.get(User, event.created_by)
        if user is None:
            continue
        try:
            await execute_research(db, event, user)
            executed += 1
        except Exception:
            logger.exception("Auto research execution failed: event=%s", event.id)
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
