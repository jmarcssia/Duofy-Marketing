"""Valida um documento gerado contra as regras de maquina do agente."""

from __future__ import annotations

import re
from unicodedata import combining, normalize

from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    required_sections_for,
)

_CITATION_RE = re.compile(r"\[\d+\]")


def _plain_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def validate_document(
    content: str, agent_slug: str, channel: str | None = None
) -> list[dict]:
    text = content or ""
    lower = text.lower()
    violations: list[dict] = []

    plain_text = _plain_text(text)
    for section in required_sections_for(agent_slug, channel):
        # secao presente se aparece como cabecalho markdown "## Secao"
        # (case- e acento-insensitive: templates/prompts variam a grafia dos acentos)
        pattern = re.compile(
            r"^#{1,6}\s*" + re.escape(_plain_text(section)),
            re.IGNORECASE | re.MULTILINE,
        )
        if not pattern.search(plain_text):
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
