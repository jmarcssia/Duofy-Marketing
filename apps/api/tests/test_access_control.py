"""C1 — isolamento por marca (anti-IDOR): brand_scope do usuário é respeitado."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.access import can_access_brand
from app.models import AgentRun, Output, User
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _user(scope):
    # email unico por usuario (a tabela users nao e truncada entre testes)
    return User(
        email=f"scoped-{uuid4().hex[:10]}@t.com", name="Scoped",
        password_hash=hash_password("x" * 10), role="manager", is_active=True, brand_scope=scope,
    )


def test_can_access_brand_rules() -> None:
    admin = _user(None)  # sem escopo = todas as marcas
    assert can_access_brand(admin, "postos")
    assert can_access_brand(admin, None)
    scoped = _user(["duofy"])
    assert can_access_brand(scoped, "duofy")
    assert not can_access_brand(scoped, "postos")
    assert can_access_brand(scoped, "institucional")  # institucional sempre acessível
    assert not can_access_brand(scoped, None)  # visão "todas as marcas" bloqueada p/ restrito


async def _make_output(db, brand: str) -> Output:
    run = AgentRun(
        agent_slug="content_agent", provider="openrouter", model="m",
        prompt="p", output="o", status="completed",
    )
    db.add(run)
    await db.flush()
    output = Output(
        brand_slug=brand, category="content", channel="Instagram", format="Post",
        title="t", briefing="b", status="draft", provider="openrouter", model="m",
        agent_run_id=run.id,
    )
    db.add(output)
    await db.commit()
    await db.refresh(output)
    return output


async def _scoped_headers(db, brands: list[str]) -> dict:
    user = _user(brands)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


async def test_scoped_user_blocked_from_other_brand_output(client, db) -> None:
    headers = await _scoped_headers(db, ["duofy"])
    out = await _make_output(db, "postos")  # marca fora do escopo
    assert client.get(f"/api/outputs/{out.id}", headers=headers).status_code == 404


async def test_scoped_user_allowed_own_brand_output(client, db) -> None:
    headers = await _scoped_headers(db, ["duofy"])
    out = await _make_output(db, "duofy")
    assert client.get(f"/api/outputs/{out.id}", headers=headers).status_code == 200


async def test_null_scope_admin_accesses_any_brand(client, auth_headers, db) -> None:
    out = await _make_output(db, "postos")
    assert client.get(f"/api/outputs/{out.id}", headers=auth_headers).status_code == 200


async def test_list_outputs_filtered_by_scope(client, db) -> None:
    headers = await _scoped_headers(db, ["duofy"])
    await _make_output(db, "duofy")
    await _make_output(db, "postos")
    body = client.get("/api/outputs", headers=headers).json()
    brands = {o["brand_slug"] for o in body}
    assert "postos" not in brands
    assert brands <= {"duofy", "institucional"}


async def test_admin_sets_brand_scope_and_enforcement_applies(client, auth_headers, db) -> None:
    # cria um usuario sem escopo (acesso total)
    user = _user(None)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    uid, headers = user.id, {"Authorization": f"Bearer {create_access_token(user)}"}
    out = await _make_output(db, "postos")
    # antes: acessa qualquer marca
    assert client.get(f"/api/outputs/{out.id}", headers=headers).status_code == 200
    # admin restringe o usuario a 'duofy'
    resp = client.put(f"/api/admin/users/{uid}/brand-scope",
                      json={"brand_scope": ["duofy"]}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["brand_scope"] == ["duofy"]
    # depois: bloqueado em 'postos'
    assert client.get(f"/api/outputs/{out.id}", headers=headers).status_code == 404


async def test_scoped_user_blocked_from_other_brand_document_delete(client, db) -> None:
    from app.models import Document, Source

    headers = await _scoped_headers(db, ["duofy"])
    source = Source(name="x", source_type="upload", url=None)
    db.add(source)
    await db.flush()
    doc = Document(
        source_id=source.id, brand_slug="postos", category="general", filename="f.pdf",
        stored_path="/tmp/x", content_type="application/pdf", file_size=1, status="indexed",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    assert client.delete(f"/api/documents/{doc.id}", headers=headers).status_code == 404
    # o documento continua existindo (nao foi apagado)
    still = (await db.execute(select(Document).where(Document.id == doc.id))).scalar_one_or_none()
    assert still is not None
