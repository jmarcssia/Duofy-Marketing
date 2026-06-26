from __future__ import annotations

from app.settings import get_settings


def test_cors_origins_can_be_configured_as_comma_separated_env(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    get_settings.cache_clear()

    assert get_settings().cors_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    get_settings.cache_clear()
