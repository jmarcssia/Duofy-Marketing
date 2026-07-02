"""Infraestrutura de testes de integração (S0 — rede de segurança).

Aponta a app para um Postgres de teste real (pgvector), semeia dados estáticos
uma vez por sessão e trunca as tabelas dinâmicas entre os testes. Segue a
convenção async do projeto (anyio + @pytest.mark.anyio).

Pré-requisito: o banco de teste precisa estar migrado (`alembic upgrade head`).
Localmente já foi feito; no CI é um passo anterior ao pytest. Aponte DATABASE_URL
via ambiente para usar outro servidor.
"""

from __future__ import annotations

import os

# IMPORTANTE: definir o ambiente ANTES de importar qualquer módulo da app,
# para que o engine global (app.db) e as settings apontem para o banco de teste.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-with-32-bytes-minimum-xyz")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://duofy:duofy@127.0.0.1:5433/duofy_v1_test",
)
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/1")
os.environ.setdefault("BACKEND_CORS_ORIGINS", "http://localhost:3000")

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.crypto import encrypt_secret  # noqa: E402
from app.db import AsyncSessionLocal, engine  # noqa: E402
from app.models import Agent, Brand, ProviderCredential, User  # noqa: E402
from app.security import create_access_token, hash_password  # noqa: E402

# Tabelas com dados de negócio criados durante os testes — truncadas a cada teste.
DYNAMIC_TABLES = [
    "content_themes",
    "research_themes",
    "output_comments",
    "output_decisions",
    "output_versions",
    "quality_reviews",
    "research_sources",
    "calendar_events",
    "document_chunks",
    "memory_entries",
    "documents",
    "sources",
    "chat_messages",
    "agent_logs",
    "agent_tasks",
    "chat_sessions",
    "model_calls",
    "audit_events",
    "reports",
    "outputs",
    "agent_runs",
]

ADMIN_EMAIL = "admin.teste@duofy.com.br"
ADMIN_PASSWORD = "admin123456"

AGENTS = [
    ("orchestrator", "Orquestrador", "~anthropic/claude-sonnet-latest"),
    ("research_agent", "Pesquisa de Mercado", "~anthropic/claude-sonnet-latest"),
    ("content_agent", "Cocriação de Conteúdo", "~anthropic/claude-sonnet-latest"),
    ("press_agent", "Assessoria de Imprensa", "~anthropic/claude-sonnet-latest"),
    ("quality_guardian", "Guardião de Qualidade", "~anthropic/claude-sonnet-latest"),
    ("metrics_agent", "Métricas Internas", "openai/gpt-4o-mini"),
]

BRANDS = [
    ("duofy", "Duofy Soluções", "tecnologia"),
    ("postos", "Postos de Combustíveis", "varejo"),
]

# Providers habilitados com chave fictícia (cifrada) — o LLM é mockado nos testes,
# mas a busca de credencial exige is_enabled=True e uma chave presente.
PROVIDERS = [
    ("openrouter", "OpenRouter", "~anthropic/claude-sonnet-latest"),
    ("openai_embeddings", "OpenAI Embeddings", "text-embedding-3-small"),
    ("openai", "OpenAI", "gpt-4o-mini"),
]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def _seed_static() -> None:
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(text("SELECT id FROM users WHERE email=:e"),
                                     {"e": ADMIN_EMAIL})).first()
        if existing is None:
            db.add(User(email=ADMIN_EMAIL, name="Admin Teste",
                        password_hash=hash_password(ADMIN_PASSWORD),
                        role="admin", is_active=True))
        for slug, name, niche in BRANDS:
            found = (await db.execute(text("SELECT id FROM brands WHERE slug=:s"),
                                      {"s": slug})).first()
            if found is None:
                db.add(Brand(slug=slug, name=name, niche=niche,
                             description=f"{name} — marca de teste", is_active=True))
        for slug, name, model in AGENTS:
            found = (await db.execute(text("SELECT id FROM agents WHERE slug=:s"),
                                      {"s": slug})).first()
            if found is None:
                db.add(Agent(slug=slug, name=name, default_model=model, is_active=True))
        for provider, display_name, model in PROVIDERS:
            found = (await db.execute(
                text("SELECT id FROM provider_credentials WHERE provider=:p"),
                {"p": provider})).first()
            if found is None:
                db.add(ProviderCredential(
                    provider=provider,
                    display_name=display_name,
                    api_key_encrypted=encrypt_secret("sk-test-dummy-key"),
                    is_enabled=True,
                    default_model=model,
                ))
        await db.commit()


