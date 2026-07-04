"""FASE 9 — Publicações e Canais: canais, fila, publicação (manual + Meta stub honesto), C1."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Publication, User
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _user(scope: list[str] | None) -> User:
    return User(
        email=f"pub-{uuid4().hex[:10]}@t.com", name="P", password_hash=hash_password("x" * 10),
        role="manager", is_active=True, brand_scope=scope,
    )


async def _scoped_headers(db, brands: list[str]) -> dict:
    user = _user(brands)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _create_channel(client, headers, brand: str = "duofy"):
    return client.post(
        "/api/publications/channels",
        json={"brand_slug": brand, "platform": "instagram", "display_name": "IG Duofy"},
        headers=headers,
    )


def _create_pub(client, headers, brand: str = "duofy"):
    return client.post(
        "/api/publications",
        json={"brand_slug": brand, "title": "Post 1", "caption": "Olá", "post_type": "feed"},
        headers=headers,
    )


async def test_connect_channel_is_pending(client, auth_headers) -> None:
    r = _create_channel(client, auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"  # conexão real é fase futura


async def test_create_and_list_publication(client, auth_headers) -> None:
    r = _create_pub(client, auth_headers)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    lst = client.get("/api/publications?brand_slug=duofy", headers=auth_headers).json()
    assert any(p["id"] == pid for p in lst)


async def test_manual_publish_registers(client, auth_headers) -> None:
    pid = _create_pub(client, auth_headers).json()["id"]
    r = client.post(f"/api/publications/{pid}/publish?target=manual", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["publish_ref"] == "manual"
    assert body["published_at"]


async def test_meta_publish_does_not_fake_success(client, auth_headers, db) -> None:
    pid = _create_pub(client, auth_headers).json()["id"]
    r = client.post(f"/api/publications/{pid}/publish?target=meta", headers=auth_headers)
    assert r.status_code == 400  # stub honesto: nunca finge sucesso
    pub = (await db.execute(select(Publication).where(Publication.id == pid))).scalar_one()
    assert pub.status != "published"
    assert pub.published_at is None


async def test_scoped_user_blocked_from_other_brand_channel(client, db) -> None:
    headers = await _scoped_headers(db, ["duofy"])
    r = client.post(
        "/api/publications/channels",
        json={"brand_slug": "postos", "platform": "instagram", "display_name": "x"},
        headers=headers,
    )
    assert r.status_code == 404


async def test_scoped_user_publication_list_excludes_other_brand(client, auth_headers, db) -> None:
    _create_pub(client, auth_headers, "duofy")
    _create_pub(client, auth_headers, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    lst = client.get("/api/publications", headers=headers).json()
    assert "postos" not in {p["brand_slug"] for p in lst}
