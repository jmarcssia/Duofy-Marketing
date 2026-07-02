"""Erros de dominio dos agentes."""

from __future__ import annotations


class InsufficientSourcesError(Exception):
    """A pesquisa nao encontrou fontes reais suficientes; nao gerar relatorio hipotetico."""

    def __init__(self, *, theme: str, found: int, needed: int) -> None:
        self.theme = theme
        self.found = found
        self.needed = needed
        super().__init__(
            f"Fontes insuficientes para '{theme}': encontrei {found}, preciso de {needed}."
        )
