"""S0 — Calendário como centro operacional (V1): fluxo vertical de pesquisa.

Cobre: criação/edição de evento, isolamento por marca (anti-IDOR), execução manual
reusando o Agente de Pesquisa (com run_market_research stubado — a pesquisa tem seus
próprios testes), vínculo com AgentTask + Output, transição para "aguardando aprovação",
bloqueio da cocriação antes da aprovação e falha de execução.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AgentRun, AgentTask, CalendarEvent, Output, OutputVersion, User
from app.schemas import ContentPackage

pytestmark = pytest.mark.anyio


def _research_event_payload(**over):
    payload = {
        "brand_slug": "duofy",
        "title": "Tendências de gestão de estoque de combustível",
        "objective": "Mapear tendências para pauta editorial",
        "description": "Briefing: focar em eficiência operacional.",
        "event_type": "research",
        "start_at": "2026-08-01T10:00:00+00:00",
        "status": "ready",
        "execution_mode": "manual",
    }
    payload.update(over)
    return payload


async def _make_research_output(db, brand_slug: str, status: str = "draft") -> Output:
    run = AgentRun(
        agent_slug="research_agent", provider="openrouter", model="m",
        prompt="p", output="# Pesquisa\nconteúdo", status="completed",
    )
    db.add(run)
    await db.flush()
    output = Output(
        brand_slug=brand_slug, category="research", channel="Pesquisa",
        format="research_report", title="Pesquisa gerada", briefing="Tema: x",
        status=status, provider="openrouter", model="m", agent_run_id=run.id,
    )
    db.add(output)
    await db.flush()
    version = OutputVersion(
        output_id=output.id, version_number=1, content="# Pesquisa\nconteúdo",
        editor_note="inicial",
    )
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    return output


@pytest.fixture
def stub_research(monkeypatch):
    """Substitui run_market_research (no namespace do workflow) por um Output real.

    Isola o teste do calendário das entranhas da pesquisa (rede/LLM), que têm testes próprios.
    """
    async def fake_run(db, payload):
        return await _make_research_output(db, payload.brand_slug, status="draft")

    monkeypatch.setattr("app.calendar_workflow.run_market_research", fake_run)
    return fake_run


@pytest.fixture
def stub_cocreation(monkeypatch):
    """Substitui generate_content_package por um Output de conteúdo real (sem LLM)."""
    async def fake_gen(db, payload):
        run = AgentRun(
            agent_slug="content_agent", provider="openrouter", model="m",
            prompt="p", output="# Conteúdo\nmd", status="completed",
        )
        db.add(run)
        await db.flush()
        output = Output(
            brand_slug=payload.brand_slug, category="content_generation",
            channel=payload.channel, format=payload.format, title="Carrossel gerado",
            briefing=payload.theme, status=payload.status, provider="openrouter",
            model="m", agent_run_id=run.id,
        )
        db.add(output)
        await db.flush()
        version = OutputVersion(
            output_id=output.id, version_number=1, content="# Conteúdo\nmd",
            editor_note="inicial", structured_json=None,
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id
        pkg = ContentPackage(brand_slug=payload.brand_slug, channel=payload.channel,
                             format=payload.format)
        return output, version, pkg, []

    monkeypatch.setattr("app.calendar_workflow.generate_content_package", fake_gen)
    return fake_gen


async def _run_and_approve_research(client, headers, db, event_id):
    """Executa a pesquisa e aprova o Output (efeito da página do Agente de Pesquisa)."""
    client.post(f"/api/calendar/{event_id}/execute-research",
                params={"brand_slug": "duofy"}, headers=headers)
    event = (
        await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))
    ).scalar_one()
    output = await db.get(Output, event.research_output_id)
    output.status = "approved"
    await db.commit()


def _create_event(client, headers, **over):
    resp = client.post("/api/calendar", json=_research_event_payload(**over), headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_create_research_event_persists_workflow_fields(client, auth_headers):
    body = _create_event(client, auth_headers)
    assert body["event_type"] == "research"
    assert body["objective"] == "Mapear tendências para pauta editorial"
    assert body["execution_mode"] == "manual"
    assert body["requires_research_approval"] is True
    # created_by preenchido: visível no detalhe
    detail = client.get(
        f"/api/calendar/{body['id']}", params={"brand_slug": "duofy"}, headers=auth_headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["created_by"] is not None


async def test_edit_event(client, auth_headers):
    body = _create_event(client, auth_headers)
    patched = client.patch(
        f"/api/calendar/{body['id']}",
        params={"brand_slug": "duofy"},
        json={"title": "Novo tema de pesquisa", "objective": "Objetivo revisado"},
        headers=auth_headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["title"] == "Novo tema de pesquisa"


async def test_detail_pipeline_starts_with_research_pending(client, auth_headers):
    body = _create_event(client, auth_headers)
    detail = client.get(
        f"/api/calendar/{body['id']}", params={"brand_slug": "duofy"}, headers=auth_headers
    ).json()
    steps = {s["key"]: s["status"] for s in detail["steps"]}
    assert steps["research"] in ("current", "pending")
    assert steps["cocreation"] == "locked"  # bloqueada antes da aprovação
    assert detail["cocreation_unlocked"] is False


async def test_execute_research_links_task_output_and_awaits_approval(
    client, auth_headers, db, stub_research
):
    body = _create_event(client, auth_headers)
    resp = client.post(
        f"/api/calendar/{body['id']}/execute-research",
        params={"brand_slug": "duofy"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["status"] == "awaiting_approval"
    assert detail["research_output_id"] is not None
    assert detail["agent_task_id"] is not None
    steps = {s["key"]: s["status"] for s in detail["steps"]}
    assert steps["research"] == "done"
    assert steps["research_approval"] == "current"
    assert steps["cocreation"] == "locked"

    # AgentTask criado e vinculado (unidade de execução reutilizada, não duplicada)
    task = (
        await db.execute(select(AgentTask).where(AgentTask.id == detail["agent_task_id"]))
    ).scalar_one()
    assert task.status == "completed"
    assert task.output_id == detail["research_output_id"]
    assert task.metadata_json.get("calendar_event_id") == body["id"]
    # Output real vinculado
    output = await db.get(Output, detail["research_output_id"])
    assert output is not None and output.channel == "Pesquisa"


async def test_cocreation_unlocks_after_research_approved(
    client, auth_headers, db, stub_research
):
    body = _create_event(client, auth_headers)
    client.post(
        f"/api/calendar/{body['id']}/execute-research",
        params={"brand_slug": "duofy"}, headers=auth_headers,
    )
    # Antes da aprovação: cocriação bloqueada
    before = client.get(
        f"/api/calendar/{body['id']}", params={"brand_slug": "duofy"}, headers=auth_headers
    ).json()
    assert before["cocreation_unlocked"] is False

    # Aprovação acontece no fluxo de outputs (página do Agente de Pesquisa): simula o efeito
    event = (
        await db.execute(select(CalendarEvent).where(CalendarEvent.id == body["id"]))
    ).scalar_one()
    output = await db.get(Output, event.research_output_id)
    output.status = "approved"
    await db.commit()

    after = client.get(
        f"/api/calendar/{body['id']}", params={"brand_slug": "duofy"}, headers=auth_headers
    ).json()
    assert after["research_approved"] is True
    assert after["cocreation_unlocked"] is True
    steps = {s["key"]: s["status"] for s in after["steps"]}
    assert steps["research_approval"] == "done"
    assert steps["cocreation"] in ("current", "done")


async def test_execute_research_failure_marks_failed(client, auth_headers, db, monkeypatch):
    async def boom(db, payload):
        raise RuntimeError("provedor indisponível")

    monkeypatch.setattr("app.calendar_workflow.run_market_research", boom)
    body = _create_event(client, auth_headers)
    resp = client.post(
        f"/api/calendar/{body['id']}/execute-research",
        params={"brand_slug": "duofy"}, headers=auth_headers,
    )
    assert resp.status_code == 502, resp.text
    event = (
        await db.execute(select(CalendarEvent).where(CalendarEvent.id == body["id"]))
    ).scalar_one()
    assert event.status == "failed"
    assert event.last_error and "provedor" in event.last_error
    task = (
        await db.execute(select(AgentTask).where(AgentTask.id == event.agent_task_id))
    ).scalar_one()
    assert task.status == "failed"


async def test_cross_brand_access_denied(client, auth_headers, stub_research):
    body = _create_event(client, auth_headers)  # marca "duofy"
    eid = body["id"]
    # GET com marca errada
    assert client.get(f"/api/calendar/{eid}", params={"brand_slug": "postos"},
                      headers=auth_headers).status_code == 404
    # PATCH com marca errada
    assert client.patch(f"/api/calendar/{eid}", params={"brand_slug": "postos"},
                        json={"title": "hack"}, headers=auth_headers).status_code == 404
    # DELETE com marca errada
    assert client.delete(f"/api/calendar/{eid}", params={"brand_slug": "postos"},
                         headers=auth_headers).status_code == 404
    # execute-research com marca errada
    assert client.post(f"/api/calendar/{eid}/execute-research", params={"brand_slug": "postos"},
                       headers=auth_headers).status_code == 404


async def test_execute_research_requires_brand_slug(client, auth_headers):
    body = _create_event(client, auth_headers)
    # sem brand_slug -> 422 (query obrigatória)
    resp = client.post(f"/api/calendar/{body['id']}/execute-research", headers=auth_headers)
    assert resp.status_code == 422


async def test_cocreation_blocked_before_research_approval(
    client, auth_headers, stub_research, stub_cocreation
):
    body = _create_event(client, auth_headers)
    # executa pesquisa, mas NÃO aprova
    client.post(f"/api/calendar/{body['id']}/execute-research",
                params={"brand_slug": "duofy"}, headers=auth_headers)
    resp = client.post(f"/api/calendar/{body['id']}/execute-cocreation",
                       params={"brand_slug": "duofy"}, headers=auth_headers)
    assert resp.status_code == 400  # gate: pesquisa não aprovada
    assert "aprova" in resp.json()["detail"].lower()


async def test_execute_cocreation_after_approval_links_content_and_advances(
    client, auth_headers, db, stub_research, stub_cocreation
):
    body = _create_event(client, auth_headers)
    await _run_and_approve_research(client, auth_headers, db, body["id"])

    resp = client.post(
        f"/api/calendar/{body['id']}/execute-cocreation",
        params={"brand_slug": "duofy", "channel": "Instagram", "format": "Carrossel"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["content_output_id"] is not None
    assert detail["current_step"] == "review"
    steps = {s["key"]: s["status"] for s in detail["steps"]}
    assert steps["cocreation"] == "done"
    assert steps["research_approval"] == "done"
    assert steps["review"] == "current"

    # Output de conteúdo real vinculado + AgentTask de conteúdo
    output = await db.get(Output, detail["content_output_id"])
    assert output is not None and output.category == "content_generation"
    task = (
        await db.execute(select(AgentTask).where(AgentTask.id == detail["agent_task_id"]))
    ).scalar_one()
    assert task.task_type == "content" and task.output_id == detail["content_output_id"]


async def test_cocreation_cross_brand_denied(client, auth_headers, stub_research, stub_cocreation):
    body = _create_event(client, auth_headers)
    resp = client.post(f"/api/calendar/{body['id']}/execute-cocreation",
                       params={"brand_slug": "postos"}, headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# F3 — automação: pausar/retomar, histórico de tentativas, gates da auto-execução
# ---------------------------------------------------------------------------


async def test_pause_and_resume(client, auth_headers):
    body = _create_event(client, auth_headers, execution_mode="auto")
    paused = client.post(f"/api/calendar/{body['id']}/pause",
                         params={"brand_slug": "duofy"}, headers=auth_headers)
    assert paused.status_code == 200, paused.text
    assert paused.json()["is_paused"] is True
    resumed = client.post(f"/api/calendar/{body['id']}/resume",
                          params={"brand_slug": "duofy"}, headers=auth_headers)
    assert resumed.status_code == 200
    assert resumed.json()["is_paused"] is False


async def test_pause_cross_brand_denied(client, auth_headers):
    body = _create_event(client, auth_headers)
    resp = client.post(f"/api/calendar/{body['id']}/pause",
                       params={"brand_slug": "postos"}, headers=auth_headers)
    assert resp.status_code == 404


async def test_history_reflects_attempts(client, auth_headers, stub_research):
    body = _create_event(client, auth_headers)
    client.post(f"/api/calendar/{body['id']}/execute-research",
                params={"brand_slug": "duofy"}, headers=auth_headers)
    detail = client.get(f"/api/calendar/{body['id']}", params={"brand_slug": "duofy"},
                        headers=auth_headers).json()
    assert len(detail["history"]) >= 1
    attempt = detail["history"][0]
    assert attempt["kind"] == "research"
    assert attempt["trigger"] == "manual"
    assert attempt["status"] == "completed"


class _FakeRedis:
    """Redis mínimo p/ testar os gates do scheduler sem infra (set NX)."""

    def __init__(self):
        self.keys: set[str] = set()

    async def set(self, key, value, ex=None, nx=False):  # noqa: A003
        if nx and key in self.keys:
            return False
        self.keys.add(key)
        return True


async def _make_auto_event(db, *, approved: bool, paused: bool) -> int:
    admin = (await db.execute(select(User))).scalars().first()
    output = await _make_research_output(db, "duofy", status="approved" if approved else "draft")
    event = CalendarEvent(
        brand_slug="duofy", title="Auto pesquisa", event_type="research",
        status="awaiting_approval", start_at=output.created_at, execution_mode="auto",
        is_paused=paused, research_output_id=output.id, created_by=admin.id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event.id


async def test_auto_cocreation_gates(db, monkeypatch):
    """A auto-cocriação só roda com pesquisa aprovada e evento não pausado."""
    from app import calendar_scheduler

    calls: list[int] = []

    async def fake_exec(db_, event, user, trigger="manual"):
        calls.append(event.id)
        return event

    monkeypatch.setattr(calendar_scheduler, "execute_cocreation", fake_exec)

    approved_active = await _make_auto_event(db, approved=True, paused=False)
    await _make_auto_event(db, approved=True, paused=True)     # pausado -> skip
    await _make_auto_event(db, approved=False, paused=False)   # não aprovado -> skip

    await calendar_scheduler._execute_due_cocreation_events(db, _FakeRedis())

    assert approved_active in calls
    assert len(calls) == 1  # só o aprovado e não pausado
