"""S0 — pesquisa sem fontes suficientes recusa (422) e nao cria Output."""

from __future__ import annotations

import json

import pytest

from app.models import Output
from sqlalchemy import func, select

pytestmark = pytest.mark.anyio


async def test_research_without_sources_returns_422_and_no_output(
    client, auth_headers, patch_ai, monkeypatch, db
):
    # forca a coleta a devolver zero fontes usaveis
    from app import research_service as rs

    async def fake_collect(db_, payload, brand):
        return []

    monkeypatch.setattr(rs, "collect_research_sources", fake_collect)

    # plano de pesquisa em branco -> pending
    plan = client.post(
        "/api/orchestrator/plan-research",
        json={"brand_slug": "duofy", "theme": "tema sem noticias xyzqwe"},
        headers=auth_headers,
    )
    assert plan.status_code == 200, plan.text
    bid = plan.json()["id"]

    before = (await db.execute(select(func.count()).select_from(Output))).scalar_one()

    approve = client.post(
        f"/api/orchestrator/briefings/{bid}/approve",
        json={"model_override": "anthropic/claude-opus-4.8", "depth": "quick"},
        headers=auth_headers,
    )
    assert approve.status_code == 422, approve.text
    assert "fontes" in approve.json()["detail"].lower()

    after = (await db.execute(select(func.count()).select_from(Output))).scalar_one()
    assert after == before  # nenhum Output criado
