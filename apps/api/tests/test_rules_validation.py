"""S0 — validacao de documento contra as regras de maquina."""

from __future__ import annotations

from app.rules_validation import validate_document

_OK_RESEARCH = (
    "# Relatorio\n\n## Resumo executivo\nAlgo [1].\n\n## Sinais de mercado\nx [1]\n\n"
    "## Oportunidades\nx\n\n## Concorrentes\nx\n\n## Riscos\nx\n\n## Recomendações\nx\n\n"
    "## Sugestões de pauta\nx\n\n## Fontes\n[1] exemplo.com\n"
)


def test_valid_research_has_no_violations():
    assert validate_document(_OK_RESEARCH, "research_agent") == []


def test_missing_section_is_required_violation():
    content = _OK_RESEARCH.replace("## Fontes\n[1] exemplo.com\n", "")
    viols = validate_document(content, "research_agent")
    assert any(v["severity"] == "required" and "Fontes" in v["message"] for v in viols)


def test_forbidden_term_is_critical():
    content = _OK_RESEARCH + "\nConfiança nula sobre tudo.\n"
    viols = validate_document(content, "research_agent")
    assert any(v["severity"] == "critical" for v in viols)


def test_no_citation_flags_when_required():
    content = _OK_RESEARCH.replace("[1]", "")  # remove todas as citacoes
    viols = validate_document(content, "research_agent")
    assert any("cita" in v["message"].lower() for v in viols)
