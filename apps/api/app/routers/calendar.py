from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import accessible_brands, assert_brand_access
from app.audit_service import record_audit_event
from app.calendar_ics import build_ics
from app.calendar_service import (
    create_calendar_event,
    execute_calendar_event,
    generate_calendar_events,
)
from app.calendar_workflow import (
    event_detail,
    execute_cocreation,
    execute_publish,
    execute_research,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.errors import InsufficientSourcesError
from app.llm import LLMConfigurationError
from app.models import CalendarEvent, User
from app.publishers import PublisherError, PublisherNotConfigured
from app.schemas import (
    CalendarEventCreate,
    CalendarEventDetail,
    CalendarEventRead,
    CalendarEventUpdate,
    CalendarGenerateRequest,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _event_read(event: CalendarEvent) -> CalendarEventRead:
    return CalendarEventRead.model_validate(event, from_attributes=True)


async def _get_event_or_404(
    db: AsyncSession,
    event_id: int,
    brand_slug: str | None = None,
    user: User | None = None,
) -> CalendarEvent:
    """Carrega o evento e impede acesso cross-brand (IDOR).

    Quando `brand_slug` é fornecido, o evento precisa pertencer àquela marca; um mismatch
    responde 404 (não vaza existência de eventos de outras marcas). As rotas sensíveis do
    workflow exigem `brand_slug`; as rotas genéricas o verificam quando enviado.
    """
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None or (brand_slug is not None and event.brand_slug != brand_slug):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento nao encontrado.")
    if user is not None:  # C1: o usuário precisa ter a marca do evento no escopo
        assert_brand_access(user, event.brand_slug)
    return event


@router.get("", response_model=list[CalendarEventRead])
async def list_calendar_events(
    current_user: Annotated[User, Depends(get_current_user)],
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
    allowed = accessible_brands(current_user)  # C1: restringe às marcas do usuário
    if allowed is not None:
        statement = statement.where(CalendarEvent.brand_slug.in_(allowed))
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


@router.get("/export.ics")
async def export_calendar_ics(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
) -> Response:
    statement = select(CalendarEvent).where(CalendarEvent.status != "cancelled")
    allowed = accessible_brands(current_user)  # C1
    if allowed is not None:
        statement = statement.where(CalendarEvent.brand_slug.in_(allowed))
    if brand_slug:
        statement = statement.where(CalendarEvent.brand_slug == brand_slug)
    statement = statement.order_by(CalendarEvent.start_at.asc()).limit(500)
    result = await db.execute(statement)
    events = list(result.scalars().all())
    name = f"Duofy — {brand_slug}" if brand_slug else "Duofy — Calendário Editorial"
    ics = build_ics(events, name)
    filename = f"duofy-calendario{('-' + brand_slug) if brand_slug else ''}.ics"
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=CalendarEventRead)
async def create_event(
    payload: CalendarEventCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    assert_brand_access(current_user, payload.brand_slug)  # C1
    try:
        event = await create_calendar_event(db, payload, created_by=current_user.id)
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
    brand_slug: str | None = None,
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
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
    brand_slug: str | None = None,
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
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
    assert_brand_access(current_user, payload.brand_slug)  # C1
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
            agent_slug=event.assigned_agent_slug or "calendar",
            summary=f"Evento gerado: {event.title}",
            metadata={"objective": payload.objective},
        )
    await db.commit()
    return [_event_read(event) for event in events]


@router.get("/{event_id}", response_model=CalendarEventDetail)
async def get_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
) -> CalendarEventDetail:
    """Detalhe do evento com o pipeline derivado (Briefing→Pesquisa→Aprovação→…).

    `brand_slug` é obrigatório e verificado (isolamento por marca / anti-IDOR)."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    return await event_detail(db, event)


@router.post("/{event_id}/execute-research", response_model=CalendarEventDetail)
async def execute_research_endpoint(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
) -> CalendarEventDetail:
    """Executa a pesquisa pelo evento (Agente de Pesquisa real) e para em 'aguardando
    aprovação'. `brand_slug` obrigatório e verificado."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    try:
        event = await execute_research(db, event, current_user)
    except InsufficientSourcesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao executar a pesquisa: {exc}",
        ) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.research_executed",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug="research_agent",
        summary=f"Pesquisa executada pelo calendário: {event.title}",
        metadata={"output_id": event.research_output_id, "agent_task_id": event.agent_task_id},
    )
    await db.commit()
    return await event_detail(db, event)


@router.post("/{event_id}/execute-cocreation", response_model=CalendarEventDetail)
async def execute_cocreation_endpoint(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
    channel: str = "Instagram",
    content_format: Annotated[str, Query(alias="format")] = "Carrossel",
) -> CalendarEventDetail:
    """Dispara a cocriação pelo evento (Agente de Cocriação real), gated pela aprovação da
    pesquisa. `brand_slug` obrigatório e verificado."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    try:
        event = await execute_cocreation(db, event, current_user, channel, content_format)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao executar a cocriação: {exc}",
        ) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="calendar.cocreation_executed",
        entity_type="calendar_event",
        entity_id=event.id,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug="content_agent",
        summary=f"Cocriação executada pelo calendário: {event.title}",
        metadata={"output_id": event.content_output_id, "agent_task_id": event.agent_task_id},
    )
    await db.commit()
    return await event_detail(db, event)


@router.post("/{event_id}/publish", response_model=CalendarEventDetail)
async def publish_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
    target: Annotated[str, Query(pattern="^(meta|manual)$")] = "meta",
) -> CalendarEventDetail:
    """Publica a peça aprovada. `meta` ainda não integrada (retorna 400 claro); `manual`
    registra publicação externa. `brand_slug` obrigatório e verificado."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    try:
        event = await execute_publish(db, event, current_user, target)
    except PublisherNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PublisherError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    await record_audit_event(
        db, user=current_user, action="calendar.event_published",
        entity_type="calendar_event", entity_id=event.id, status=event.status,
        brand_slug=event.brand_slug, summary=f"Publicado ({event.publish_target}): {event.title}",
        metadata={"target": event.publish_target, "ref": event.publish_ref},
    )
    await db.commit()
    return await event_detail(db, event)


@router.post("/{event_id}/pause", response_model=CalendarEventDetail)
async def pause_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
) -> CalendarEventDetail:
    """Pausa a automação do evento (o agendador passa a ignorá-lo). `brand_slug` verificado."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    event.is_paused = True
    await record_audit_event(
        db, user=current_user, action="calendar.event_paused",
        entity_type="calendar_event", entity_id=event.id, status=event.status,
        brand_slug=event.brand_slug, summary=f"Automação pausada: {event.title}",
    )
    await db.commit()
    await db.refresh(event)
    return await event_detail(db, event)


@router.post("/{event_id}/resume", response_model=CalendarEventDetail)
async def resume_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: Annotated[str, Query(min_length=2)],
) -> CalendarEventDetail:
    """Retoma a automação do evento. `brand_slug` verificado."""
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
    event.is_paused = False
    await record_audit_event(
        db, user=current_user, action="calendar.event_resumed",
        entity_type="calendar_event", entity_id=event.id, status=event.status,
        brand_slug=event.brand_slug, summary=f"Automação retomada: {event.title}",
    )
    await db.commit()
    await db.refresh(event)
    return await event_detail(db, event)


@router.post("/{event_id}/run-now", response_model=CalendarEventRead)
async def run_event_now(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
) -> CalendarEventRead:
    event = await _get_event_or_404(db, event_id, brand_slug, current_user)
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
