from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://duofy:duofy@localhost:5432/duofy_v1"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-local-dev-only-32-bytes-minimum"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    backend_cors_origins: str = "http://localhost:3000"
    admin_email: str = "admin@duofy.com.br"
    admin_password: str = "admin123456"
    admin_name: str = "Admin Duofy"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
