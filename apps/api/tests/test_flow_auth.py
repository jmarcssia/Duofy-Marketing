"""S0 — fluxo crítico: autenticação/JWT ponta a ponta contra Postgres real."""

from __future__ import annotations

import pytest

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD

pytestmark = pytest.mark.anyio


async def test_login_success_returns_token_and_user(client):
    resp = client.post("/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["role"] == "admin"


async def test_login_wrong_password_is_401(client):
    resp = client.post("/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": "senha-errada-123"})
    assert resp.status_code == 401


async def test_me_with_valid_token(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == ADMIN_EMAIL


async def test_me_without_token_is_401(client):
    assert client.get("/api/auth/me").status_code == 401


async def test_login_sets_httponly_cookie_and_authenticates(client):
    """C5: login define o cookie HttpOnly duofy_token; requests seguintes autenticam só por ele."""
    resp = client.post("/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    set_cookie = resp.headers.get("set-cookie", "")
    assert "duofy_token=" in set_cookie and "HttpOnly" in set_cookie
    assert "duofy_auth=" in set_cookie  # flag legível p/ o front (sem segredo)
    # o TestClient guarda o cookie: /me autentica SEM header Authorization
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == ADMIN_EMAIL
    # logout limpa o cookie -> volta a 401
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
