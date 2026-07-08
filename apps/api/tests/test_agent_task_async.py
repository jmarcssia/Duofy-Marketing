"""Item 1 — tarefas de agente ASSÍNCRONAS (AgentTask + poll) para research/cocreation/refine.

Cobre os dois lados do fluxo que elimina o teto de timeout do proxy:
  1. os endpoints ``*-async`` enfileiram uma AgentTask e retornam na hora (status ``queued``);
  2. o worker (``execute_agent_task``) despacha por ``task_type`` e conclui com ``output_id``.

LLM e serviços pesados são mockados (sem rede, sem custo de API) e o dispatch ao Celery é
substituído por um fake (sem broker real).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app import task_service
from app.models import AgentTask, Output

pytestmark = pytest.mark.anyio


class _FakeAsyncResult:
    id = "celery-fake-id"


class _FakeCelery:
    def delay(self, task_id: int) -> _FakeAsyncResult:  # noqa: ARG002 - assinatura do Celery
        return _FakeAsyncResult()


@pytest.fixture
def no_celery(monkeypatch):
    """Enfileira sem despachar ao broker real (nenhum worker roda no teste)."""
    monkeypatch.setattr("app.worker.execute_agent_task_celery", _FakeCelery())


class _StubOutput:
    """Output mínimo (só o que o handler lê) devolvido pelos serviços mockados."""

    def __init__(self, output_id: int) -> None:
        self.id = output_id
        self.brand_slug = "duofy"


class _StubVersion:
    version_number = 2


# --------------------------------------------------------------------------- #
# 1) Endpoints *-async: validam e enfileiram (status queued), sem rodar o LLM.  #
# --------------------------------------------------------------------------- #


async def test_research_run_async_enqueues_and_persists(client, auth_headers, no_celery, db):
    resp = client.post(
        "/api/research/run-async",
        json={"brand_slug": "duofy", "theme": "mercado de tecnologia", "depth": "quick"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["task_type"] == "research"
    assert body["status"] == "queued"
    assert body["metadata_json"]["theme"] == "mercado de tecnologia"
    assert body["celery_task_id"] == "celery-fake-id"

    task = (
        await db.execute(select(AgentTask).where(AgentTask.id == body["id"]))
    ).scalar_one()
    assert task.task_type == "research"
    assert task.status == "queued"
    assert task.metadata_json["depth"] == "quick"


async def test_cocreation_generate_async_enqueues(client, auth_headers, no_celery):
    resp = client.post(
        "/api/cocreation/generate-async",
        json={
            "brand_slug": "duofy",
            "theme": "novo recurso de gestão de marketing",
            "channel": "Instagram",
            "format": "Carrossel",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["task_type"] == "cocreation"
    assert body["status"] == "queued"
    assert body["input"].startswith("novo recurso")


async def test_refine_async_enqueues_for_existing_output(client, auth_headers, no_celery, db):
    output = Output(
        brand_slug="duofy",
        category="content_generation",
        channel="Instagram",
        format="Carrossel",
        title="Peça para refinar",
        briefing="briefing base",
        status="draft",
        provider="openrouter",
        model="openai/gpt-4o-mini",
    )
    db.add(output)
    await db.commit()
    await db.refresh(output)

    resp = client.post(
        f"/api/cocreation/{output.id}/refine-async",
        json={"target": "caption", "instruction": "deixe mais direto"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["task_type"] == "refine"
    assert body["status"] == "queued"
    assert body["metadata_json"]["output_id"] == output.id
    assert body["metadata_json"]["target"] == "caption"


async def test_refine_async_404_for_missing_output(client, auth_headers, no_celery):
    resp = client.post(
        "/api/cocreation/999999/refine-async",
        json={"target": "caption"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_run_async_requires_auth(client, no_celery):
    resp = client.post(
        "/api/research/run-async", json={"brand_slug": "duofy", "theme": "tema qualquer"}
    )
    assert resp.status_code == 401


# --------------------------------------------------------------------------- #
# 2) Worker: execute_agent_task despacha por task_type e conclui com output_id. #
# --------------------------------------------------------------------------- #


async def _run_task(db, task_type: str, metadata: dict) -> AgentTask:
    task = AgentTask(
        task_type=task_type,
        status="queued",
        input="entrada de teste",
        brand_slug="duofy",
        metadata_json=metadata,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return await task_service.execute_agent_task(db, task.id)


async def test_execute_agent_task_dispatches_research(db, monkeypatch):
    async def fake_research(db_, request):
        assert request.theme == "tema pesquisa"
        return _StubOutput(4242)

    async def fake_guardian(db_, output):
        return None

    monkeypatch.setattr("app.research_service.run_market_research", fake_research)
    monkeypatch.setattr("app.quality_guardian.run_guardian_after_generation", fake_guardian)

    result = await _run_task(
        db, "research", {"brand_slug": "duofy", "theme": "tema pesquisa", "depth": "quick"}
    )
    assert result.status == "completed"
    assert result.output_type == "research"
    assert result.output_id == 4242


async def test_execute_agent_task_dispatches_cocreation(db, monkeypatch):
    async def fake_generate(db_, request):
        assert request.theme == "tema conteudo"
        return _StubOutput(555), _StubVersion(), object(), []

    monkeypatch.setattr("app.cocreation_service.generate_content_package", fake_generate)
    monkeypatch.setattr(
        "app.quality_guardian.run_guardian_after_generation",
        lambda db_, output: _noop(),
    )

    result = await _run_task(
        db, "cocreation", {"brand_slug": "duofy", "theme": "tema conteudo"}
    )
    assert result.status == "completed"
    assert result.output_type == "cocreation"
    assert result.output_id == 555


async def test_execute_agent_task_dispatches_refine(db, monkeypatch):
    captured = {}

    async def fake_refine(db_, output_id, request):
        captured["output_id"] = output_id
        captured["target"] = request.target
        return _StubOutput(777), _StubVersion(), object(), []

    monkeypatch.setattr("app.cocreation_service.refine_content_package", fake_refine)
    monkeypatch.setattr(
        "app.quality_guardian.run_guardian_after_generation",
        lambda db_, output: _noop(),
    )

    result = await _run_task(
        db, "refine", {"output_id": 777, "target": "cta", "instruction": "melhore o CTA"}
    )
    assert result.status == "completed"
    assert result.output_type == "cocreation"
    assert result.output_id == 777
    assert captured == {"output_id": 777, "target": "cta"}


async def test_execute_agent_task_marks_failed_on_service_error(db, monkeypatch):
    async def boom(db_, request):
        raise RuntimeError("provedor caiu")

    monkeypatch.setattr("app.research_service.run_market_research", boom)

    result = await _run_task(
        db, "research", {"brand_slug": "duofy", "theme": "tema falho", "depth": "quick"}
    )
    assert result.status == "failed"
    assert "provedor caiu" in (result.error or "")


async def _noop() -> None:
    return None
