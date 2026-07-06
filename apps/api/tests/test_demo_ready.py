"""Itens 5b (refino por peça) e 5d (datas avançadas do evento) — backend, custo zero."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import AgentRun, ContentPiece, Output, OutputVersion
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


async def _admin_headers(db):
    from sqlalchemy import select

    from app.models import User

    admin = (await db.execute(select(User).where(User.role == "admin"))).scalars().first()
    if admin is None:
        admin = User(email="dr@t.com", name="A", password_hash=hash_password("x" * 10),
                     role="admin", is_active=True)
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin)}"}


# ---------------- 5b: refino individual por peça ----------------

async def _output_with_piece(db, *, required=True, approved=False):
    run = AgentRun(agent_slug="content_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(brand_slug="duofy", category="content", channel="Instagram", format="Carrossel",
                    title="t", briefing="b", status="approved" if approved else "review",
                    provider="openrouter", model="m", agent_run_id=run.id)
    db.add(output)
    await db.flush()
    version = OutputVersion(output_id=output.id, version_number=1, content="c")
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    piece = ContentPiece(
        output_id=output.id, brand_slug="duofy", kind="caption_instagram",
        label="Legenda Instagram", channel="Instagram", content="Legenda velha.",
        required=required, origin="derived", position=0,
        status="approved" if approved else "pending",
    )
    db.add(piece)
    await db.commit()
    await db.refresh(piece)
    await db.refresh(output)
    return output, piece


def _patch_llm(monkeypatch, text: str):
    from app.llm import LLMResult

    async def fake(**kwargs):
        return LLMResult(output=text, provider="openrouter", model="m")

    # o serviço faz `from app.llm import call_llm` em tempo de execução → patcha a origem
    monkeypatch.setattr("app.llm.call_llm", fake)


async def test_piece_refine_updates_content_and_resets_pending(client, db, monkeypatch):
    output, piece = await _output_with_piece(db, required=True, approved=True)
    _patch_llm(monkeypatch, "Legenda NOVA e afiada, com CTA de salvar.")
    headers = await _admin_headers(db)
    resp = client.post(f"/api/pieces/{piece.id}/refine",
                       json={"instruction": "deixe mais direta"}, headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "NOVA" in body["content"]
    assert body["status"] == "pending"  # refino volta a pendente
    # peça obrigatória deixou de estar aprovada -> Output reverte a review
    fresh = await db.get(Output, output.id)
    await db.refresh(fresh)
    assert fresh.status == "review"


async def test_piece_refine_strips_forbidden_from_visual_prompt(client, db, monkeypatch):
    run = AgentRun(agent_slug="content_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(brand_slug="duofy", category="content", channel="WhatsApp", format="Mensagem",
                    title="t", briefing="b", status="review", provider="openrouter", model="m",
                    agent_run_id=run.id)
    db.add(output)
    await db.flush()
    piece = ContentPiece(output_id=output.id, brand_slug="duofy", kind="whatsapp_image_prompt",
                         label="Prompt imagem", channel="WhatsApp", content="prompt antigo",
                         required=False, origin="derived", position=0, status="pending")
    db.add(piece)
    await db.commit()
    await db.refresh(piece)
    _patch_llm(monkeypatch, "Foto com o logo da marca e #hashtag")  # tenta injetar proibido
    headers = await _admin_headers(db)
    resp = client.post(f"/api/pieces/{piece.id}/refine",
                       json={"instruction": "refine o prompt"}, headers=headers)
    assert resp.status_code == 200
    # a guarda anexa a nota de restrições quando detecta logo/@/#
    assert "sem logo" in resp.json()["content"].lower()


async def test_piece_refine_c1_blocks_cross_brand(client, db, monkeypatch):
    from app.models import User

    output, piece = await _output_with_piece(db, required=False, approved=False)
    # muda a peça para outra marca
    piece.brand_slug = "postos"
    output.brand_slug = "postos"
    await db.commit()
    from uuid import uuid4

    scoped = User(email=f"pr-{uuid4().hex[:8]}@t.com", name="S",
                  password_hash=hash_password("x" * 10),
                  role="manager", is_active=True, brand_scope=["duofy"])
    db.add(scoped)
    await db.commit()
    await db.refresh(scoped)
    headers = {"Authorization": f"Bearer {create_access_token(scoped)}"}
    resp = client.post(f"/api/pieces/{piece.id}/refine",
                       json={"instruction": "tente refinar"}, headers=headers)
    assert resp.status_code == 404


# ---------------- 5d: datas avançadas do evento ----------------

async def test_event_persists_advanced_dates(client, db):
    headers = await _admin_headers(db)
    base = datetime.now(UTC) + timedelta(days=1)
    body = {
        "brand_slug": "duofy", "title": "Evento com datas avançadas", "event_type": "content",
        "status": "planned", "start_at": base.isoformat(),
        "delivery_at": (base + timedelta(days=2)).isoformat(),
        "review_at": (base + timedelta(days=3)).isoformat(),
        "approval_at": (base + timedelta(days=4)).isoformat(),
        "due_at": (base + timedelta(days=5)).isoformat(),
        "reminder_at": (base - timedelta(hours=1)).isoformat(),
        "recurrence_rule": "weekly",
    }
    created = client.post("/api/calendar", json=body, headers=headers)
    assert created.status_code == 200, created.text
    eid = created.json()["id"]
    detail = client.get(f"/api/calendar/{eid}?brand_slug=duofy", headers=headers).json()
    assert detail["recurrence_rule"] == "weekly"
    for key in ("delivery_at", "review_at", "approval_at", "due_at", "reminder_at"):
        assert detail[key] is not None, f"faltou {key}"

    # PATCH também atualiza
    patched = client.patch(f"/api/calendar/{eid}?brand_slug=duofy",
                           json={"recurrence_rule": "monthly"}, headers=headers)
    assert patched.status_code == 200
    assert patched.json()["recurrence_rule"] == "monthly"
