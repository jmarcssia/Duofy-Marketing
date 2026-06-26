import pytest

from app import task_service
from app.models import AgentTask


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _Result:
    def __init__(self, obj):
        self._obj = obj

    def scalar_one(self):
        return self._obj


class _FakeSession:
    def __init__(self, task):
        self._task = task

    async def execute(self, *args, **kwargs):
        return _Result(self._task)

    def add(self, obj):
        pass

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass


@pytest.mark.anyio
async def test_execute_agent_task_runs_orchestrator(monkeypatch):
    async def fake_run(db, *, task_id, brand_slug, user_message, log):
        await log("passo de teste")
        return f"resposta para: {user_message}"

    monkeypatch.setattr(task_service, "run_orchestrator", fake_run)

    task = AgentTask(
        id=1,
        session_id=None,
        user_id=None,
        brand_slug="duofy_solucoes",
        task_type="orchestrate",
        status="queued",
        input="escreva um post",
    )
    db = _FakeSession(task)

    result = await task_service.execute_agent_task(db, 1)

    assert result.status == "completed"
    assert "escreva um post" in result.result
