from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentLog, AgentTask, ChatMessage
from app.orchestrator_graph import run_orchestrator

if TYPE_CHECKING:
    from app.schemas import AgentTaskRead


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
    # Roll back any poisoned transaction before writing the failure record.
    # A DB error inside a tool leaves the session in a failed-transaction state;
    # without this rollback the subsequent db.commit() would raise PendingRollbackError
    # and the task would never be marked failed.
    try:
        await db.rollback()
    except Exception:
        pass

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


# ---------------------------------------------------------------------------
# Handlers por tipo de tarefa. Cada handler roda o trabalho pesado (LLM) e
# devolve (texto_resultado, output_type, output_id). Os serviços de pesquisa e
# cocriação já commitam o Output internamente, então o Guardião — que roda em
# sessão própria — enxerga o Output recém-criado. Imports são lazy para evitar
# ciclos (research_service/cocreation_service importam muitos módulos) e mantêm
# os alvos monkeypatch-áveis pelo caminho do módulo de origem.
# ---------------------------------------------------------------------------


async def _handle_orchestrate(
    db: AsyncSession, task: AgentTask, log
) -> tuple[str, str | None, int | None]:
    answer = await run_orchestrator(
        db,
        task_id=task.id,
        brand_slug=demo_brand_slug(task.brand_slug),
        user_message=task.input,
        log=log,
    )
    return answer, "orchestrator", None


async def _handle_research(
    db: AsyncSession, task: AgentTask, log
) -> tuple[str, str | None, int | None]:
    from app.quality_guardian import run_guardian_after_generation
    from app.research_service import run_market_research
    from app.schemas import ResearchRunRequest

    params = dict(task.metadata_json or {})
    params.setdefault("brand_slug", task.brand_slug)
    request = ResearchRunRequest(**params)
    await log(f"Pesquisando: {request.theme}")
    output = await run_market_research(db, request)  # commita o Output internamente
    await run_guardian_after_generation(db, output)  # sessão própria, best-effort
    await log(f"Pesquisa #{output.id} concluida.")
    return (
        f"Pesquisa concluida. Relatorio #{output.id} salvo (ver em /research).",
        "research",
        output.id,
    )


async def _handle_cocreation(
    db: AsyncSession, task: AgentTask, log
) -> tuple[str, str | None, int | None]:
    from app.cocreation_service import generate_content_package
    from app.quality_guardian import run_guardian_after_generation
    from app.schemas import CreationRequest

    params = dict(task.metadata_json or {})
    params.setdefault("brand_slug", task.brand_slug)
    request = CreationRequest(**params)
    await log(f"Cocriando: {request.format} / {request.channel}")
    output, _version, _package, _warnings = await generate_content_package(db, request)
    await run_guardian_after_generation(db, output)
    await log(f"Conteudo #{output.id} criado.")
    return (
        f"Conteudo cocriado. Pacote #{output.id} salvo (ver em /content).",
        "cocreation",
        output.id,
    )


async def _handle_refine(
    db: AsyncSession, task: AgentTask, log
) -> tuple[str, str | None, int | None]:
    from app.cocreation_service import refine_content_package
    from app.quality_guardian import run_guardian_after_generation
    from app.schemas import CocreationRefineRequest

    params = dict(task.metadata_json or {})
    output_id = int(params.pop("output_id"))
    request = CocreationRefineRequest(**params)
    await log(f"Refinando conteudo #{output_id}")
    output, version, _package, _warnings = await refine_content_package(db, output_id, request)
    await run_guardian_after_generation(db, output)
    await log(f"Conteudo #{output.id} refinado (v{version.version_number}).")
    return (
        f"Refino concluido. Pacote #{output.id} atualizado (ver em /content).",
        "cocreation",
        output.id,
    )


# "orchestrate" é o token da fila do chat; os demais são enfileirados pelos
# endpoints *-async de research/cocreation. task_type desconhecido cai no
# orquestrador (compatibilidade com tarefas legadas).
_TASK_HANDLERS = {
    "orchestrate": _handle_orchestrate,
    "research": _handle_research,
    "cocreation": _handle_cocreation,
    "refine": _handle_refine,
}


async def execute_agent_task(db: AsyncSession, task_id: int) -> AgentTask:
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one()
    task.status = "running"
    await add_task_log(db, task.id, "Tarefa iniciada pelo worker.")
    await db.commit()
    await db.refresh(task)

    async def log(message: str) -> None:
        await add_task_log(db, task.id, message)
        await db.commit()

    handler = _TASK_HANDLERS.get(task.task_type, _handle_orchestrate)
    try:
        answer, output_type, output_id = await handler(db, task, log)
        return await _complete_task(db, task, answer, output_type, output_id)
    except Exception as exc:
        return await _fail_task(db, task, exc)


async def enqueue_agent_task(
    db: AsyncSession,
    *,
    task_type: str,
    input_text: str,
    user_id: int | None = None,
    brand_slug: str | None = None,
    params: dict | None = None,
    session_id: int | None = None,
) -> AgentTask:
    """Cria uma AgentTask 'queued', persiste-a e a despacha para o worker Celery.

    Retorna imediatamente (a requisição não espera o LLM): o cliente acompanha por
    ``GET /api/tasks/{id}`` ou pelo SSE ``/api/tasks/{id}/stream``. É assim que os
    endpoints *-async eliminam o teto de timeout do proxy nas cargas de LLM longas.
    """
    task = AgentTask(
        session_id=session_id,
        user_id=user_id,
        brand_slug=brand_slug,
        task_type=task_type,
        status="queued",
        input=input_text,
        metadata_json=params or None,
    )
    db.add(task)
    await db.flush()
    await add_task_log(db, task.id, f"Tarefa '{task_type}' enfileirada.")
    await db.commit()
    await db.refresh(task)

    # Import lazy: evita o ciclo task_service <-> worker (worker importa task_service no topo).
    from app.worker import execute_agent_task_celery

    async_result = execute_agent_task_celery.delay(task.id)
    task.celery_task_id = async_result.id
    await db.commit()
    await db.refresh(task)
    return task


async def read_agent_task(db: AsyncSession, task: AgentTask) -> AgentTaskRead:
    """Serializa uma AgentTask + seus logs no schema de leitura (fonte única de verdade)."""
    from app.schemas import AgentLogRead, AgentTaskRead

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
        logs=[
            AgentLogRead(
                id=log.id,
                task_id=log.task_id,
                level=log.level,
                message=log.message,
                metadata_json=log.metadata_json,
                created_at=log.created_at,
            )
            for log in result.scalars().all()
        ],
    )
