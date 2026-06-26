from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unicodedata import combining, normalize

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar_service import generate_calendar_events, generate_press_output
from app.content_generation import generate_content_output
from app.metrics_service import generate_report
from app.models import AgentLog, AgentTask, ChatMessage, OutputVersion, Report
from app.orchestrator import run_agent
from app.research_service import run_market_research
from app.schemas import (
    CalendarGenerateRequest,
    ContentGenerateRequest,
    PressGenerateRequest,
    ReportGenerateRequest,
    ResearchRunRequest,
)


def normalize_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def classify_task(prompt: str) -> str:
    normalized = normalize_text(prompt)
    if any(word in normalized for word in ["pesquisa", "mercado", "concorrente", "tendencia"]):
        return "research"
    if any(word in normalized for word in ["calendario", "agenda", "agendar", "cronograma"]):
        return "calendar"
    if any(word in normalized for word in ["release", "imprensa", "pauta", "comunicado"]):
        return "press"
    if any(word in normalized for word in ["custo", "token", "metrica", "relatorio interno"]):
        return "metrics"
    if any(
        word in normalized
        for word in ["post", "conteudo", "carrossel", "linkedin", "instagram"]
    ):
        return "content"
    return "general"


def demo_brand_slug(brand_slug: str | None) -> str:
    return brand_slug or "duofy_solucoes"


async def add_task_log(
    db: AsyncSession,
    task_id: int,
    message: str,
    level: str = "info",
    metadata: dict | None = None,
) -> None:
    db.add(
        AgentLog(
            task_id=task_id,
            level=level,
            message=message,
            metadata_json=metadata,
        )
    )
    await db.flush()


async def _current_output_content(db: AsyncSession, output_id: int) -> str:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output_id)
        .order_by(OutputVersion.version_number.desc())
    )
    version = result.scalars().first()
    return version.content if version else ""


async def _complete_task(
    db: AsyncSession,
    task: AgentTask,
    result: str,
    output_type: str | None = None,
    output_id: int | None = None,
) -> AgentTask:
    task.status = "completed"
    task.result = result
    task.output_type = output_type
    task.output_id = output_id
    await add_task_log(db, task.id, "Tarefa concluida.")
    if task.session_id is not None:
        db.add(
            ChatMessage(
                session_id=task.session_id,
                role="assistant",
                content=result,
                agent_task_id=task.id,
                metadata_json={"output_type": output_type, "output_id": output_id},
            )
        )
    await db.commit()
    await db.refresh(task)
    return task


async def _fail_task(db: AsyncSession, task: AgentTask, exc: Exception) -> AgentTask:
    task.status = "failed"
    task.error = str(exc)
    task.result = f"Falha ao executar a tarefa: {exc}"
    await add_task_log(db, task.id, str(exc), level="error")
    if task.session_id is not None:
        db.add(
            ChatMessage(
                session_id=task.session_id,
                role="assistant",
                content=task.result,
                agent_task_id=task.id,
                metadata_json={"error": str(exc)},
            )
        )
    await db.commit()
    await db.refresh(task)
    return task


async def execute_agent_task(db: AsyncSession, task_id: int) -> AgentTask:
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one()
    task.status = "running"
    await add_task_log(db, task.id, "Tarefa iniciada pelo worker.")
    await db.commit()
    await db.refresh(task)

    brand_slug = demo_brand_slug(task.brand_slug)
    prompt = task.input

    try:
        if task.task_type == "research":
            await add_task_log(db, task.id, "Executando pesquisa de mercado.")
            output = await run_market_research(
                db,
                ResearchRunRequest(
                    brand_slug=brand_slug,
                    theme=prompt[:255],
                    period="ultimos 30 dias",
                    depth="quick",
                ),
            )
            content = await _current_output_content(db, output.id)
            return await _complete_task(db, task, content, "output", output.id)

        if task.task_type == "content":
            await add_task_log(db, task.id, "Gerando conteudo estruturado.")
            output = await generate_content_output(
                db,
                ContentGenerateRequest(
                    brand_slug=brand_slug,
                    category="general",
                    channel="LinkedIn",
                    format="Post LinkedIn",
                    briefing=prompt,
                    status="draft",
                ),
            )
            content = await _current_output_content(db, output.id)
            return await _complete_task(db, task, content, "output", output.id)

        if task.task_type == "press":
            await add_task_log(db, task.id, "Gerando material de assessoria.")
            output = await generate_press_output(
                db,
                PressGenerateRequest(
                    brand_slug=brand_slug,
                    category="general",
                    format="pauta",
                    briefing=prompt,
                    status="draft",
                ),
            )
            content = await _current_output_content(db, output.id)
            return await _complete_task(db, task, content, "output", output.id)

        if task.task_type == "calendar":
            await add_task_log(db, task.id, "Criando calendario editorial.")
            now = datetime.now(UTC)
            events = await generate_calendar_events(
                db,
                CalendarGenerateRequest(
                    brand_slug=brand_slug,
                    category="general",
                    objective=prompt,
                    period_start=now,
                    period_end=now + timedelta(days=14),
                    channels=["LinkedIn", "Instagram", "Assessoria"],
                ),
            )
            summary = "\n".join(
                f"- {event.title} ({event.start_at.date().isoformat()})" for event in events
            )
            return await _complete_task(db, task, summary, "calendar", events[0].id)

        if task.task_type == "metrics":
            await add_task_log(db, task.id, "Gerando relatorio interno de metricas.")
            report = await generate_report(
                db,
                ReportGenerateRequest(
                    title="Relatorio gerado pelo chat",
                    report_type="internal_metrics",
                    brand_slug=task.brand_slug,
                ),
            )
            if isinstance(report, Report):
                return await _complete_task(db, task, report.content, "report", report.id)

        await add_task_log(db, task.id, "Executando orquestrador geral.")
        run = await run_agent(
            db=db,
            agent_slug="orchestrator",
            prompt=prompt,
            brand_slug=brand_slug,
        )
        return await _complete_task(db, task, run.output, "agent_run", run.id)
    except Exception as exc:
        return await _fail_task(db, task, exc)
