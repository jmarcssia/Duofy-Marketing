from __future__ import annotations

import pytest

from app import content_generation, research_service
from app.llm import LLMResult
from app.models import Agent, Brand, ProviderCredential


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# ---------------------------------------------------------------------------
# Fake DB session helpers
# ---------------------------------------------------------------------------

class _ScalarResult:
    def __init__(self, obj):
        self._obj = obj

    def scalar_one_or_none(self):
        return self._obj

    def scalar_one(self):
        return self._obj

    def scalars(self):
        return self

    def all(self):
        return [self._obj] if self._obj is not None else []

    def first(self):
        return self._obj


class _FakeSession:
    """Fake AsyncSession that returns objects from a queue for successive execute() calls."""

    def __init__(self, *objects):
        self._queue = list(objects)
        self._idx = 0

    async def execute(self, *args, **kwargs):
        obj = self._queue[self._idx % len(self._queue)]
        self._idx += 1
        return _ScalarResult(obj)

    def add(self, obj):
        pass

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass


# ---------------------------------------------------------------------------
# Shared fake objects
# ---------------------------------------------------------------------------

def _credential() -> ProviderCredential:
    return ProviderCredential(
        id=1,
        provider="openrouter",
        display_name="OpenRouter",
        api_key_encrypted="enc:fake",
        default_model="openai/gpt-4o-mini",
        base_url=None,
        is_enabled=True,
    )


def _agent(slug: str) -> Agent:
    return Agent(
        id=1,
        slug=slug,
        name=slug,
        default_model="openai/gpt-4o-mini",
        is_active=True,
    )


def _brand(slug: str = "test_brand") -> Brand:
    return Brand(
        id=1,
        slug=slug,
        name="Test Brand",
        niche="tech",
        description="A test brand",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# research_agent budget test
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_research_uses_resolved_budget(monkeypatch):
    captured = {}

    async def fake_budget(db, slug):
        assert slug == "research_agent"
        return 6000

    async def fake_call_llm(**kwargs):
        captured["max_tokens"] = kwargs.get("max_tokens")
        return LLMResult(output="# Rel\ncorpo do relatorio", provider="openrouter", model="m")

    async def fake_collect(db, payload, brand):
        # >= min de fontes para passar a porta de fontes minimas (Task 3)
        from app.research_service import CollectedSource

        return [
            CollectedSource(
                title=f"Fonte {i}", url=f"https://exemplo{i}.com", publisher=None,
                published_at=None, reliability="C", source_kind="rss",
                status="collected", evidence="trecho", error=None,
            )
            for i in range(3)
        ]

    async def fake_rag(**kwargs):
        return ""

    monkeypatch.setattr(research_service, "get_token_budget", fake_budget)
    monkeypatch.setattr(research_service, "call_llm", fake_call_llm)
    monkeypatch.setattr(research_service, "collect_research_sources", fake_collect)
    monkeypatch.setattr(research_service, "build_rag_context", fake_rag)

    cred = _credential()
    agent = _agent("research_agent")
    brand = _brand()

    # run_market_research does 3 DB queries: agent, brand, credential
    db = _FakeSession(agent, brand, cred)

    from app.schemas import ResearchRunRequest

    payload = ResearchRunRequest(
        brand_slug="test_brand",
        theme="AI trends",
        period="2024",
        depth="quick",
    )

    await research_service.run_market_research(db, payload)
    assert captured["max_tokens"] == 6000, (
        f"Expected max_tokens=6000 but got {captured.get('max_tokens')!r}"
    )


# ---------------------------------------------------------------------------
# content_agent budget test
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_content_uses_resolved_budget(monkeypatch):
    captured = {}

    async def fake_budget(db, slug):
        assert slug == "content_agent"
        return 4000

    async def fake_call_llm(**kwargs):
        captured["max_tokens"] = kwargs.get("max_tokens")
        return LLMResult(
            output="# Post\n\ncorpo do post de teste",
            provider="openrouter",
            model="m",
        )

    async def fake_rag(**kwargs):
        return ""

    monkeypatch.setattr(content_generation, "get_token_budget", fake_budget)
    monkeypatch.setattr(content_generation, "call_llm", fake_call_llm)
    monkeypatch.setattr(content_generation, "build_rag_context", fake_rag)

    cred = _credential()
    agent = _agent("content_agent")
    brand = _brand()

    # generate_content_output does 3 DB queries: agent, brand, credential
    db = _FakeSession(agent, brand, cred)

    from app.schemas import ContentGenerateRequest

    payload = ContentGenerateRequest(
        brand_slug="test_brand",
        channel="LinkedIn",
        format="Post LinkedIn",
        category="general",
        briefing="Teste de conteudo para o budget",
    )

    await content_generation.generate_content_output(db, payload)
    assert captured["max_tokens"] == 4000, (
        f"Expected max_tokens=4000 but got {captured.get('max_tokens')!r}"
    )
