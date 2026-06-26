from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AsyncSessionLocal, get_db
from app.dependencies import get_current_user
from app.models import AgentLog, AgentTask, User
from app.schemas import AgentLogRead, AgentTaskRead

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _log_read(log: AgentLog) -> AgentLogRead:
    return AgentLogRead(
        id=log.id,
        task_id=log.task_id,
        level=log.level,
        message=log.message,
        metadata_json=log.metadata_json,
        created_at=log.created_at,
    )


async def _task_read(db: AsyncSession, task: AgentTask) -> AgentTaskRead:
    result = await db.execute(
        select(AgentLog).where(AgentLog.task_id == task.id).order_by(AgentLog.created_at.asc())
    )
    return AgentTaskRead(
        id=task.id,
        session_id=task.session_id,
        user_id=task.user_id,
        brand_slug=task.brand_slug,
        task_type=task.task_type,
        status=task.status,
        input=task.input,
        result=task.result,
        output_type=task.output_type,
        output_id=task.output_id,
        celery_task_id=task.celery_task_id,
        error=task.error,
        metadata_json=task.metadata_json,
        created_at=task.created_at,
        updated_at=task.updated_at,
        logs=[_log_read(log) for log in result.scalars().all()],
    )


async def _get_task_or_404(db: AsyncSession, task_id: int, user: User) -> AgentTask:
    result = await db.execute(
        select(AgentTask).where(AgentTask.id == task_id, AgentTask.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarefa nao encontrada.")
    return task


@router.get("", response_model=list[AgentTaskRead])
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> list[AgentTaskRead]:
    statement = select(AgentTask).where(AgentTask.user_id == current_user.id)
    if status_filter:
        statement = statement.where(AgentTask.status == status_filter)
    statement = statement.order_by(AgentTask.created_at.desc()).limit(100)
    result = await db.execute(statement)
    return [await _task_read(db, task) for task in result.scalars().all()]


@router.get("/{task_id}", response_model=AgentTaskRead)
async def get_task(
    task_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentTaskRead:
    task = await _get_task_or_404(db, task_id, current_user)
    return await _task_read(db, task)


async def _event_stream(task_id: int, user_id: int) -> AsyncIterator[str]:
    last_payload = ""
    for _ in range(180):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AgentTask).where(AgentTask.id == task_id, AgentTask.user_id == user_id)
            )
            task = result.scalar_one_or_none()
            if task is None:
                yield "event: error\ndata: {\"error\":\"not_found\"}\n\n"
                return
            payload = (await _task_read(db, task)).model_dump(mode="json")
            serialized = json.dumps(payload, ensure_ascii=False)
            if serialized != last_payload:
                yield f"event: update\ndata: {serialized}\n\n"
                last_payload = serialized
            if task.status in {"completed", "failed"}:
                return
        await asyncio.sleep(1)


@router.get("/{task_id}/stream")
async def stream_task(
    task_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(task_id, current_user.id),
        media_type="text/event-stream",
    )
