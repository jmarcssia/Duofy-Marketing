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
    # Piso de seguranca: a Profunda mira o maximo (coleta multi-angulo), mas so recusa
    # se nao houver nem 3 fontes usaveis.
    assert min_sources_for("research_agent", "quick") == 3
    assert min_sources_for("research_agent", "deep") == 3


def test_required_sections_research_has_core():
    secs = required_sections_for("research_agent")
    assert "Resumo executivo" in secs
    assert "Referências" in secs


def test_forbidden_and_citation():
    assert "confiança nula" in [t.lower() for t in forbidden_terms_for("research_agent")]
    assert citation_required_for("research_agent") is True


def test_unknown_agent_is_empty_safe():
    assert get_agent_rules("inexistente") == {}
    assert min_sources_for("inexistente", "quick") == 3  # fallback
