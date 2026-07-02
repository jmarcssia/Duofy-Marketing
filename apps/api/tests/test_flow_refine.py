"""Cocriação: refino por agente cria uma nova versão do conteúdo aberto."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal

pytestmark = pytest.mark.anyio


async def _generate(client, auth_headers) -> int:
    resp = client.post(
        "/api/content/generate",
        json={
            "brand_slug": "duofy",
            "channel": "instagram",
            "format": "post",
            "briefing": "Divulgar novo produto de tecnologia para gestão.",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


async def test_refine_creates_new_version(client, auth_headers, patch_ai):
    output_id = await _generate(client, auth_headers)

    resp = client.post(
        f"/api/content/outputs/{output_id}/refine",
        json={"instruction": "Deixe mais curto e com um CTA mais direto."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["id"] == output_id

    # Duas chamadas ao agente: geração + refino, ambas com a marca correta.
    assert len(patch_ai.calls) == 2
    assert patch_ai.calls[-1]["brand_slug"] == "duofy"

    # Uma nova OutputVersion foi criada (v1 da geração + v2 do refino).
    async with AsyncSessionLocal() as db:
        versions = (await db.execute(
            text("SELECT count(*) FROM output_versions WHERE output_id=:id"),
            {"id": output_id},
        )).scalar_one()
    assert versions == 2


async def test_refine_requires_instruction(client, auth_headers, patch_ai):
    output_id = await _generate(client, auth_headers)
    resp = client.post(
        f"/api/content/outputs/{output_id}/refine",
        json={"instruction": "x"},  # curto demais
        headers=auth_headers,
    )
    assert resp.status_code == 422
