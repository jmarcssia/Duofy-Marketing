"""F2b — peças/subpeças: explosão do pacote, aprovação por peça e gate do Output."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.content_pieces_service import (
    content_review_complete,
    explode_package_into_pieces,
    list_pieces,
    set_piece_status,
)
from app.models import AgentRun, ContentPiece, Output, User
from app.schemas import ContentPackage
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _package(brand: str = "duofy") -> ContentPackage:
    return ContentPackage(
        brand_slug=brand, channel="Instagram", format="Carrossel",
        captions={"instagram": "Legenda IG leve.", "linkedin": "Análise executiva."},
        slides=[
            {"numero": 1, "funcao": "abertura", "texto": "T1", "texto_arte": "A1",
             "image_prompt": "P1", "alt_text": "x"},
            {"numero": 2, "funcao": "fechamento", "texto": "T2", "texto_arte": "A2",
             "image_prompt": "P2", "alt_text": "y"},
        ],
        visual_direction={"conceito": "editorial", "estilo": "realista"},
    )


async def _make_output(db, brand: str = "duofy", status: str = "review") -> Output:
    run = AgentRun(agent_slug="content_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(brand_slug=brand, category="content_generation", channel="Instagram",
                    format="Carrossel", title="t", briefing="b", status=status,
                    provider="openrouter", model="m", agent_run_id=run.id)
    db.add(output)
    await db.commit()
    await db.refresh(output)
    return output


async def _admin(db) -> User:
    return (await db.execute(select(User).order_by(User.id))).scalars().first()


async def test_explode_creates_derived_pieces(db):
    output = await _make_output(db)
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    pieces = await list_pieces(db, output.id)
    kinds = {p.kind for p in pieces}
    assert kinds == {"carousel", "caption_instagram", "caption_linkedin", "visual_direction"}
    required = {p.kind for p in pieces if p.required}
    assert required == {"carousel", "caption_instagram", "caption_linkedin"}  # visual = opcional
    carousel = next(p for p in pieces if p.kind == "carousel")
    assert "Slide 1" in carousel.content and "Slide 2" in carousel.content


async def test_explode_is_idempotent(db):
    output = await _make_output(db)
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    assert len(await list_pieces(db, output.id)) == 4


async def test_required_pieces_gate_output_approval(db):
    output = await _make_output(db, status="review")
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    admin = await _admin(db)
    pieces = await list_pieces(db, output.id)
    required = [p for p in pieces if p.required]
    # aprova todas menos a última obrigatória -> Output ainda não aprovado
    for p in required[:-1]:
        await set_piece_status(db, p, "approved", admin)
    assert not await content_review_complete(db, output.id)
    await db.refresh(output)
    assert output.status == "review"
    # aprova a última obrigatória -> Output vira 'approved' (a opcional não bloqueia)
    await set_piece_status(db, required[-1], "approved", admin)
    assert await content_review_complete(db, output.id)
    await db.refresh(output)
    assert output.status == "approved"


async def test_rejecting_required_reverts_output(db):
    output = await _make_output(db, status="review")
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    admin = await _admin(db)
    for p in [p for p in await list_pieces(db, output.id) if p.required]:
        await set_piece_status(db, p, "approved", admin)
    await db.refresh(output)
    assert output.status == "approved"
    # rejeita uma obrigatória -> Output volta para review
    a_required = next(p for p in await list_pieces(db, output.id) if p.required)
    await set_piece_status(db, a_required, "rejected", admin)
    await db.refresh(output)
    assert output.status == "review"


async def test_review_complete_fallback_without_pieces(db):
    output = await _make_output(db, status="approved")
    assert await content_review_complete(db, output.id) is True


# --- endpoints ---

async def test_endpoints_list_and_approve(client, auth_headers, db):
    output = await _make_output(db)
    await explode_package_into_pieces(db, output, _package())
    await db.commit()
    listing = client.get(f"/api/outputs/{output.id}/pieces", headers=auth_headers)
    assert listing.status_code == 200
    pieces = listing.json()
    assert len(pieces) == 4
    ig = next(p for p in pieces if p["kind"] == "caption_instagram")
    resp = client.post(f"/api/pieces/{ig['id']}/status",
                       json={"status": "approved", "note": "ok"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


async def test_add_manual_piece(client, auth_headers, db):
    output = await _make_output(db)
    resp = client.post(f"/api/outputs/{output.id}/pieces",
                       json={"kind": "email", "label": "E-mail de lançamento",
                             "content": "Assunto: ...", "required": False},
                       headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["kind"] == "email" and resp.json()["origin"] == "manual"
    # tipo inválido -> 400
    bad = client.post(f"/api/outputs/{output.id}/pieces",
                      json={"kind": "hackzor", "label": "x"}, headers=auth_headers)
    assert bad.status_code == 400


async def test_pieces_cross_brand_denied(client, db):
    output = await _make_output(db, brand="postos")
    await explode_package_into_pieces(db, output, _package("postos"))
    await db.commit()
    user = User(email=f"s-{uuid4().hex[:8]}@t.com", name="S", password_hash=hash_password("x" * 10),
                role="manager", is_active=True, brand_scope=["duofy"])
    db.add(user)
    await db.commit()
    await db.refresh(user)
    headers = {"Authorization": f"Bearer {create_access_token(user)}"}
    piece = (
        await db.execute(select(ContentPiece).where(ContentPiece.output_id == output.id))
    ).scalars().first()
    assert client.get(f"/api/outputs/{output.id}/pieces", headers=headers).status_code == 404
    assert client.post(f"/api/pieces/{piece.id}/status", json={"status": "approved"},
                       headers=headers).status_code == 404
