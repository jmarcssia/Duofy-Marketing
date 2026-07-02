"""S0 — o Guardiao incorpora as violacoes de regras de maquina."""

from __future__ import annotations

from app.models import Output, OutputVersion
from app.quality_guardian import assess_output_quality


def _research_output() -> Output:
    return Output(
        id=1,
        brand_slug="deathcare",
        category="research",
        channel="Pesquisa",
        format="research_report",
        title="R",
        briefing="b",
        status="draft",
        provider="openrouter",
        model="x",
    )


def _version(content: str) -> OutputVersion:
    return OutputVersion(
        id=1,
        output_id=1,
        version_number=1,
        content=content,
        editor_note="t",
    )


def test_guardian_flags_forbidden_term_as_critical() -> None:
    output = _research_output()
    version = _version("# R\n\n## Resumo executivo\nConfiança nula.\n")

    assessment = assess_output_quality(output, version)

    joined = " ".join(assessment.critical_failures).lower()
    assert "proibido" in joined or "confiança nula" in joined
