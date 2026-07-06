"""Normalização de enums na fronteira da API (rede de segurança).

A UI mostra rótulos em português ("Rápida", "Profunda"), mas os schemas usam enums
canônicos ("quick"/"deep"). O ideal é a UI já enviar o canônico; mesmo assim, coagimos
aqui para que um rótulo cru NUNCA vire um erro Pydantic bruto exibido ao usuário.

Aceita: id da taxonomia (rapida/padrao/profunda/consultiva/executiva), rótulo
(Rápida/Padrão/Profunda…), variações com/sem acento e o próprio valor canônico.
"""

from __future__ import annotations

# id/rótulo (minúsculo, sem depender de acento) -> depth canônico
_DEPTH_MAP: dict[str, str] = {
    "quick": "quick",
    "rapida": "quick",
    "rápida": "quick",
    "rapido": "quick",
    "rápido": "quick",
    "standard": "standard",
    "padrao": "standard",
    "padrão": "standard",
    "media": "standard",
    "média": "standard",
    "deep": "deep",
    "profunda": "deep",
    "profundo": "deep",
    "aprofundada": "deep",
    "aprofundado": "deep",
    "consultiva": "deep",
    "executiva": "deep",
}


def normalize_depth(value: object, *, allow_standard: bool = True, default: str = "quick") -> str:
    """Coage `value` para {quick, standard, deep}.

    - `allow_standard=False` (cocriação, cujo enum é só quick|deep) colapsa standard→deep,
      preservando a intenção de "mais robusto" do "Padrão".
    - Valores desconhecidos caem em `default` (nunca levanta).
    """
    if value is None:
        return default if allow_standard or default != "standard" else "deep"
    key = str(value).strip().lower()
    mapped = _DEPTH_MAP.get(key, key if key in {"quick", "standard", "deep"} else default)
    if not allow_standard and mapped == "standard":
        mapped = "deep"
    return mapped
