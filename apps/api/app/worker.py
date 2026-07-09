from __future__ import annotations

import asyncio
import logging

from celery import Celery
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import build_engine
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


# Engine dedicado do worker, com NullPool: o worker Celery roda `asyncio.run()`
# uma vez por tarefa, cada chamada com seu próprio event loop. O engine
# compartilhado da API (app.db.engine) usa um pool que recicla conexões entre
# chamadas — o que quebra aqui, já que uma conexão aberta no loop de uma tarefa
# fica presa a ele e não pode ser reusada pela tarefa seguinte (loop diferente).
_worker_engine = build_engine(null_pool=True)
WorkerSessionLocal = async_sessionmaker(_worker_engine, expire_on_commit=False)


async def _execute(task_id: int) -> None:
    async with WorkerSessionLocal() as db:
        await execute_agent_task(db, task_id)


@celery_app.task(name="app.worker.execute_agent_task")
def execute_agent_task_celery(task_id: int) -> dict[str, int]:
    logger.info("Executing agent task %s", task_id)
    asyncio.run(_execute(task_id))
    return {"task_id": task_id}
