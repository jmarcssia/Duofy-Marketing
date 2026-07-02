"""Importação da base do calendário: carrega eventos/temas/roteiros e é idempotente."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal
from app.import_calendar import import_base

pytestmark = pytest.mark.anyio

BASE = {
    "events": [
        {"brand_slug": "duofy_solucoes", "title": "Post A", "description": "desc",
         "channel": "Instagram", "format": "Post", "start_at": "2026-04-01T00:00:00",
         "status": "completed", "execution_payload": {"origem_aba": "2º tri 2026"}},
        {"brand_slug": "deathcare", "title": "Sem data", "start_at": None,
         "status": "planned", "execution_payload": {}},
    ],
    "themes": [
        {"title": "Tema X", "theme": "sobre gestão", "brand_slug": "postos_combustiveis",
         "audience": "gestores", "kind": "Webinar", "owner": "TOTVS", "status": ""},
    ],
    "roteiros": [
        {"title": "Roteiro Y", "brand_slug": "postos_combustiveis",
         "recording_status": "GRAVADO", "script": "texto do roteiro", "status": "divulgado"},
    ],
}


async def _counts():
    async with AsyncSessionLocal() as db:
        ev = (await db.execute(text(
            "SELECT count(*) FROM calendar_events WHERE execution_payload->>'import_batch'='calendario_xlsx_v1'"
        ))).scalar_one()
        th = (await db.execute(text("SELECT count(*) FROM content_themes"))).scalar_one()
        sc = (await db.execute(text("SELECT count(*) FROM content_scripts"))).scalar_one()
    return ev, th, sc


async def test_import_loads_and_is_idempotent():
    async with AsyncSessionLocal() as db:
        s1 = await import_base(db, BASE)
    assert s1["events_inserted"] == 1
    assert s1["events_skipped_nodate"] == 1
    assert s1["themes_inserted"] == 1
    assert s1["scripts_inserted"] == 1
    assert await _counts() == (1, 1, 1)

    # Reimportar não duplica.
    async with AsyncSessionLocal() as db:
        s2 = await import_base(db, BASE)
    assert s2["themes_skipped"] == 1
    assert s2["scripts_skipped"] == 1
    assert await _counts() == (1, 1, 1)
