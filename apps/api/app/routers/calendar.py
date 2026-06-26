from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.calendar_service import (
    create_calendar_event,
    execute_calendar_event,
    generate_calendar_events,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.llm import LLMConfigurationError
from app.models import CalendarEvent, User
from app.schemas import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarGenerateRequest,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _event_read(event: CalendarEvent) -> CalendarEventRead:
    return CalendarEventRead(
        id=event.id,
        brand_slug=event.brand_slug,
        category=event.category,
        title=event.title,
        description=event.description,
        event_type=event.event_type,
        status=event.status,
        channel=event.channel,
        format=event.format,
        start_at=event.start_at,
        end_at=event.end_at,
        assigned_agent_slug=event.assigned_agent_slug,
        execution_payload=event.execution_payload,
        output_id=event.output_id,
        agent_run_id=event.agent_run_id,
        last_error=event.last_error,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


async def _get_event_or_404(db: AsyncSession, event_id: int) -> CalendarEvent:
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento nao encontrado.")
    return event


@router.get("", response_model=list[CalendarEventRead])
async def list_calendar_events(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    event_type: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    start: datetime | None = None,
    end: datetime | None = None,
    include_cancelled: bool = False,
    limit: Annotated[int, Query(ge=1, le=300)] = 150,
) -> list[CalendarEventRead]:
    statement = select(CalendarEvent)
    if brand_slug:
        statement = statement.where(CalendarEvent.brand_slug == brand_slug)
    if event_type:
        statement = statement.where(CalendarEvent.event_type == event_type)
    if status_filter:
        statement = statement.where(CalendarEvent.status == status_filter)
    elif not include_cancelled:
        statement = statement.where(CalendarEvent.status != "cancelled")
    if start:
        statement = statement.where(CalendarEvent.start_at >= start)
    if end:
        statement = statement.where(CalendarEvent.start_at <= end)
    statement = statement.order_by(CalendarEvent.start_at.asc()).limit(limit)
    result = await db.execute(statement)
    return [_event_read(event) for event in result.scalars().all()]


@router.post("", response_model=CalendarEventRead)
async def create_event(
    payload: CalendarEventCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    try:
        event = await create_calendar_event(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.event_created",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug=event.assigned_agent_slug,
        summary=f"Evento criado: {event.title}",
        metadata={"event_type": event.event_type},
    )
    await db.commit()
    return _event_read(event)


@router.patch("/{event_id}", response_model=CalendarEventRead)
async def update_event(
    event_id: int,
    payload: CalendarEventUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.event_updated",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug=event.assigned_agent_slug,
        summary=f"Evento atualizado: {event.title}",
        metadata={"fields": list(payload.model_dump(exclude_unset=True).keys())},
    )
    await db.commit()
    await db.refresh(event)
    return _event_read(event)


@router.delete("/{event_id}", response_model=CalendarEventRead)
async def cancel_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id)
    event.status = "cancelled"
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.event_cancelled",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug=event.assigned_agent_slug,
        summary=f"Evento cancelado: {event.title}",
    )
    await db.commit()
    await db.refresh(event)
    return _event_read(event)


@router.post("/generate", response_model=list[CalendarEventRead])
async def generate_events(
    payload: CalendarGenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CalendarEventRead]:
    try:
        events = await generate_calendar_events(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao gerar calendario: {exc}",
        ) from exc
    for event in events:
        await record_audit_event(
            db,
            user=current_user,
            action="calendar.event_generated",
            entity_type="calendar_event",
            entity_id=event.id,
            status=event.status,
            brand_slug=event.brand_slug,
            agent_slug=event.assigned_agent_slug or "calendar_agent",
            summary=f"Evento gerado: {event.title}",
            metadata={"objective": payload.objective},
        )
    await db.commit()
    return [_event_read(event) for event in events]


@router.post("/{event_id}/run-now", response_model=CalendarEventRead)
async def run_event_now(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id)
    event.status = "in_progress"
    await db.commit()
    await db.refresh(event)
    event = await execute_calendar_event(db, event)
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.event_executed",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug=event.assigned_agent_slug,
        summary=f"Evento executado: {event.title}",
        metadata={"output_id": event.output_id, "agent_run_id": event.agent_run_id},
    )
    await db.commit()
    return _event_read(event)
