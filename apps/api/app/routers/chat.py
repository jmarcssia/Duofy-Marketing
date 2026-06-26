from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.models import AgentLog, AgentTask, ChatMessage, ChatSession, User
from app.schemas import (
    AgentLogRead,
    AgentTaskRead,
    ChatMessageCreate,
    ChatMessageRead,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionDetail,
    ChatSessionRead,
)
from app.task_service import add_task_log
from app.worker import execute_agent_task_celery

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _message_read(message: ChatMessage) -> ChatMessageRead:
    return ChatMessageRead(
        id=message.id,
        session_id=message.session_id,
        role=message.role,
        content=message.content,
        agent_task_id=message.agent_task_id,
        metadata_json=message.metadata_json,
        created_at=message.created_at,
    )


def _session_read(session: ChatSession) -> ChatSessionRead:
    return ChatSessionRead(
        id=session.id,
        user_id=session.user_id,
        title=session.title,
        brand_slug=session.brand_slug,
        status=session.status,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


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


async def _get_session_or_404(
    db: AsyncSession,
    session_id: int,
    user: User,
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessao de chat nao encontrada.",
        )
    return session


@router.get("/sessions", response_model=list[ChatSessionRead])
async def list_sessions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ChatSessionRead]:
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(100)
    )
    return [_session_read(session) for session in result.scalars().all()]


@router.post("/sessions", response_model=ChatSessionRead)
async def create_session(
    payload: ChatSessionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatSessionRead:
    session = ChatSession(
        user_id=current_user.id,
        title=payload.title or "Nova conversa",
        brand_slug=payload.brand_slug,
        status="active",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_read(session)


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatSessionDetail:
    session = await _get_session_or_404(db, session_id, current_user)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
    )
    return ChatSessionDetail(
        **_session_read(session).model_dump(),
        messages=[_message_read(message) for message in result.scalars().all()],
    )


@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def create_message(
    session_id: int,
    payload: ChatMessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageResponse:
    session = await _get_session_or_404(db, session_id, current_user)
    brand_slug = payload.brand_slug or session.brand_slug
    if brand_slug and session.brand_slug != brand_slug:
        session.brand_slug = brand_slug

    message = ChatMessage(
        session_id=session.id,
        role="user",
        content=payload.content,
        metadata_json={"brand_slug": brand_slug},
    )
    db.add(message)
    await db.flush()

    task = AgentTask(
        session_id=session.id,
        user_id=current_user.id,
        brand_slug=brand_slug,
        task_type="orchestrate",
        status="queued",
        input=payload.content,
    )
    db.add(task)
    await db.flush()
    message.agent_task_id = task.id
    await add_task_log(db, task.id, "Tarefa classificada e enfileirada.")
    if session.title == "Nova conversa":
        session.title = payload.content[:80]
    await db.commit()
    await db.refresh(message)
    await db.refresh(task)

    async_result = execute_agent_task_celery.delay(task.id)
    task.celery_task_id = async_result.id
    await db.commit()
    await db.refresh(task)

    return ChatMessageResponse(message=_message_read(message), task=await _task_read(db, task))
