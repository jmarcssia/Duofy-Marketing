"""Sanitização de entradas livres antes de irem para o prompt do LLM (V4).

Objetivo: neutralizar tentativas de prompt injection em campos controlados pelo
usuário (tema/período/briefing) ou recuperados (contexto RAG), PRESERVANDO o
conteúdo legítimo. Defesa em profundidade — não é uma barreira absoluta.
"""

from __future__ import annotations

import re

# Instruções suspeitas típicas de injection (PT/EN). Case-insensitive.
_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+instructions?", re.I),
    re.compile(r"disregard\s+(all\s+)?(the\s+)?(previous|prior|above)(\s+instructions?)?", re.I),
    re.compile(r"forget\s+(everything|all|the\s+above|previous|prior)", re.I),
    re.compile(r"(you\s+are\s+now|act\s+as|pretend\s+to\s+be|you\s+must\s+now)\b", re.I),
    re.compile(r"new\s+instructions?\s*:", re.I),
    re.compile(r"system\s*prompt", re.I),
    re.compile(r"prompt\s+do\s+sistema", re.I),
    re.compile(r"desconsidere\s+(as\s+)?(instruç(õ|o)es|orientaç(õ|o)es)(\s+anteriores)?", re.I),
    re.compile(r"ignore\s+(as\s+)?(instruç(õ|o)es|orientaç(õ|o)es)", re.I),
    re.compile(r"esque(ç|c)a\s+(tudo|as\s+instruç(õ|o)es|o\s+que)", re.I),
    re.compile(r"(aja|atue)\s+como\b", re.I),
    re.compile(r"finja\s+(ser|que)\b", re.I),
)

# Rótulos de papel no início de linha (system:/assistant:/user:/role:).
_ROLE_LABEL = re.compile(
    r"(?im)^\s*(system|assistant|user|função|funcao|role|sistema)\s*:"
)

# Runs de delimitadores que poderiam "quebrar" o prompt.
_DELIMITERS = re.compile(r"`{2,}|#{2,}|-{3,}|={3,}|~{3,}|\|{2,}")

_PLACEHOLDER = " [conteúdo removido] "


def sanitize_prompt_input(
    text: str | None, *, max_len: int = 2000, preserve_newlines: bool = False
) -> str:
    """Neutraliza instruções suspeitas, remove delimitadores e limita o tamanho.

    ``preserve_newlines`` mantém quebras de linha (útil para contexto RAG longo);
    por padrão colapsa todo espaço em branco (bom para campos curtos).
    """
    if not text:
        return ""
    cleaned = str(text)
    cleaned = _ROLE_LABEL.sub(_PLACEHOLDER, cleaned)
    for pattern in _INJECTION_PATTERNS:
        cleaned = pattern.sub(_PLACEHOLDER, cleaned)
    cleaned = _DELIMITERS.sub(" ", cleaned)
    if preserve_newlines:
        cleaned = re.sub(r"[^\S\n]+", " ", cleaned)  # colapsa espaços, mantém \n
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    else:
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip() + "…"
    return cleaned
