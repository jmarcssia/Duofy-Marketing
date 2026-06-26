from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


def test_health_reports_ok_when_dependencies_are_available(monkeypatch) -> None:
    async def postgres_ok() -> bool:
        return True

    async def redis_ok() -> bool:
        return True

    monkeypatch.setattr(main, "check_postgres", postgres_ok)
    monkeypatch.setattr(main, "check_redis", redis_ok)

    response = TestClient(main.app).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "services": {
            "api": {"status": "ok"},
            "postgres": {"status": "ok"},
            "redis": {"status": "ok"},
        },
    }
