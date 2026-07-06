"""Evento do calendário com briefing estruturado (FASE 4).

O wizard grava em execution_payload: depth/period/channel/format/channels/pieces/briefing.
Aqui garantimos que o evento persiste esse payload e o REPASSA aos agentes:
execute-research recebe briefing_filters; execute-cocreation usa canal/formato/peças do
briefing quando a chamada não os especifica (scheduler F3 e botão "padrão do briefing").
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import AgentRun, Output

pytestmark = pytest.mark.anyio

BRIEFING = {
    "segmento": "Postos de Combustíveis",
    "tipos_pesquisa": ["Mercado"],
    "canais": ["Instagram", "LinkedIn", "WhatsApp"],
    "pecas": ["Mensagem WhatsApp"],
}

PAYLOAD = {
    "depth": "standard",
    "period": "ultimos 90 dias",
    "channel": "LinkedIn",
    "format": "Post único",
    "channels": ["Instagram", "LinkedIn", "WhatsApp"],
    "pieces": ["whatsapp"],
    "briefing": BRIEFING,
}


def _create_event(client, headers, **overrides):
    body = {
        "brand_slug": "duofy",
        "title": "Pesquisa com briefing estruturado",
        "event_type": "research",
        "status": "draft",
        "objective": "Validar o repasse do briefing",
        "start_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        "execution_payload": PAYLOAD,
        **overrides,
    }
    resp = client.post("/api/calendar", json=body, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _persisted_output(db, brand: str = "duofy") -> Output:
    run = AgentRun(agent_slug="research_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(
        brand_slug=brand, category="research", channel="Pesquisa", format="research_report",
        title="Pesquisa", briefing="b", status="approved", provider="openrouter", model="m",
        agent_run_id=run.id,
    )
    db.add(output)
    await db.commit()
    await db.refresh(output)
    return output


async def test_event_persists_structured_payload(client, auth_headers):
    event = _create_event(client, auth_headers)
    detail = client.get(
        f"/api/calendar/{event['id']}?brand_slug=duofy", headers=auth_headers
    ).json()
    assert detail["execution_payload"]["briefing"] == BRIEFING
    assert detail["execution_payload"]["channels"] == ["Instagram", "LinkedIn", "WhatsApp"]
    assert detail["execution_payload"]["pieces"] == ["whatsapp"]


async def test_execute_research_passes_briefing_filters(
    client, auth_headers, patch_ai, monkeypatch, db
):
    from app import calendar_workflow as cw

    captured: dict = {}
    persisted = await _persisted_output(db)

    async def fake_research(db_, payload):
        captured["payload"] = payload
        return persisted

    monkeypatch.setattr(cw, "run_market_research", fake_research)
    event = _create_event(client, auth_headers)
    resp = client.post(
        f"/api/calendar/{event['id']}/execute-research?brand_slug=duofy",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    req = captured["payload"]
    assert req.depth == "standard"
    assert req.period == "ultimos 90 dias"
    assert req.briefing_filters == BRIEFING


async def test_execute_cocreation_uses_event_briefing_defaults(
    client, auth_headers, patch_ai, monkeypatch, db
):
    from app import calendar_workflow as cw

    captured: dict = {}
    research = await _persisted_output(db)
    content = await _persisted_output(db)

    async def fake_cocreation(db_, payload):
        captured["payload"] = payload
        return content, None, None, []

    monkeypatch.setattr(cw, "generate_content_package", fake_cocreation)
    event = _create_event(client, auth_headers, requires_research_approval=False)

    # vincula uma pesquisa aprovada ao evento (gate liberado)
    from sqlalchemy import select

    from app.models import CalendarEvent

    row = (await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event["id"])
    )).scalar_one()
    row.research_output_id = research.id
    await db.commit()

    # SEM channel/format na query: o briefing do evento decide
    resp = client.post(
        f"/api/calendar/{event['id']}/execute-cocreation?brand_slug=duofy",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    req = captured["payload"]
    assert req.channel == "LinkedIn"
    assert req.format == "Post único"
    assert req.channels == ["Instagram", "LinkedIn", "WhatsApp"]
    assert req.pieces == ["whatsapp"]
    assert req.briefing_filters == BRIEFING


async def test_execute_cocreation_query_params_override_briefing(
    client, auth_headers, patch_ai, monkeypatch, db
):
    from app import calendar_workflow as cw

    captured: dict = {}
    research = await _persisted_output(db)
    content = await _persisted_output(db)

    async def fake_cocreation(db_, payload):
        captured["payload"] = payload
        return content, None, None, []

    monkeypatch.setattr(cw, "generate_content_package", fake_cocreation)
    event = _create_event(client, auth_headers, requires_research_approval=False)

    from sqlalchemy import select

    from app.models import CalendarEvent

    row = (await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event["id"])
    )).scalar_one()
    row.research_output_id = research.id
    await db.commit()

    resp = client.post(
        f"/api/calendar/{event['id']}/execute-cocreation"
        "?brand_slug=duofy&channel=Blog&format=Artigo",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert captured["payload"].channel == "Blog"
    assert captured["payload"].format == "Artigo"
