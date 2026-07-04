"""C1 — controle de acesso por marca (anti-IDOR).

Cada usuário tem um `brand_scope` (lista de slugs). NULL/vazio = todas as marcas
(retrocompatível com os admins atuais). A marca institucional é sempre acessível (RAG comum).
`assert_brand_access` responde 404 no mismatch para não vazar existência de recursos de
outras marcas.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models import User
from app.rag import INSTITUTIONAL_BRAND


def can_access_brand(user: User, brand_slug: str | None) -> bool:
    scope = user.brand_scope
    if not scope:  # None ou lista vazia -> acesso total (comportamento atual)
        return True
    if brand_slug == INSTITUTIONAL_BRAND:
        return True
    if brand_slug is None:  # usuário restrito não pode usar visão "todas as marcas"
        return False
    return brand_slug in scope


def accessible_brands(user: User) -> list[str] | None:
    """Retorna a lista de marcas acessíveis, ou None quando o usuário vê todas."""
    scope = user.brand_scope
    if not scope:
        return None
    return [*scope, INSTITUTIONAL_BRAND]


def assert_brand_access(user: User, brand_slug: str | None) -> None:
    if not can_access_brand(user, brand_slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recurso nao encontrado."
        )
