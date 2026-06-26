"""Thin persistence helpers for the `Setting` table.

Extracted here (away from `routers/admin.py`) so that both `agent_limits.py`
and `routers/admin.py` can import these helpers without creating a circular
dependency:

    agent_limits  →  settings_store  (OK)
    routers/admin →  settings_store  (OK)
    agent_limits  ↔  routers/admin   (AVOIDED)
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting


async def _setting_value(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting is not None else None


async def _upsert_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        db.add(Setting(key=key, value=value))
        return
    setting.value = value
