from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Defaults inseguros, aceitaveis SOMENTE em desenvolvimento local.
DEFAULT_JWT_SECRET = "change-me-local-dev-only-32-bytes-minimum"
DEFAULT_ADMIN_PASSWORD = "admin123456"

# Ambientes tratados como "nao-producao": defaults inseguros sao tolerados.
_DEV_ENVS = {"development", "dev", "local", "test"}
_MIN_JWT_SECRET_LEN = 32


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://duofy:duofy@localhost:5432/duofy_v1"
    redis_url: str = "redis://redis:6379/0"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    # C2: segredo SEPARADO para a criptografia Fernet das chaves de provedor. Se definido,
    # rotacionar JWT_SECRET_KEY NÃO invalida as chaves cifradas. Se None, cai no jwt_secret_key
    # (retrocompatível — chaves já cifradas continuam decifráveis).
    fernet_secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    backend_cors_origins: str = "http://localhost:3000"
    admin_email: str = "admin@duofy.com.br"
    admin_password: str = DEFAULT_ADMIN_PASSWORD
    admin_name: str = "Admin Duofy"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() not in _DEV_ENVS

    @model_validator(mode="after")
    def _enforce_secret_hardening(self) -> Settings:
        """Falha rapido se segredos default/fracos forem usados fora de desenvolvimento."""
        if not self.is_production:
            return self

        problems: list[str] = []
        if self.jwt_secret_key == DEFAULT_JWT_SECRET or self.jwt_secret_key.startswith("change-me"):
            problems.append("JWT_SECRET_KEY ainda e o valor default/placeholder")
        if len(self.jwt_secret_key) < _MIN_JWT_SECRET_LEN:
            problems.append(f"JWT_SECRET_KEY tem menos de {_MIN_JWT_SECRET_LEN} caracteres")
        if self.admin_password == DEFAULT_ADMIN_PASSWORD:
            problems.append("ADMIN_PASSWORD ainda e o valor default")
        # C3: senha default do Postgres embutida na DATABASE_URL nao pode ir para producao.
        if "duofy:duofy@" in self.database_url:
            problems.append("DATABASE_URL usa a senha default do Postgres (duofy)")

        if problems:
            raise ValueError(
                f"Configuracao insegura para app_env='{self.app_env}': "
                + "; ".join(problems)
                + ". Defina segredos fortes via variaveis de ambiente "
                "(ex.: python -c \"import secrets; print(secrets.token_urlsafe(48))\")."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
