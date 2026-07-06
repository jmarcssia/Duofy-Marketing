"""Cobertura das correções de estabilização pré-demo (2026-07-06).

- P0.3: evento de conteúdo não nasce travado por gate de pesquisa.
- P1 brand_scope: fecha o perímetro periférico (memory, reports, metrics, themes,
  research-themes, orchestrator/briefings, press) para usuário restrito.
- P1: /api/research/run devolve 422 (não 502) em fontes insuficientes.
- P1 publicações: recusa output não aprovado e refs de outra marca; valida media_paths.
- P1 export: quando uma peça é refinada após o pacote, o export inclui as peças e avisa.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.errors import InsufficientSourcesError
from app.models import (
    Briefing,
    ContentTheme,
    MemoryEntry,
    Output,
    OutputVersion,
    Report,
    ResearchTheme,
    User,
)
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _user(scope):
    return User(
        email=f"pre-{uuid4().hex[:10]}@t.com", name="Mgr",
        password_hash=hash_password("x" * 10), role="manager", is_active=True,
        brand_scope=scope,
    )


async def _scoped_headers(db, brands):
    user = _user(brands)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


# --------------------------------------------------------------- P0.3 gate

def _event_payload(event_type: str, **over):
    body = {
        "brand_slug": "duofy",
        "title": "Evento de teste",
        "event_type": event_type,
        "start_at": "2026-07-10T09:00:00+00:00",
        "requires_research_approval": True,
    }
    body.update(over)
    return body


async def test_content_event_not_gated_by_research_approval(client, auth_headers):
    """Evento de conteúdo não deve nascer com gate de pesquisa (beco sem saída)."""
    resp = client.post("/api/calendar", json=_event_payload("content"), headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["requires_research_approval"] is False


async def test_research_event_keeps_gate(client, auth_headers):
    resp = client.post("/api/calendar", json=_event_payload("research"), headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["requires_research_approval"] is True


# --------------------------------------------------------- P1 brand_scope

async def test_memory_list_scoped(client, db):
    db.add(MemoryEntry(brand_slug="duofy", category="research", source_type="s",
                       title="mine", content="c"))
    db.add(MemoryEntry(brand_slug="postos", category="research", source_type="s",
                       title="other", content="segredo de postos"))
    await db.commit()
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/memory", headers=headers).json()
    brands = {e["brand_slug"] for e in body}
    assert "postos" not in brands
    # forçar marca alheia -> 404
    assert client.get("/api/memory?brand_slug=postos", headers=headers).status_code == 404


async def test_reports_list_and_get_scoped(client, db):
    mine = Report(title="r1", report_type="metrics", brand_slug="duofy", content="c")
    other = Report(title="r2", report_type="metrics", brand_slug="postos", content="c")
    db.add(mine)
    db.add(other)
    await db.commit()
    await db.refresh(other)
    headers = await _scoped_headers(db, ["duofy"])
    listing = client.get("/api/reports", headers=headers).json()
    assert all(r["brand_slug"] != "postos" for r in listing)
    assert client.get(f"/api/reports/{other.id}", headers=headers).status_code == 404


async def test_metrics_summary_cross_brand_blocked(client, db):
    headers = await _scoped_headers(db, ["duofy"])
    assert client.get("/api/metrics/summary?brand_slug=postos",
                      headers=headers).status_code == 404


async def test_research_theme_delete_cross_brand_blocked(client, db):
    theme = ResearchTheme(title="t", notes=None, brand_slug="postos")
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    headers = await _scoped_headers(db, ["duofy"])
    assert client.delete(f"/api/research-themes/{theme.id}",
                         headers=headers).status_code == 404


async def test_content_theme_delete_cross_brand_blocked(client, db):
    theme = ContentTheme(title="t", theme="x", brand_slug="postos")
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    headers = await _scoped_headers(db, ["duofy"])
    assert client.delete(f"/api/themes/{theme.id}", headers=headers).status_code == 404


async def test_orchestrator_briefing_idor_blocked(client, db):
    b = Briefing(user_id=1, brand_slug="postos", request_text="x", tipo="pesquisa",
                 status="pending")
    db.add(b)
    await db.commit()
    await db.refresh(b)
    headers = await _scoped_headers(db, ["duofy"])
    assert client.get(f"/api/orchestrator/briefings/{b.id}",
                      headers=headers).status_code == 404
    approve = client.post(f"/api/orchestrator/briefings/{b.id}/approve",
                          json={}, headers=headers)
    assert approve.status_code == 404  # não dispara pesquisa em marca alheia


async def test_press_generate_cross_brand_blocked(client, db):
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.post(
        "/api/press/generate",
        json={"brand_slug": "postos", "briefing": "pauta institucional de teste"},
        headers=headers,
    )
    assert resp.status_code == 404


# ------------------------------------------------------- P1 research 422

async def test_research_run_insufficient_sources_is_422(client, auth_headers, monkeypatch):
    async def _boom(db, payload):
        raise InsufficientSourcesError(theme="tema x", found=1, needed=3)

    monkeypatch.setattr("app.routers.research.run_market_research", _boom)
    resp = client.post(
        "/api/research/run",
        json={"brand_slug": "duofy", "theme": "tema x", "depth": "quick"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "fontes suficientes" in resp.json()["detail"].lower()


# ---------------------------------------------------------- P1 publicações

async def _output(db, brand: str, status: str) -> Output:
    output = Output(brand_slug=brand, category="content", channel="Instagram", format="Post",
                    title="t", briefing="b", status=status, provider="p", model="m")
    db.add(output)
    await db.commit()
    await db.refresh(output)
    return output


async def test_publication_rejects_unapproved_output(client, auth_headers, db):
    draft = await _output(db, "duofy", "draft")
    resp = client.post(
        "/api/publications",
        json={"brand_slug": "duofy", "title": "P", "post_type": "feed", "output_id": draft.id},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "aprovado" in resp.json()["detail"].lower()


async def test_publication_accepts_approved_output(client, auth_headers, db):
    ok = await _output(db, "duofy", "approved")
    resp = client.post(
        "/api/publications",
        json={"brand_slug": "duofy", "title": "P", "post_type": "feed", "output_id": ok.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


async def test_publication_cross_brand_output_blocked(client, auth_headers, db):
    other = await _output(db, "postos", "approved")
    resp = client.post(
        "/api/publications",
        json={"brand_slug": "duofy", "title": "P", "post_type": "feed", "output_id": other.id},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_publication_media_path_must_be_under_storage(client, auth_headers, db):
    resp = client.post(
        "/api/publications",
        json={"brand_slug": "duofy", "title": "P", "post_type": "feed",
              "media_paths": ["/etc/passwd"]},
        headers=auth_headers,
    )
    assert resp.status_code == 400


# ------------------------------------------------------- P1 export divergência

def test_export_document_appends_pieces_and_warns():
    from app.routers.outputs import _output_export_document, _pieces_diverged

    output = SimpleNamespace(title="Pacote", brand_slug="duofy", category="content",
                             channel="Instagram", format="Carrossel", status="approved",
                             model="m", id=1)
    from datetime import UTC, datetime
    version = SimpleNamespace(content="TEXTO ANTIGO DO PACOTE", version_number=1,
                              created_at=datetime(2026, 7, 1, tzinfo=UTC))
    # Peça refinada DEPOIS do snapshot da versão.
    piece = SimpleNamespace(label="Legenda IG", kind="caption_instagram", status="approved",
                            content="TEXTO NOVO REFINADO", updated_at=datetime(2026, 7, 2, tzinfo=UTC))
    diverged = _pieces_diverged([piece], version)
    assert diverged is True
    doc = _output_export_document(output, version, [piece], diverged)
    assert "TEXTO NOVO REFINADO" in doc.content
    assert "Peças (conteúdo atual)" in doc.content
    assert "refinadas individualmente" in doc.content
