"""Workflow do Calendário: evento como unidade de trabalho.

F1 — pesquisa: criar evento -> executar (reusa o Agente de Pesquisa) -> parar em "aguardando
aprovação" -> aprovação humana no fluxo de outputs existente.
F2 — cocriação: com a pesquisa aprovada, executar a cocriação (reusa o Agente de Cocriação),
consumindo a pesquisa aprovada -> conteúdo entra em revisão.

NÃO duplica Output/AgentTask/Briefing: guarda apenas referências. NÃO cria segundo sistema
de aprovação: os gates leem o status dos Outputs vinculados.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cocreation_service import generate_content_package
from app.llm import LLMConfigurationError
from app.models import AgentTask, CalendarEvent, Output, User
from app.publishers import PublisherError, PublisherNotConfigured, get_publisher
from app.research_service import run_market_research
from app.schemas import (
    CalendarAttempt,
    CalendarEventDetail,
    CalendarStep,
    CreationRequest,
    ResearchRunRequest,
)

logger = logging.getLogger(__name__)

# Pipeline canônico do evento (derivado, não persistido além de current_step).
PIPELINE = [
    ("briefing", "Briefing"),
    ("research", "Pesquisa"),
    ("research_approval", "Aprovação"),
    ("cocreation", "Cocriação"),
    ("review", "Revisão"),
    ("publish", "Publicação"),
]
# Etapas ainda não implementadas (aparecem desabilitadas na UI, não simuladas).
# F1: pesquisa; F2: cocriação; F3: automação; review/publish (Meta) seguem para F4.
FUTURE_STEPS = {"publish"}

RESEARCH_EVENT_TYPES = {"research", "pesquisa"}
APPROVED_STATUS = "approved"


def is_research_event(event: CalendarEvent) -> bool:
    return (
        event.event_type in RESEARCH_EVENT_TYPES
        or event.assigned_agent_slug == "research_agent"
    )


def _research_theme(event: CalendarEvent) -> str:
    """Tema da pesquisa: título é a fonte principal; cai para objetivo/descrição."""
    for candidate in (event.title, event.objective, event.description):
        text = (candidate or "").strip()
        if len(text) >= 3:
            return text[:255]
    raise LLMConfigurationError("Defina um título ou tema com pelo menos 3 caracteres.")


async def _output_status(db: AsyncSession, output_id: int | None) -> str | None:
    if output_id is None:
        return None
    output = await db.get(Output, output_id)
    return output.status if output is not None else None


def build_steps(
    event: CalendarEvent, research_status: str | None, content_status: str | None = None
) -> list[CalendarStep]:
    """Deriva o estado de cada etapa do pipeline a partir do evento + Outputs vinculados."""
    briefing_ready = bool((event.title or "").strip()) and (
        bool((event.objective or "").strip()) or bool((event.description or "").strip())
    )
    research_done = event.research_output_id is not None
    research_approved = research_status == APPROVED_STATUS
    content_done = event.content_output_id is not None
    content_approved = content_status == APPROVED_STATUS

    def step(key: str, label: str) -> CalendarStep:
        if key == "briefing":
            if research_done or event.status not in ("draft", "briefing_incomplete"):
                return CalendarStep(key=key, label=label, status="done")
            return CalendarStep(
                key=key,
                label=label,
                status="current",
                detail=None if briefing_ready else "Preencha tema e objetivo.",
            )
        if key == "research":
            if research_done:
                return CalendarStep(
                    key=key, label=label, status="done",
                    detail=f"Pesquisa #{event.research_output_id}",
                )
            if event.status in ("ready", "scheduled", "running", "in_progress"):
                return CalendarStep(key=key, label=label, status="current")
            return CalendarStep(key=key, label=label, status="pending")
        if key == "research_approval":
            if research_approved:
                return CalendarStep(key=key, label=label, status="done")
            if research_done:
                return CalendarStep(
                    key=key, label=label, status="current",
                    detail="Aprove a pesquisa na página do Agente de Pesquisa.",
                )
            return CalendarStep(key=key, label=label, status="pending")
        if key == "cocreation":
            gate = research_approved or not event.requires_research_approval
            if content_done:
                return CalendarStep(
                    key=key, label=label, status="done",
                    detail=f"Conteúdo #{event.content_output_id}",
                )
            if not gate:
                return CalendarStep(
                    key=key, label=label, status="locked",
                    detail="Liberada após a aprovação da pesquisa.",
                )
            return CalendarStep(
                key=key, label=label, status="current", detail="Pronta para cocriar."
            )
        if key == "review":
            if content_approved:
                return CalendarStep(key=key, label=label, status="done")
            if content_done:
                return CalendarStep(
                    key=key, label=label, status="current",
                    detail="Revise e aprove o conteúdo na página de Cocriação.",
                )
            return CalendarStep(key=key, label=label, status="pending")
        # publish
        if event.publish_status == "published":
            return CalendarStep(
                key=key, label=label, status="done",
                detail=f"Publicado ({event.publish_target or '—'})",
            )
        if content_approved:
            return CalendarStep(
                key=key, label=label, status="current",
                detail="Pronto para publicar (Meta em breve; ou registre manual).",
            )
        return CalendarStep(key=key, label=label, status="pending")

    return [step(key, label) for key, label in PIPELINE]


async def event_history(db: AsyncSession, event: CalendarEvent) -> list[CalendarAttempt]:
    """Histórico de tentativas do evento — derivado dos AgentTask (não duplica).

    Filtra por marca + tipo (research/content) e casa o calendar_event_id no metadata_json.
    """
    rows = (
        await db.execute(
            select(AgentTask)
            .where(
                AgentTask.brand_slug == event.brand_slug,
                AgentTask.task_type.in_(("research", "content")),
            )
            .order_by(desc(AgentTask.id))
            .limit(80)
        )
    ).scalars().all()
    out: list[CalendarAttempt] = []
    for task in rows:
        meta = task.metadata_json or {}
        if meta.get("calendar_event_id") != event.id:
            continue
        out.append(
            CalendarAttempt(
                id=task.id,
                kind="research" if task.task_type == "research" else "content",
                trigger=str(meta.get("trigger", "manual")),
                status=task.status,
                output_id=task.output_id,
                error=task.error,
                created_at=task.created_at,
                updated_at=task.updated_at,
            )
        )
    return out


async def event_detail(db: AsyncSession, event: CalendarEvent) -> CalendarEventDetail:
    research_status = await _output_status(db, event.research_output_id)
    content_status = await _output_status(db, event.content_output_id)
    steps = build_steps(event, research_status, content_status)
    research_approved = research_status == APPROVED_STATUS
    cocreation_unlocked = research_approved or not event.requires_research_approval
    history = await event_history(db, event)
    base = CalendarEventDetail.model_validate(event, from_attributes=True)
    return base.model_copy(
        update={
            "steps": steps,
            "research_output_status": research_status,
            "research_approved": research_approved,
            "cocreation_unlocked": cocreation_unlocked,
            "content_output_status": content_status,
            "content_approved": content_status == APPROVED_STATUS,
            "history": history,
        }
    )


async def execute_research(
    db: AsyncSession, event: CalendarEvent, user: User, trigger: str = "manual"
) -> CalendarEvent:
    """Executa a pesquisa pelo evento reusando o Agente de Pesquisa.

    Cria um AgentTask (unidade de execução), roda run_market_research, vincula o Output e
    para em 'awaiting_approval'. Idempotente: não roda se já estiver em execução.
    """
    if not is_research_event(event):
        raise LLMConfigurationError("Este evento não é de pesquisa.")
    if event.status in ("running", "in_progress"):
        raise LLMConfigurationError("A pesquisa deste evento já está em execução.")

    theme = _research_theme(event)
    depth = "quick"
    period = "últimos 30 dias"
    briefing_filters: dict | None = None
    if isinstance(event.execution_payload, dict):
        depth = str(event.execution_payload.get("depth") or depth)
        period = str(event.execution_payload.get("period") or period)
        raw_filters = event.execution_payload.get("briefing")
        briefing_filters = raw_filters if isinstance(raw_filters, dict) else None
    if depth not in ("quick", "standard", "deep"):
        depth = "quick"

    event_id = event.id  # captura local: rollback expira o ORM
    task = AgentTask(
        user_id=user.id,
        brand_slug=event.brand_slug,
        task_type="research",
        status="running",
        input=theme,
        output_type="research",
        metadata_json={"calendar_event_id": event_id, "source": "calendar", "trigger": trigger},
    )
    db.add(task)
    await db.flush()
    task_id = task.id
    event.status = "running"
    event.current_step = "research"
    event.agent_task_id = task_id
    event.last_error = None
    await db.commit()

    try:
        output = await run_market_research(
            db,
            ResearchRunRequest(
                brand_slug=event.brand_slug,
                theme=theme,
                period=period,
                depth=depth,  # type: ignore[arg-type]
                briefing_filters=briefing_filters,
            ),
        )
    except Exception as exc:  # noqa: BLE001 - registra falha no evento e no task, sem mascarar
        await db.rollback()
        failed = (
            await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
        ).scalar_one()
        failed.status = "failed"
        failed.current_step = "research"
        failed.last_error = str(exc)[:2000]
        failed_task = (
            await db.execute(select(AgentTask).where(AgentTask.id == task_id))
        ).scalar_one_or_none()
        if failed_task is not None:
            failed_task.status = "failed"
            failed_task.error = str(exc)[:2000]
        await db.commit()
        await db.refresh(failed)
        logger.exception("Calendar research execution failed: event=%s", event_id)
        raise

    fresh = (
        await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    ).scalar_one()
    fresh.research_output_id = output.id
    fresh.output_id = output.id
    fresh.agent_run_id = output.agent_run_id
    fresh.status = "awaiting_approval"
    fresh.current_step = "research_approval"
    fresh.last_error = None
    done_task = (
        await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    ).scalar_one_or_none()
    if done_task is not None:
        done_task.status = "completed"
        done_task.output_id = output.id
        done_task.result = f"Pesquisa gerada: Output #{output.id}"
    await db.commit()
    await db.refresh(fresh)
    # F1: Guardião roda automaticamente após a pesquisa do calendário (avaliação, sem aprovar).
    from app.quality_guardian import run_guardian_after_generation

    await run_guardian_after_generation(db, output)
    return fresh


async def execute_cocreation(
    db: AsyncSession,
    event: CalendarEvent,
    user: User,
    channel: str | None = None,
    content_format: str | None = None,
    trigger: str = "manual",
) -> CalendarEvent:
    """Dispara a cocriação pelo evento reusando o Agente de Cocriação.

    Só roda se a pesquisa estiver aprovada (ou o gate desligado). Consome a pesquisa aprovada
    (research_output_id) como contexto — não refaz pesquisa. Cria um AgentTask, vincula o Output
    de conteúdo e avança o pipeline para 'review'. Idempotente: não roda se já estiver em execução.

    Canal/formato: argumento explícito > briefing do evento (execution_payload) > campos do
    evento > defaults (Instagram/Carrossel). O briefing estruturado, os canais extras e as
    peças esperadas gravados no evento seguem para o Agente de Cocriação.
    """
    if event.status in ("running", "in_progress"):
        raise LLMConfigurationError("Este evento já tem uma execução em andamento.")

    payload_dict = event.execution_payload if isinstance(event.execution_payload, dict) else {}
    channel = channel or str(payload_dict.get("channel") or "") or event.channel or "Instagram"
    content_format = (
        content_format
        or str(payload_dict.get("format") or "")
        or event.format
        or "Carrossel"
    )
    raw_channels = payload_dict.get("channels")
    channels = (
        [str(item) for item in raw_channels if str(item).strip()]
        if isinstance(raw_channels, list)
        else []
    )
    raw_pieces = payload_dict.get("pieces")
    pieces = (
        [str(item) for item in raw_pieces if str(item).strip()]
        if isinstance(raw_pieces, list)
        else []
    )
    raw_filters = payload_dict.get("briefing")
    briefing_filters = raw_filters if isinstance(raw_filters, dict) else None
    research_status = await _output_status(db, event.research_output_id)
    gate = research_status == APPROVED_STATUS or not event.requires_research_approval
    if not gate:
        raise LLMConfigurationError(
            "A cocriação só é liberada após a aprovação da pesquisa."
        )

    theme = _research_theme(event)
    event_id = event.id
    task = AgentTask(
        user_id=user.id,
        brand_slug=event.brand_slug,
        task_type="content",
        status="running",
        input=theme,
        output_type="content",
        metadata_json={
            "calendar_event_id": event_id,
            "source": "calendar",
            "kind": "cocreation",
            "trigger": trigger,
        },
    )
    db.add(task)
    await db.flush()
    task_id = task.id
    event.status = "running"
    event.current_step = "cocreation"
    event.agent_task_id = task_id
    event.last_error = None
    await db.commit()

    try:
        output, _version, _pkg, _warnings = await generate_content_package(
            db,
            CreationRequest(
                brand_slug=event.brand_slug,
                theme=theme,
                channel=channel,
                format=content_format,
                category=event.category or "content_generation",
                objetivo=(event.objective or None),
                observacoes=(event.description or None),
                research_output_id=event.research_output_id,
                status="review",
                channels=channels,
                pieces=pieces,
                briefing_filters=briefing_filters,
            ),
        )
    except Exception as exc:  # noqa: BLE001 - registra falha sem mascarar
        await db.rollback()
        failed = (
            await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
        ).scalar_one()
        failed.status = "failed"
        failed.current_step = "cocreation"
        failed.last_error = str(exc)[:2000]
        failed_task = (
            await db.execute(select(AgentTask).where(AgentTask.id == task_id))
        ).scalar_one_or_none()
        if failed_task is not None:
            failed_task.status = "failed"
            failed_task.error = str(exc)[:2000]
        await db.commit()
        await db.refresh(failed)
        logger.exception("Calendar cocreation execution failed: event=%s", event_id)
        raise

    fresh = (
        await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    ).scalar_one()
    fresh.content_output_id = output.id
    fresh.agent_run_id = output.agent_run_id
    fresh.status = "awaiting_approval"
    fresh.current_step = "review"
    fresh.last_error = None
    done_task = (
        await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    ).scalar_one_or_none()
    if done_task is not None:
        done_task.status = "completed"
        done_task.output_id = output.id
        done_task.result = f"Conteúdo gerado: Output #{output.id}"
    await db.commit()
    await db.refresh(fresh)
    # F1: Guardião roda automaticamente após a cocriação do calendário (avaliação, sem aprovar).
    from app.quality_guardian import run_guardian_after_generation

    await run_guardian_after_generation(db, output)
    return fresh


async def execute_publish(
    db: AsyncSession, event: CalendarEvent, user: User, target: str = "meta"
) -> CalendarEvent:
    """Publica a peça aprovada pelo alvo escolhido.

    Gate: só publica conteúdo APROVADO. `meta` é stub (levanta PublisherNotConfigured — não
    finge sucesso); `manual` registra que o gestor publicou por fora. Não faz chamada externa
    real nesta fase.
    """
    if event.content_output_id is None:
        raise LLMConfigurationError("Não há conteúdo para publicar. Faça a cocriação primeiro.")
    content_status = await _output_status(db, event.content_output_id)
    if content_status != APPROVED_STATUS:
        raise LLMConfigurationError(
            "Publique apenas conteúdo aprovado. Aprove o conteúdo na página de Cocriação."
        )
    if event.publish_status == "published":
        raise LLMConfigurationError("Este evento já foi publicado.")

    publisher = get_publisher(target)  # alvo inválido -> PublisherError
    try:
        result = await publisher.publish(event)
    except PublisherNotConfigured:
        raise  # não é falha: é integração ausente -> o router traduz para 400 claro
    except PublisherError:
        event.publish_status = "failed"
        await db.commit()
        await db.refresh(event)
        raise

    event.publish_status = "published"
    event.publish_target = result.target
    event.publish_ref = result.ref
    event.published_at = datetime.now(UTC)
    event.current_step = "publish"
    await db.commit()
    await db.refresh(event)
    return event
