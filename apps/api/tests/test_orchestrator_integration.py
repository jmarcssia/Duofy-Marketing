import pytest

from app import task_service
from app.db import AsyncSessionLocal
from app.models import AgentTask


@pytest.mark.anyio
async def test_execute_agent_task_runs_orchestrator(monkeypatch):
    async def fake_run(db, *, task_id, brand_slug, user_message, log):
        await log("passo de teste")
        return f"resposta para: {user_message}"

    monkeypatch.setattr(task_service, "run_orchestrator", fake_run)

    async with AsyncSessionLocal() as db:
        task = AgentTask(
            session_id=None, user_id=None, brand_slug="duofy_solucoes",
            task_type="orchestrate", status="queued", input="escreva um post",
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        result = await task_service.execute_agent_task(db, task.id)

    assert result.status == "completed"
    assert "escreva um post" in result.result
