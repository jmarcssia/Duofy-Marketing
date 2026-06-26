from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, User


def compact_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not metadata:
        return None
    compacted: dict[str, Any] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        if isinstance(value, str) and len(value) > 1200:
            compacted[key] = f"{value[:1200]}..."
        else:
            compacted[key] = value
    return compacted or None


async def record_audit_event(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    user: User | None = None,
    status: str = "success",
    brand_slug: str | None = None,
    agent_slug: str | None = None,
    summary: str = "",
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        status=status,
        brand_slug=brand_slug,
        agent_slug=agent_slug,
        summary=summary,
        metadata_json=compact_metadata(metadata),
    )
    db.add(event)
    await db.flush()
    return event
