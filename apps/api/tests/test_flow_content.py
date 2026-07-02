"""S0 — fluxo crítico: geração de conteúdo (Output + Version + ModelCall)."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal

pytestmark = pytest.mark.anyio


async def _generate(client, auth_headers, **over):
    payload = {
        "brand_slug": "duofy",
        "category": "geral",
        "channel": "instagram",
        "format": "post",
        "briefing": "Divulgar novo produto de tecnologia para gestão de marketing.",
    }
    payload.update(over)
    return client.post("/api/content/generate", json=payload, headers=auth_headers)


async def test_content_generate_persists_output_and_modelcall(client, auth_headers, patch_ai):
    resp = await _generate(client, auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"]
    assert body["brand_slug"] == "duofy"
    assert body.get("current_content")

    # LLM foi chamado uma vez, com a marca correta (o modelo efetivo é validado em S1).
    assert len(patch_ai.calls) == 1
    assert patch_ai.calls[0]["brand_slug"] == "duofy"
    async with AsyncSessionLocal() as db:
        outputs = (await db.execute(text("SELECT count(*) FROM outputs"))).scalar_one()
        versions = (await db.execute(text("SELECT count(*) FROM output_versions"))).scalar_one()
    assert outputs == 1
    assert versions == 1


async def test_content_generate_requires_auth(client, patch_ai):
    resp = await _generate(client, {})  # sem Authorization
    assert resp.status_code == 401
