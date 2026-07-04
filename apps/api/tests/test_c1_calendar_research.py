"""C1 — isolamento por marca em calendar / research / operations (anti-IDOR).

Um usuário com `brand_scope` restrito não pode ler nem enumerar recursos de outra marca.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.models import AgentRun, Output, User
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _user(scope: list[str] | None) -> User:
    return User(
        email=f"scoped-{uuid4().hex[:10]}@t.com", name="Scoped",
        password_hash=hash_password("x" * 10), role="manager", is_active=True, brand_scope=scope,
    )


async def _scoped_headers(db, brands: list[str]) -> dict:
    user = _user(brands)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _create_event(client, headers, brand: str) -> int:
    resp = client.post(
        "/api/calendar",
        json={
            "brand_slug": brand,
            "category": "research",
            "title": "Evento",
            "description": "descricao",
            "event_type": "research",
            "start_at": "2026-08-05T10:00:00+00:00",
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


async def _make_research_output(db, brand: str) -> Output:
    run = AgentRun(
        agent_slug="research_agent", provider="openrouter", model="m",
        prompt="p", output="o", status="completed",
    )
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


# ---------------------------------------------------------------- Calendar

async def test_scoped_user_blocked_from_other_brand_event(client, auth_headers, db) -> None:
    event_id = _create_event(client, auth_headers, "postos")  # admin cria p/ postos
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.get(f"/api/calendar/{event_id}?brand_slug=postos", headers=headers)
    assert resp.status_code == 404


async def test_scoped_user_allowed_own_brand_event(client, auth_headers, db) -> None:
    event_id = _create_event(client, auth_headers, "duofy")
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.get(f"/api/calendar/{event_id}?brand_slug=duofy", headers=headers)
    assert resp.status_code == 200, resp.text


async def test_calendar_list_excludes_other_brands(client, auth_headers, db) -> None:
    _create_event(client, auth_headers, "duofy")
    _create_event(client, auth_headers, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/calendar", headers=headers).json()
    assert "postos" not in {e["brand_slug"] for e in body}


# ---------------------------------------------------------------- Research

async def test_scoped_user_blocked_from_other_brand_report(client, db) -> None:
    output = await _make_research_output(db, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.get(f"/api/research/reports/{output.id}", headers=headers)
    assert resp.status_code == 404


async def test_research_reports_list_excludes_other_brands(client, db) -> None:
    await _make_research_output(db, "duofy")
    await _make_research_output(db, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/research/reports", headers=headers).json()
    assert "postos" not in {r["brand_slug"] for r in body}


# ---------------------------------------------------------------- Operations

async def test_operations_summary_blocks_other_brand(client, db) -> None:
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.get("/api/operations/summary?brand_slug=postos", headers=headers)
    assert resp.status_code == 404
