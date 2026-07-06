from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from unicodedata import combining, normalize

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import brand_voice_section, read_agent_prompt
from app.agent_limits import get_token_budget
from app.content_generation import generate_content_output
from app.document_formatting import normalize_document_content
from app.llm import LLMConfigurationError, call_llm, provider_for_model
from app.models import (
    Agent,
    AgentRun,
    Brand,
    CalendarEvent,
    Output,
    OutputVersion,
    ProviderCredential,
)
from app.orchestrator import run_agent
from app.rag import build_rag_context
from app.research_service import run_market_research
from app.schemas import (
    CalendarEventCreate,
    CalendarGenerateRequest,
    ContentGenerateRequest,
    PressGenerateRequest,
    ResearchRunRequest,
)

logger = logging.getLogger(__name__)

# O Calendário deixou de ser um agente: virou módulo do usuário + ferramenta do
# Orquestrador. Eventos são executados por estes agentes de conteúdo/pesquisa/imprensa.
AGENT_SLUGS = {"content_agent", "press_agent", "research_agent"}
EVENT_STATUSES = {"planned", "scheduled", "in_progress", "completed", "cancelled", "failed"}
PRESS_FORMATS = {"press_release", "pauta", "comunicado", "editorial_angle", "approach"}


def _plain_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def _system_prompt(agent_prompt: str, brand_slug: str | None = None) -> str:
    return "\n".join(
        [
            agent_prompt,
            "",
            "Contexto operacional:",
            f"- Data atual do sistema: {datetime.now(UTC).date().isoformat()}.",
            "- Use portugues do Brasil.",
            "- Nao publique nem envie nada externamente.",
            brand_voice_section(brand_slug),
        ]
    )


async def _get_brand(db: AsyncSession, brand_slug: str) -> Brand:
    result = await db.execute(select(Brand).where(Brand.slug == brand_slug))
    brand = result.scalar_one_or_none()
    if brand is None or not brand.is_active:
        raise LLMConfigurationError("Marca nao encontrada ou inativa.")
    return brand


async def _get_agent(db: AsyncSession, slug: str) -> Agent:
    result = await db.execute(select(Agent).where(Agent.slug == slug))
    agent = result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError(f"Agente {slug} nao encontrado ou inativo.")
    return agent


async def _get_credential(
    db: AsyncSession,
    agent: Agent,
    provider_override: str | None,
    model_override: str | None,
) -> tuple[ProviderCredential, str, str]:
    model = model_override or agent.default_model
    provider = provider_override or provider_for_model(model)
    result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )
    return credential, provider, model


def _derive_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        cleaned = line.strip().strip("#").strip()
        if cleaned:
            return cleaned[:255]
    return fallback[:255]


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMConfigurationError(
            "O agente de calendario nao retornou JSON valido. Tente gerar novamente."
        ) from exc
    if not isinstance(parsed, list):
        raise LLMConfigurationError(
            "O agente de calendario nao retornou uma lista de eventos."
        )
    return [item for item in parsed if isinstance(item, dict)]


def _parse_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        normalized = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            # Data malformada vinda do LLM degrada para a data base do periodo
            # em vez de derrubar o batch inteiro.
            return fallback
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=fallback.tzinfo)
        return parsed
    return fallback


# Tipos de evento que têm etapa de pesquisa (e, portanto, podem gatear a cocriação
# pela aprovação). Mantido alinhado a calendar_workflow.RESEARCH_EVENT_TYPES.
_RESEARCH_EVENT_TYPES = {"research", "pesquisa"}


def _event_create_to_model(payload: CalendarEventCreate) -> CalendarEvent:
    return CalendarEvent(**payload.model_dump())