@pytest.fixture(scope="session", autouse=True)
def _prepare_db():
    import anyio
    anyio.run(_seed_static)
    yield


@pytest.fixture(autouse=True)
def _clean_dynamic():
    """Trunca as tabelas dinâmicas depois de cada teste (mantém dados estáticos)."""
    yield
    import anyio

    async def _truncate() -> None:
        async with engine.begin() as conn:
            await conn.execute(
                text("TRUNCATE " + ", ".join(DYNAMIC_TABLES) + " RESTART IDENTITY CASCADE")
            )

    anyio.run(_truncate)


@pytest.fixture
async def db():
    async with AsyncSessionLocal() as session:
        yield session


@pytest.fixture
async def admin_user(db):
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
    return result.scalar_one()


@pytest.fixture
def auth_headers(admin_user):
    token = create_access_token(admin_user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


FAKE_OUTPUT_MD = (
    "# Novidade Duofy\n\n"
    "A Duofy apresenta uma solução de tecnologia para gestão que acelera resultados.\n\n"
    "## Benefícios\n\n- Mais eficiência\n- Menos retrabalho\n\n"
    "## Chamada para ação\n\nFale com a nossa equipe hoje mesmo.\n\n"
    "## Fontes\n\n- https://duofy.com.br\n"
)


class AIRecorder:
    """Captura as chamadas a call_llm para inspeção nos testes (ex.: modelo efetivo)."""

    def __init__(self) -> None:
        self.calls: list[dict] = []


@pytest.fixture
def patch_ai(monkeypatch):
    """Mocka call_llm (em todos os serviços) e embed_text, evitando rede real.

    O fake ecoa o `model` recebido no LLMResult — assim os testes podem verificar
    qual modelo foi efetivamente enviado ao provedor.
    """
    from app.llm import LLMResult

    recorder = AIRecorder()

    calendar_json = (
        '[{"title": "Post de lançamento", "description": "Anúncio do produto",'
        ' "event_type": "content", "channel": "instagram", "format": "post",'
        ' "start_at": "2026-08-05T10:00:00+00:00", "assigned_agent_slug": "content_agent"},'
        ' {"title": "Pauta de imprensa", "description": "Sugestão de pauta",'
        ' "event_type": "press", "start_at": "2026-08-08T09:00:00+00:00",'
        ' "assigned_agent_slug": "press_agent"}]'
    )

    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        recorder.calls.append({
            "provider": credential.provider,
            "model": model,
            "task_type": kwargs.get("task_type"),
            "agent_slug": kwargs.get("agent_slug"),
            "brand_slug": kwargs.get("brand_slug"),
        })
        output = calendar_json if kwargs.get("task_type") == "calendar_generation" else FAKE_OUTPUT_MD
        return LLMResult(
            output=output,
            provider=credential.provider,
            model=model,
            input_tokens=120,
            output_tokens=240,
            total_tokens=360,
            estimated_cost_usd=0.0012,
            latency_ms=42,
            raw_usage={"prompt_tokens": 120, "completion_tokens": 240},
        )

    async def fake_embed_text(db, text):
        return [0.001] * 1536

    import importlib

    for mod in (
        "content_generation", "calendar_service", "research_service",
        "orchestrator", "quality_guardian", "orchestrator_planning", "briefing_service",
    ):
        try:
            importlib.import_module(f"app.{mod}")
        except ModuleNotFoundError:
            # briefing_service ainda nao existe (chega em tarefa seguinte); ignorar.
            continue
        monkeypatch.setattr(f"app.{mod}.call_llm", fake_call_llm, raising=False)
    # embed_text é importado por nome em vários módulos; patchear em cada namespace.
    for target in ("app.embeddings.embed_text", "app.rag.embed_text",
                   "app.output_workflow.embed_text", "app.research_service.embed_text",
                   "app.routers.documents.embed_text"):
        monkeypatch.setattr(target, fake_embed_text, raising=False)
    return recorder
