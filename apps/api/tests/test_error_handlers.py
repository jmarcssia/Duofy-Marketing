from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.error_handlers import register_exception_handlers
from app.llm import LLMConfigurationError


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom-llm")
    async def boom_llm() -> dict[str, str]:
        raise LLMConfigurationError("provedor nao configurado")

    @app.get("/boom-generic")
    async def boom_generic() -> dict[str, str]:
        raise ValueError("algo inesperado")

    return app


def test_llm_configuration_error_maps_to_422() -> None:
    client = TestClient(_build_app())
    response = client.get("/boom-llm")
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "llm_configuration"
    assert "provedor" in body["detail"]


def test_unhandled_error_maps_to_500_json() -> None:
    client = TestClient(_build_app(), raise_server_exceptions=False)
    response = client.get("/boom-generic")
    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "internal_error"
    assert "detail" in body
