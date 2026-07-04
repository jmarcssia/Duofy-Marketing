from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.settings import (
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_JWT_SECRET,
    Settings,
    get_settings,
)

STRONG_JWT = "x7Qm2vL9pR4tZ8wK3nB6yH1sD5fG0jC2aE4uI7oP9rT1mN3"  # >=32, sem 'change-me'
STRONG_ADMIN = "S3nh4-Admin-Forte-2026"
SAFE_DB = "postgresql+asyncpg://duofy_app:S3nh4Forte@db:5432/duofy_v1"


def test_production_rejects_default_jwt_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_secret_key=DEFAULT_JWT_SECRET,
            admin_password=STRONG_ADMIN,
        )


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production", jwt_secret_key="curto", admin_password=STRONG_ADMIN)


def test_production_rejects_default_admin_password() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_secret_key=STRONG_JWT,
            admin_password=DEFAULT_ADMIN_PASSWORD,
        )


def test_production_rejects_default_db_password() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_secret_key=STRONG_JWT,
            admin_password=STRONG_ADMIN,
            database_url="postgresql+asyncpg://duofy:duofy@db:5432/duofy_v1",
        )


def test_production_accepts_strong_secrets() -> None:
    settings = Settings(
        app_env="production",
        jwt_secret_key=STRONG_JWT,
        admin_password=STRONG_ADMIN,
        database_url=SAFE_DB,
    )
    assert settings.app_env == "production"


def test_development_allows_defaults() -> None:
    settings = Settings(
        app_env="development",
        jwt_secret_key=DEFAULT_JWT_SECRET,
        admin_password=DEFAULT_ADMIN_PASSWORD,
    )
    assert settings.app_env == "development"


def test_cors_origins_can_be_configured_as_comma_separated_env(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    get_settings.cache_clear()

    assert get_settings().cors_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    get_settings.cache_clear()
