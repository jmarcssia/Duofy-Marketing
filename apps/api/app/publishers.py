"""Camada de publicação plugável do Calendário (F4).

Arquitetura preparada para publicar as peças aprovadas. A integração real com a **Meta**
(Instagram/Facebook) NÃO é implementada nesta fase — `MetaPublisher` é um stub explícito que
falha com uma mensagem clara (nunca finge sucesso). O caminho **manual** permite ao gestor
registrar que publicou por fora, para o pipeline chegar a "publicado" de forma honesta.

Para plugar a Meta no futuro: implementar `MetaPublisher.publish` (Graph API + token de página
via credencial/OAuth) sem tocar no resto do workflow.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.models import CalendarEvent

# Alvos de publicação suportados pelo contrato (a Meta ainda é stub).
PUBLISH_TARGETS = ("meta", "manual")


class PublisherError(RuntimeError):
    """Falha de publicação (genérica)."""


class PublisherNotConfigured(PublisherError):
    """O provedor de publicação existe no contrato mas ainda não está integrado/configurado."""


@dataclass(frozen=True)
class PublishResult:
    target: str
    ref: str  # id externo do post (ou marcador, ex.: 'manual')


class Publisher(Protocol):
    target: str

    async def publish(self, event: CalendarEvent) -> PublishResult: ...


class MetaPublisher:
    """Stub da integração Meta — arquitetura pronta, integração na próxima fase."""

    target = "meta"

    async def publish(self, event: CalendarEvent) -> PublishResult:
        raise PublisherNotConfigured(
            "Publicação na Meta ainda não está integrada. Conecte a conta Meta "
            "(Instagram/Facebook) — a integração entra na próxima fase. Use "
            "'Marcar como publicado' para registrar uma publicação manual."
        )


class ManualPublisher:
    """Registra que o gestor publicou manualmente (fora do sistema)."""

    target = "manual"

    async def publish(self, event: CalendarEvent) -> PublishResult:
        return PublishResult(target="manual", ref="manual")


def get_publisher(target: str) -> Publisher:
    if target == "meta":
        return MetaPublisher()
    if target == "manual":
        return ManualPublisher()
    raise PublisherError(f"Alvo de publicação não suportado: {target}.")
