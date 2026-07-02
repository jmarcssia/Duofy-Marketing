"""S0 — fluxo crítico: geração de assessoria de imprensa."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal

pytestmark = pytest.mark.anyio


async def test_press_generate_persists_output(client, auth_headers, patch_ai):
    resp = client.post(
        "/api/press/generate",
        json={
            "brand_slug": "duofy",
            "format": "pauta",
            "briefing": "Sugerir pauta sobre inovação em tecnologia de gestão.",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"]
    assert len(patch_ai.calls) == 1
    async with AsyncSessionLocal() as db:
        outputs = (await db.execute(text("SELECT count(*) FROM outputs"))).scalar_one()
    assert outputs == 1
