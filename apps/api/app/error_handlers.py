from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.llm import LLMConfigurationError

logger = logging.getLogger(__name__)


async def _llm_configuration_handler(request: Request, exc: Exception) -> JSONResponse:
    # Falha de configuracao/uso do provedor: erro do cliente, nao 500.
    return JSONResponse(
        status_code=422,
        content={"error": "llm_configuration", "detail": str(exc)},
    )


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Erro nao tratado em %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Erro interno inesperado."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Respostas de erro JSON consistentes para o frontend."""
    app.add_exception_handler(LLMConfigurationError, _llm_configuration_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
