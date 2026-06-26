import pytest

from app import quality_guardian
from app.llm import LLMResult
from app.models import Agent, Output, OutputVersion, ProviderCredential
from app.quality_guardian import assess_output_quality, assess_output_quality_hybrid


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _output(brand_slug: str = "duofy_solucoes", channel: str = "LinkedIn") -> Output:
    return Output(
        id=1,
        brand_slug=brand_slug,
        category="general",
        channel=channel,
        format="Post LinkedIn",
        title="Teste",
        briefing="Briefing de teste",
        status="draft",
        provider="local",
        model="test",
    )


def _version(content: str) -> OutputVersion:
    return OutputVersion(
        id=1,
        output_id=1,
        version_number=1,
        content=content,
    )


def _good_content() -> str:
    return """
# Post LinkedIn

## Metadados editoriais

- Marca: Duofy Soluções

## Persona e contexto

Gestores de marketing B2B que precisam estruturar conteúdo com mais consistência.

## Dor principal

Times produzem muito, mas sem direção editorial clara.

## Solução proposta

Usar a Duofy para organizar briefing, memória, revisão e aprovação em um fluxo único.

## Conteúdo final

Texto profissional com tese, contexto e recomendação prática para a audiência.

## CTA

Solicite uma análise do fluxo editorial atual.

## Direção visual

Visual institucional, limpo e com hierarquia clara.
"""


def _credential() -> ProviderCredential:
    return ProviderCredential(provider="openrouter", display_name="OpenRouter", is_enabled=True)


async def _fake_settings(_db):
    return "hybrid", "openrouter", "openai/gpt-4o-mini"


async def _fake_agent(_db):
    return Agent(slug="quality_guardian", name="Guardião", default_model="openai/gpt-4o-mini")


async def _fake_credential(_db, _output_obj, _provider, _model, _agent):
    return _credential(), "openai/gpt-4o-mini"


async def _fake_token_budget(_db, _slug):
    return 1500


def _patch_hybrid_dependencies(monkeypatch, call_llm):
    monkeypatch.setattr(quality_guardian, "_quality_settings", _fake_settings)
    monkeypatch.setattr(quality_guardian, "_quality_agent", _fake_agent)
    monkeypatch.setattr(quality_guardian, "_quality_credential", _fake_credential)
    monkeypatch.setattr(quality_guardian, "get_token_budget", _fake_token_budget)
    monkeypatch.setattr(quality_guardian, "call_llm", call_llm)


def test_quality_guardian_passes_structured_content() -> None:
    assessment = assess_output_quality(_output(), _version(_good_content()))

    assert assessment.passed is True
    assert assessment.score >= 80
    assert assessment.critical_failures == []


def test_quality_guardian_blocks_placeholder() -> None:
    content = """
# Post

## Conteúdo final

[preencher]
"""
    assessment = assess_output_quality(_output(), _version(content))

    assert assessment.passed is False
    assert assessment.critical_failures


def test_quality_guardian_blocks_brand_mix() -> None:
    content = """
# Conteúdo DeathCare

## Persona e contexto

Operadoras de planos funerários.

## Conteúdo final

Este material fala de pista, bomba de combustível e loja de conveniência.

## CTA

Fale com a equipe.
"""
    assessment = assess_output_quality(_output(brand_slug="deathcare"), _version(content))

    assert assessment.passed is False
    assert any("DeathCare" in item for item in assessment.critical_failures)


@pytest.mark.anyio
async def test_quality_guardian_hybrid_local_only_does_not_call_llm(monkeypatch) -> None:
    async def fake_settings(_db):
        return "hybrid", None, None

    async def fail_call_llm(**_kwargs):
        raise AssertionError("LLM should not be called in local_only mode")

    monkeypatch.setattr(quality_guardian, "_quality_settings", fake_settings)
    monkeypatch.setattr(quality_guardian, "call_llm", fail_call_llm)

    assessment = await assess_output_quality_hybrid(
        object(),
        _output(),
        _version(_good_content()),
        mode_override="local_only",
    )

    assert assessment.passed is True
    assert assessment.review_mode == "local_only"
    assert assessment.llm_provider is None


@pytest.mark.anyio
async def test_quality_guardian_hybrid_uses_mocked_llm(monkeypatch) -> None:
    async def fake_call_llm(**_kwargs):
        return LLMResult(
            output=(
                '{"score": 92, "status": "approved", "summary": "Aprovado.", '
                '"critical_failures": [], "required_fixes": [], '
                '"optional_improvements": ["Refinar exemplo."], '
                '"verified_sources": ["Memória declarada."], "confidence": 0.86}'
            ),
            provider="openrouter",
            model="openai/gpt-4o-mini",
        )

    _patch_hybrid_dependencies(monkeypatch, fake_call_llm)

    assessment = await assess_output_quality_hybrid(
        object(),
        _output(),
        _version(_good_content()),
    )

    assert assessment.passed is True
    assert assessment.review_mode == "hybrid"
    assert assessment.llm_provider == "openrouter"
    assert assessment.llm_model == "openai/gpt-4o-mini"
    assert assessment.confidence == 0.86


@pytest.mark.anyio
async def test_quality_guardian_hybrid_invalid_json_falls_back_to_local(monkeypatch) -> None:
    async def fake_call_llm(**_kwargs):
        return LLMResult(output="not-json", provider="openrouter", model="openai/gpt-4o-mini")

    _patch_hybrid_dependencies(monkeypatch, fake_call_llm)

    assessment = await assess_output_quality_hybrid(
        object(),
        _output(),
        _version(_good_content()),
    )

    assert assessment.passed is True
    assert assessment.review_mode == "hybrid"
    assert assessment.llm_error is not None


@pytest.mark.anyio
async def test_quality_guardian_llm_required_blocks_when_llm_fails(monkeypatch) -> None:
    async def fake_settings(_db):
        return "llm_required", "openrouter", "openai/gpt-4o-mini"

    async def fail_credential(*_args, **_kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(quality_guardian, "_quality_settings", fake_settings)
    monkeypatch.setattr(quality_guardian, "_quality_agent", _fake_agent)
    monkeypatch.setattr(quality_guardian, "_quality_credential", fail_credential)

    assessment = await assess_output_quality_hybrid(
        object(),
        _output(),
        _version(_good_content()),
    )

    assert assessment.passed is False
    assert assessment.status == "blocked"
    assert assessment.score == 0
    assert assessment.llm_error == "provider unavailable"


@pytest.mark.anyio
async def test_quality_guardian_local_critical_failure_overrides_llm_approval(
    monkeypatch,
) -> None:
    async def fake_call_llm(**_kwargs):
        return LLMResult(
            output=(
                '{"score": 100, "status": "approved", "summary": "Aprovado.", '
                '"critical_failures": [], "required_fixes": [], '
                '"optional_improvements": [], "verified_sources": [], "confidence": 0.9}'
            ),
            provider="openrouter",
            model="openai/gpt-4o-mini",
        )

    _patch_hybrid_dependencies(monkeypatch, fake_call_llm)
    content = """
# Post

## Conteúdo final

[preencher]
"""

    assessment = await assess_output_quality_hybrid(object(), _output(), _version(content))

    assert assessment.passed is False
    assert assessment.status == "blocked"
    assert assessment.critical_failures
