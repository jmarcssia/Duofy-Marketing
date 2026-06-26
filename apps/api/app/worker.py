from __future__ import annotations

import asyncio
import logging

from celery import Celery

from app.db import AsyncSessionLocal
from app.settings import get_settings
from app.task_service import execute_agent_task

settings = get_settings()
logger = logging.getLogger(__name__)

celery_app = Celery(
    "duofy",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
)


async def _execute(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        await execute_agent_task(db, task_id)


@celery_app.task(name="app.worker.execute_agent_task")
def execute_agent_task_celery(task_id: int) -> dict[str, int]:
    logger.info("Executing agent task %s", task_id)
    asyncio.run(_execute(task_id))
    return {"task_id": task_id}
