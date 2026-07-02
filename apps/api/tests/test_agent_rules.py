"""S0 — regras de maquina por agente (config/rules/agent_rules.yaml)."""

from __future__ import annotations

from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    get_agent_rules,
    min_sources_for,
    required_sections_for,
)


def test_min_sources_research():
    assert min_sources_for("research_agent", "quick") == 3
    assert min_sources_for("research_agent", "deep") == 5


def test_required_sections_research_has_fontes():
    secs = required_sections_for("research_agent")
    assert "Fontes" in secs
    assert "Resumo executivo" in secs


def test_forbidden_and_citation():
    assert "confiança nula" in [t.lower() for t in forbidden_terms_for("research_agent")]
    assert citation_required_for("research_agent") is True


def test_unknown_agent_is_empty_safe():
    assert get_agent_rules("inexistente") == {}
    assert min_sources_for("inexistente", "quick") == 3  # fallback
