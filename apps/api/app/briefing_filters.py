"""Briefing estruturado (filtros clicáveis) compartilhado por pesquisa, cocriação e calendário.

O frontend envia um dict de filtros (taxonomia em apps/web/lib/briefing/). Aqui ele vira
texto de prompt DETERMINÍSTICO e sanitizado (V4) — um único ponto de composição para os
três fluxos. Chaves desconhecidas são ignoradas; tudo é opcional; nada é obrigatório.
"""

from __future__ import annotations

from typing import Any

from app.prompt_safety import sanitize_prompt_input

# Rótulos PT dos campos aceitos, na ordem em que entram no prompt.
_FIELD_LABELS: tuple[tuple[str, str], ...] = (
    ("segmento", "Segmento"),
    ("subsegmentos", "Subsegmentos"),
    ("personas", "Personas (quem sente a dor)"),
    ("decisores", "Decisores"),
    ("jornadas", "Jornada / etapa de negócio"),
    ("funil", "Etapa de funil"),
    ("objetivo", "Objetivo"),
    ("objetivos", "Objetivos"),
    ("tipos_pesquisa", "Tipo de pesquisa"),
    ("escopo_geografico", "Escopo geográfico"),
    ("periodo", "Período analisado"),
    ("profundidade", "Profundidade"),
    ("fontes", "Fontes preferidas"),
    ("entregaveis", "Entregáveis esperados"),
    ("canais", "Canais de conteúdo"),
    ("formatos", "Formatos"),
    ("pecas", "Peças e subpeças"),
    ("finalidade", "Finalidade"),
    ("tom", "Tom de voz"),
    ("cta", "CTA"),
    ("restricoes", "Restrições de marca/conteúdo"),
    ("nutricao", "Nutrição de leads"),
    ("imprensa", "Assessoria de imprensa"),
    ("publicacao", "Publicação"),
    ("concorrentes", "Concorrentes específicos"),
    ("temas_relacionados", "Temas relacionados"),
    ("contexto", "Contexto adicional"),
    ("observacoes", "Observações"),
)

_MAX_ITEMS = 24
_MAX_TOTAL = 4000


def _clean_value(value: Any) -> str:
    if isinstance(value, bool):
        return "sim" if value else ""
    if isinstance(value, (list, tuple)):
        items = [sanitize_prompt_input(str(v), max_len=160) for v in list(value)[:_MAX_ITEMS]]
        return "; ".join(item for item in items if item)
    if isinstance(value, dict):
        pairs: list[str] = []
        for key, val in list(value.items())[:_MAX_ITEMS]:
            cleaned = _clean_value(val)
            if cleaned:
                pairs.append(f"{sanitize_prompt_input(str(key), max_len=60)}: {cleaned}")
        return "; ".join(pairs)
    return sanitize_prompt_input(str(value), max_len=400)


def briefing_filters_to_prompt(filters: dict | None) -> str:
    """Converte o dict de filtros em linhas "- Rótulo: valores" (vazio se não houver nada)."""
    if not isinstance(filters, dict) or not filters:
        return ""
    lines: list[str] = []
    for key, label in _FIELD_LABELS:
        if key not in filters:
            continue
        value = _clean_value(filters.get(key))
        if value:
            lines.append(f"- {label}: {value}")
    return "\n".join(lines)[:_MAX_TOTAL]


def normalize_briefing_filters(filters: dict | None) -> dict | None:
    """Filtra o dict para as chaves conhecidas e valores não vazios (para persistência)."""
    if not isinstance(filters, dict):
        return None
    known = {key for key, _ in _FIELD_LABELS}
    cleaned = {
        key: value
        for key, value in filters.items()
        if key in known and value not in (None, "", [], {})
    }
    return cleaned or None
