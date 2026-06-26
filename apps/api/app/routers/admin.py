from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.db import get_db
from app.dependencies import require_admin
from app.models import Agent, ProviderCredential, Setting, User
from app.schemas import (
    AgentRead,
    ProviderCredentialRead,
    ProviderCredentialUpdate,
    QualitySettingsRead,
    QualitySettingsUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

QUALITY_REVIEW_MODE_KEY = "quality_review_mode"
QUALITY_REVIEW_PROVIDER_KEY = "quality_review_provider"
QUALITY_REVIEW_MODEL_KEY = "quality_review_model"


def _normalize_base_url(provider: str, base_url: str | None) -> str | None:
    if not base_url:
        return None
    normalized = base_url.strip().rstrip("/")
    if provider == "openrouter":
        if normalized in {"https://openrouter.ai", "https://openrouter.ai/api"}:
            return "https://openrouter.ai/api/v1"
        if normalized.endswith("/chat/completions"):
            return normalized.removesuffix("/chat/completions")
    return normalized


@router.get("/agents", response_model=list[AgentRead])
async def list_agents(
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AgentRead]:
    result = await db.execute(select(Agent).order_by(Agent.name.asc()))
    return [
        AgentRead(
            id=agent.id,
            name=agent.name,
            slug=agent.slug,
            default_model=agent.default_model,
            is_active=agent.is_active,
        )
        for agent in result.scalars().all()
    ]


def _provider_read(credential: ProviderCredential) -> ProviderCredentialRead:
    api_key = None
    if credential.api_key_encrypted:
        try:
            api_key = decrypt_secret(credential.api_key_encrypted)
        except Exception:
            api_key = None

    return ProviderCredentialRead(
        provider=credential.provider,
        display_name=credential.display_name,
        base_url=credential.base_url,
        default_model=credential.default_model,
        is_enabled=credential.is_enabled,
        has_api_key=bool(credential.api_key_encrypted),
        masked_api_key=mask_secret(api_key),
    )


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


@router.get("/providers", response_model=list[ProviderCredentialRead])
async def list_providers(
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProviderCredentialRead]:
    result = await db.execute(
        select(ProviderCredential).order_by(ProviderCredential.provider.asc())
    )
    return [_provider_read(credential) for credential in result.scalars().all()]


@router.get("/quality-settings", response_model=QualitySettingsRead)
async def get_quality_settings(
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QualitySettingsRead:
    review_mode = await _setting_value(db, QUALITY_REVIEW_MODE_KEY)
    provider = await _setting_value(db, QUALITY_REVIEW_PROVIDER_KEY)
    model = await _setting_value(db, QUALITY_REVIEW_MODEL_KEY)
    normalized_mode = (
        review_mode if review_mode in {"local_only", "hybrid", "llm_required"} else "hybrid"
    )
    return QualitySettingsRead(
        review_mode=normalized_mode,
        provider=provider if provider in {"openrouter", "anthropic", "openai"} else None,
        model=model or None,
    )


@router.put("/quality-settings", response_model=QualitySettingsRead)
async def update_quality_settings(
    payload: QualitySettingsUpdate,
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QualitySettingsRead:
    await _upsert_setting(db, QUALITY_REVIEW_MODE_KEY, payload.review_mode)
    await _upsert_setting(db, QUALITY_REVIEW_PROVIDER_KEY, payload.provider or "")
    await _upsert_setting(db, QUALITY_REVIEW_MODEL_KEY, payload.model or "")
    await db.commit()
    return QualitySettingsRead(
        review_mode=payload.review_mode,
        provider=payload.provider,
        model=payload.model or None,
    )


@router.put("/providers/{provider}", response_model=ProviderCredentialRead)
async def upsert_provider(
    provider: str,
    payload: ProviderCredentialUpdate,
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProviderCredentialRead:
    if provider != payload.provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provider da URL e do payload precisam ser iguais.",
        )

    result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == payload.provider)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        credential = ProviderCredential(
            provider=payload.provider,
            display_name=payload.display_name,
        )
        db.add(credential)

    credential.display_name = payload.display_name
    credential.base_url = _normalize_base_url(payload.provider, payload.base_url)
    credential.default_model = payload.default_model
    credential.is_enabled = payload.is_enabled
    if payload.api_key:
        credential.api_key_encrypted = encrypt_secret(payload.api_key)

    await db.commit()
    await db.refresh(credential)
    return _provider_read(credential)
