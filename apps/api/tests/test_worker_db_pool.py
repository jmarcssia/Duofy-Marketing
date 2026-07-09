"""Regressão: o worker Celery chama `asyncio.run()` uma vez por tarefa, cada
invocação com seu próprio event loop. Um engine com pool default (que recicla
conexões asyncpg entre chamadas) quebra na segunda invocação, porque a conexão
devolvida ao pool na primeira chamada fica presa ao event loop já fechado dela.
`app.db.build_engine(null_pool=True)` — usado pelo worker desde o fix — evita
isso abrindo/fechando a conexão a cada uso, sem reciclar entre event loops.

Não usa `@pytest.mark.anyio`: cada teste chama `asyncio.run()` diretamente,
fora do harness assíncrono do pytest, para reproduzir fielmente o padrão real
do worker (`asyncio.run(_execute(task_id))` por tarefa).
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import build_engine
from app.settings import get_settings


def test_pooled_engine_breaks_across_sequential_asyncio_run():
    """Prova o bug: engine com pool default reusado por dois asyncio.run()
    sequenciais (o padrão que o worker usava antes do fix) quebra na segunda
    chamada, porque a conexão devolvida ao pool na primeira chamada fica presa
    ao event loop já fechado dela.

    A mensagem exata varia por plataforma/driver (no Linux, onde o worker real
    roda, o asyncpg lança "attached to a different loop"; no Windows o
    ProactorEventLoop fechado se manifesta como AttributeError num nível mais
    baixo) — em ambos os casos é o mesmo bug de fundo, então a asserção só
    verifica que a segunda chamada quebra, sem casar uma mensagem específica.
    """
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_size=2, max_overflow=0)

    async def ping() -> None:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    asyncio.run(ping())
    with pytest.raises(Exception):  # noqa: B017 - a exceção real é dependente de plataforma
        asyncio.run(ping())


def test_worker_engine_survives_multiple_sequential_asyncio_run():
    """Prova o fix: o engine que o worker usa de fato (build_engine(null_pool=True))
    sobrevive a múltiplas chamadas sequenciais de asyncio.run(), exatamente como o
    worker faz uma vez por tarefa processada."""
    engine = build_engine(null_pool=True)

    async def ping() -> int | None:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar()

    results = [asyncio.run(ping()) for _ in range(3)]
    assert results == [1, 1, 1]

    async def cleanup() -> None:
        await engine.dispose()

    asyncio.run(cleanup())
