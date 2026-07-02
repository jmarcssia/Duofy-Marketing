"""Valida um documento gerado contra as regras de maquina do agente."""

from __future__ import annotations

import re

from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    required_sections_for,
)

_CITATION_RE = re.compile(r"\[\d+\]")


def validate_document(
    content: str, agent_slug: str, channel: str | None = None
) -> list[dict]:
    text = content or ""
    lower = text.lower()
    violations: list[dict] = []

    for section in required_sections_for(agent_slug, channel):
        # secao presente se aparece como cabecalho markdown "## Secao" (case-insensitive)
        pattern = re.compile(
            r"^#{1,6}\s*" + re.escape(section), re.IGNORECASE | re.MULTILINE
        )
        if not pattern.search(text):
            violations.append(
                {"severity": "required", "message": f"Seção obrigatória ausente: {section}."}
            )

    for term in forbidden_terms_for(agent_slug):
        if term.lower() in lower:
            violations.append(
                {"severity": "critical", "message": f"Termo proibido presente: '{term}'."}
            )

    if citation_required_for(agent_slug) and not _CITATION_RE.search(text):
        violations.append(
            {
                "severity": "critical",
                "message": "Nenhuma citação [n] encontrada (citação obrigatória).",
            }
        )

    return violations