async def create_calendar_event(
    db: AsyncSession, payload: CalendarEventCreate, created_by: int | None = None
) -> CalendarEvent:
    await _get_brand(db, payload.brand_slug)
    if payload.assigned_agent_slug and payload.assigned_agent_slug not in AGENT_SLUGS:
        raise LLMConfigurationError("Agente atribuido nao suportado pelo calendario.")
    event = _event_create_to_model(payload)
    # Sem etapa de pesquisa não há aprovação a exigir: o gate só se aplica a eventos
    # de pesquisa. Evita que um evento de conteúdo nasça travado (beco sem saída).
    if event.event_type not in _RESEARCH_EVENT_TYPES:
        event.requires_research_approval = False
    event.created_by = created_by
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def generate_calendar_events(
    db: AsyncSession,
    payload: CalendarGenerateRequest,
) -> list[CalendarEvent]:
    brand = await _get_brand(db, payload.brand_slug)
    # Calendário é módulo do Orquestrador: usa o provider/modelo do orchestrator,
    # mas o prompt e o limite do módulo (chaves "calendar_agent" em config).
    agent = await _get_agent(db, "orchestrator")
    credential, _provider, model = await _get_credential(db, agent, payload.provider, payload.model)
    agent_prompt = read_agent_prompt("calendar_agent")
    rag_context = await build_rag_context(
        db=db,
        query=payload.objective,
        brand_slug=payload.brand_slug,
        category=payload.category if payload.category != "all" else None,
        limit=6,
    )
    user_prompt = "\n".join(
        [
            "Crie um calendario editorial em JSON.",
            "",
            "Marca:",
            f"- Nome: {brand.name}",
            f"- Slug: {brand.slug}",
            f"- Nicho: {brand.niche}",
            f"- Descricao: {brand.description}",
            "",
            "Pedido:",
            f"- Categoria: {payload.category}",
            f"- Objetivo: {payload.objective}",
            f"- Periodo inicial: {payload.period_start.isoformat()}",
            f"- Periodo final: {payload.period_end.isoformat()}",
            "- Canais preferidos: "
            f"{', '.join(payload.channels) if payload.channels else 'nao informado'}",
            "",
            "Contexto RAG:",
            rag_context or "Nenhum contexto RAG relevante encontrado.",
            "",
            "Responda exclusivamente com lista JSON de 3 a 8 eventos.",
        ]
    )
    budget = await get_token_budget(db, "calendar_agent")
    try:
        llm_result = await call_llm(
            credential=credential,
            model=model,
            system_prompt=_system_prompt(agent_prompt, brand.slug),
            user_prompt=user_prompt,
            task_type="calendar_generation",
            agent_slug="calendar",
            brand_slug=brand.slug,
            max_tokens=budget,
        )
        run = AgentRun(
            agent_slug="calendar",
            provider=llm_result.provider,
            model=llm_result.model,
            prompt=user_prompt,
            output=llm_result.output,
            status="completed",
        )
        db.add(run)
        await db.flush()
        event_dicts = _extract_json_array(llm_result.output)[:8]
        events: list[CalendarEvent] = []
        for item in event_dicts:
            assigned_agent = item.get("assigned_agent_slug")
            if assigned_agent not in AGENT_SLUGS:
                assigned_agent = None
            event = CalendarEvent(
                brand_slug=payload.brand_slug,
                category=payload.category,
                title=str(item.get("title") or "Evento editorial")[:255],
                description=str(item.get("description") or ""),
                event_type=str(item.get("event_type") or "content")[:80],
                status=str(item.get("status") or ("scheduled" if assigned_agent else "planned")),
                channel=str(item["channel"])[:80] if item.get("channel") else None,
                format=str(item["format"])[:80] if item.get("format") else None,
                start_at=_parse_datetime(item.get("start_at"), payload.period_start),
                end_at=_parse_datetime(item.get("end_at"), payload.period_start)
                if item.get("end_at")
                else None,
                assigned_agent_slug=assigned_agent,
                execution_payload=item.get("execution_payload")
                if isinstance(item.get("execution_payload"), dict)
                else {"briefing": item.get("description") or payload.objective},
                agent_run_id=run.id,
            )
            if event.status not in EVENT_STATUSES:
                event.status = "scheduled" if assigned_agent else "planned"
            db.add(event)
            events.append(event)
        if not events:
            raise LLMConfigurationError("O agente nao retornou eventos validos.")
        await db.commit()
        for event in events:
            await db.refresh(event)
        return events
    except Exception:
        await db.rollback()
        raise


