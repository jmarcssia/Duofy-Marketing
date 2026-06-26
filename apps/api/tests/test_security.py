from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.security import hash_password, verify_password


def test_password_hash_round_trip() -> None:
    password_hash = hash_password("admin123456")

    assert verify_password("admin123456", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_me_requires_token() -> None:
    response = TestClient(app).get("/api/auth/me")

    assert response.status_code == 401
