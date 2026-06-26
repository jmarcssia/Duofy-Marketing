from __future__ import annotations

import asyncio

import httpx

from app.llm import _post_with_retry


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_retries_on_503_then_succeeds() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] < 3:
            return httpx.Response(503, text="indisponivel")
        return httpx.Response(200, json={"ok": True})

    async def run() -> httpx.Response:
        async with _client(handler) as client:
            return await _post_with_retry(
                client, "http://test/x", headers={}, payload={}, base_delay=0
            )

    response = asyncio.run(run())
    assert response.status_code == 200
    assert attempts["n"] == 3


def test_retries_on_timeout_then_succeeds() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise httpx.ReadTimeout("simulado", request=request)
        return httpx.Response(200, json={"ok": True})

    async def run() -> httpx.Response:
        async with _client(handler) as client:
            return await _post_with_retry(
                client, "http://test/x", headers={}, payload={}, base_delay=0
            )

    response = asyncio.run(run())
    assert response.status_code == 200
    assert attempts["n"] == 2


def test_gives_up_after_max_attempts_on_persistent_503() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(503, text="fora do ar")

    async def run() -> httpx.Response:
        async with _client(handler) as client:
            return await _post_with_retry(
                client, "http://test/x", headers={}, payload={}, max_attempts=3, base_delay=0
            )

    response = asyncio.run(run())
    # Devolve a ultima resposta; o chamador faz raise_for_status -> erro de provedor.
    assert response.status_code == 503
    assert attempts["n"] == 3


def test_does_not_retry_on_400() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(400, text="pedido invalido")

    async def run() -> httpx.Response:
        async with _client(handler) as client:
            return await _post_with_retry(
                client, "http://test/x", headers={}, payload={}, base_delay=0
            )

    response = asyncio.run(run())
    assert response.status_code == 400
    assert attempts["n"] == 1