async def generate_press_output(
    db: AsyncSession,
    payload: PressGenerateRequest,
) -> Output:
    brand = await _get_brand(db, payload.brand_slug)
    agent = await _get_agent(db, "press_agent")
    credential, _provider, model = await _get_credential(db, agent, payload.provider, payload.model)
    agent_prompt = read_agent_prompt("press_agent")
    rag_context = await build_rag_context(
        db=db,
        query=payload.briefing,
        brand_slug=payload.brand_slug,
        category=payload.category if payload.category != "all" else None,
        limit=8,
    )
    user_prompt = "\n".join(
        [
            "Gere uma entrega de assessoria de imprensa.",
            "",
            "Marca:",
            f"- Nome: {brand.name}",
            f"- Slug: {brand.slug}",
            f"- Nicho: {brand.niche}",
            f"- Descricao: {brand.description}",
            "",
            "Pedido:",
            f"- Categoria RAG: {payload.category}",
            f"- Formato: {payload.format}",
            f"- Briefing: {payload.briefing}",
            "",
            "Contexto RAG recuperado:",
            rag_context or "Nenhum contexto RAG relevante encontrado.",
            "",
            "Regras finais:",
            "- Entregue texto editavel em Markdown.",
            "- Nao use dados inventados.",
            "- Aponte lacunas de fonte quando necessario.",
        ]
    )
    budget = await get_token_budget(db, "press_agent")
    try:
        llm_result = await call_llm(
            credential=credential,
            model=model,
            system_prompt=_system_prompt(agent_prompt, brand.slug),
            user_prompt=user_prompt,
            task_type="press_generation",
            task_id=payload.event_id,
            agent_slug=agent.slug,
            brand_slug=brand.slug,
            max_tokens=budget,
        )
        title = _derive_title(llm_result.output, payload.format)
        normalized_output = normalize_document_content(
            title=title,
            brand_slug=brand.slug,
            category=payload.category,
            channel="Assessoria",
            content_format=payload.format,
            briefing=payload.briefing,
            content=llm_result.output,
            source_label="press_agent",
        )
        run = AgentRun(
            agent_slug=agent.slug,
            provider=llm_result.provider,
            model=llm_result.model,
            prompt=user_prompt,
            output=normalized_output,
            status="completed",
        )
        db.add(run)
        await db.flush()
        output = Output(
            brand_slug=brand.slug,
            category=payload.category,
            channel="Assessoria",
            format=payload.format,
            title=_derive_title(normalized_output, payload.format),
            briefing=payload.briefing,
            status=payload.status,
            provider=llm_result.provider,
            model=llm_result.model,
            agent_run_id=run.id,
        )
        db.add(output)
        await db.flush()
        version = OutputVersion(
            output_id=output.id,
            version_number=1,
            content=normalized_output,
            editor_note="Geração inicial do press_agent.",
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id

        if payload.event_id is not None:
            event_result = await db.execute(
                select(CalendarEvent).where(CalendarEvent.id == payload.event_id)
            )
            event = event_result.scalar_one_or_none()
            if event is not None:
                event.output_id = output.id
                event.agent_run_id = run.id

        await db.commit()
        await db.refresh(output)
        return output
    except Exception:
        await db.rollback()
        raise


def _press_format(value: str | None) -> str:
    normalized = _plain_text(value or "")
    if "release" in normalized:
        return "press_release"
    if "comunicado" in normalized:
        return "comunicado"
    if "angulo" in normalized or "editorial" in normalized:
        return "editorial_angle"
    if "abordagem" in normalized or "approach" in normalized:
        return "approach"
    return "pauta"


async def execute_calendar_event(db: AsyncSession, event: CalendarEvent) -> CalendarEvent:
    if event.assigned_agent_slug not in AGENT_SLUGS:
        raise LLMConfigurationError("Evento sem agente executável.")

    event_id = event.id  # captura local: db.rollback() no except expira o ORM
    briefing = str(
        (event.execution_payload or {}).get("briefing") or event.description or event.title
    )
    try:
        if event.assigned_agent_slug == "press_agent":
            output = await generate_press_output(
                db,
                PressGenerateRequest(
                    brand_slug=event.brand_slug,
                    category=event.category,
                    format=_press_format(event.format),
                    briefing=briefing,
                    event_id=event.id,
                    status="draft",
                ),
            )
            event.output_id = output.id
        elif event.assigned_agent_slug == "content_agent":
            output = await generate_content_output(
                db,
                ContentGenerateRequest(
                    brand_slug=event.brand_slug,
                    category=event.category,
                    channel=event.channel or "LinkedIn",
                    format=event.format or "Post LinkedIn",
                    briefing=briefing,
                    status="draft",
                ),
            )
            event.output_id = output.id
            event.agent_run_id = output.agent_run_id
        elif event.assigned_agent_slug == "research_agent":
            output = await run_market_research(
                db,
                ResearchRunRequest(
                    brand_slug=event.brand_slug,
                    theme=briefing[:255],
                    period="agenda editorial",
                    depth="quick",
                ),
            )
            event.output_id = output.id
            event.agent_run_id = output.agent_run_id
        else:
            run = await run_agent(
                db=db,
                agent_slug=event.assigned_agent_slug,
                prompt=briefing,
                brand_slug=event.brand_slug,
            )
            event.agent_run_id = run.id

        event.status = "completed"
        event.last_error = None
        await db.commit()
        await db.refresh(event)
        return event
    except Exception as exc:
        await db.rollback()
        result = await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
        failed_event = result.scalar_one()
        failed_event.status = "failed"
        failed_event.last_error = str(exc)
        await db.commit()
        await db.refresh(failed_event)
        logger.exception("Calendar event execution failed: id=%s", event_id)
        return failed_event
