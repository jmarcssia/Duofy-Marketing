"""S0 — fluxo crítico: calendário como módulo controlado pelo usuário (CRUD + ICS).

Este teste protege o comportamento que deve permanecer após o agente Calendário
ser removido (S3): o CRUD e o export continuam sendo do usuário/Orquestrador.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


def _event_payload(**over):
    payload = {
        "brand_slug": "duofy",
        "title": "Post de lançamento",
        "event_type": "content",
        "channel": "instagram",
        "format": "post",
        "start_at": "2026-08-01T10:00:00+00:00",
    }
    payload.update(over)
    return payload


async def test_calendar_crud_roundtrip(client, auth_headers):
    # create
    created = client.post("/api/calendar", json=_event_payload(), headers=auth_headers)
    assert created.status_code == 200, created.text
    event_id = created.json()["id"]

    # list (escopado por marca)
    listing = client.get("/api/calendar", params={"brand_slug": "duofy"}, headers=auth_headers)
    assert listing.status_code == 200
    assert any(e["id"] == event_id for e in listing.json())

    # update
    patched = client.patch(f"/api/calendar/{event_id}",
                           json={"title": "Post de lançamento (revisado)"}, headers=auth_headers)
    assert patched.status_code == 200
    assert patched.json()["title"] == "Post de lançamento (revisado)"

    # export ICS
    ics = client.get("/api/calendar/export.ics", params={"brand_slug": "duofy"},
                     headers=auth_headers)
    assert ics.status_code == 200
    assert "BEGIN:VCALENDAR" in ics.text

    # delete
    deleted = client.delete(f"/api/calendar/{event_id}", headers=auth_headers)
    assert deleted.status_code == 200
    after = client.get("/api/calendar", params={"brand_slug": "duofy"}, headers=auth_headers)
    assert all(e["id"] != event_id for e in after.json())
