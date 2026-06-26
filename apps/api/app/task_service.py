from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentLog, AgentTask, ChatMessage
from app.orchestrator_graph import run_orchestrator


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


async def execute_agent_task(db: AsyncSession, task_id: int) -> AgentTask:
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one()
    task.status = "running"
    await add_task_log(db, task.id, "Tarefa iniciada pelo worker.")
    await db.commit()
    await db.refresh(task)

    brand_slug = demo_brand_slug(task.brand_slug)

    async def log(message: str) -> None:
        await add_task_log(db, task.id, message)
        await db.commit()

    try:
        answer = await run_orchestrator(
            db,
            task_id=task.id,
            brand_slug=brand_slug,
            user_message=task.input,
            log=log,
        )
        return await _complete_task(db, task, answer, "orchestrator", None)
    except Exception as exc:
        return await _fail_task(db, task, exc)
