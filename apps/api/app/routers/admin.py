from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_limits import AGENT_TOKEN_BUDGETS_KEY, RESEARCH_DEPTH_LIMITS_KEY
from app.agent_limits import _config as _limits_config
from app.audit_service import record_audit_event
from app.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.db import get_db
from app.dependencies import require_admin
from app.models import Agent, Brand, ProviderCredential, User
from app.schemas import (
    AdminUserRead,
    AgentRead,
    AgentSettingsRead,
    AgentSettingsUpdate,
    ProviderCredentialRead,
    ProviderCredentialUpdate,
    QualitySettingsRead,
    QualitySettingsUpdate,
    UserBrandScopeUpdate,
)
from app.settings_store import _setting_value, _upsert_setting

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


def _admin_user_read(user: User) -> AdminUserRead:
    return AdminUserRead(
        id=user.id, email=user.email, name=user.name, role=user.role,
        is_active=user.is_active, brand_scope=user.brand_scope or None,
    )


@router.get("/users", response_model=list[AdminUserRead])
async def list_users(
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AdminUserRead]:
    result = await db.execute(select(User).order_by(User.id.asc()))
    return [_admin_user_read(user) for user in result.scalars().all()]


@router.put("/users/{user_id}/brand-scope", response_model=AdminUserRead)
async def set_user_brand_scope(
    user_id: int,
    payload: UserBrandScopeUpdate,
    current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserRead:
    """C1: define as marcas que o usuario pode acessar (None/vazio = todas)."""
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
    if payload.brand_scope:
        known = {
            row for (row,) in (await db.execute(select(Brand.slug))).all()
        }
        unknown = [slug for slug in payload.brand_scope if slug not in known]
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Marca(s) inexistente(s) no escopo: {', '.join(unknown)}.",
            )
    user.brand_scope = payload.brand_scope or None
    await record_audit_event(
        db, user=current_user, action="admin.user_brand_scope_set",
        entity_type="user", entity_id=user.id, status="success",
        summary=f"Escopo de marcas de {user.email} atualizado",
        metadata={"brand_scope": user.brand_scope},
    )
    await db.commit()
    await db.refresh(user)
    return _admin_user_read(user)


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
    current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QualitySettingsRead:
    await _upsert_setting(db, QUALITY_REVIEW_MODE_KEY, payload.review_mode)
    await _upsert_setting(db, QUALITY_REVIEW_PROVIDER_KEY, payload.provider or "")
    await _upsert_setting(db, QUALITY_REVIEW_MODEL_KEY, payload.model or "")
    await record_audit_event(
        db, user=current_user, action="admin.quality_settings_updated",
        entity_type="settings", status="success",
        summary="Configurações de qualidade atualizadas",
        metadata={
            "review_mode": payload.review_mode,
            "provider": payload.provider,
            "model": payload.model,
        },
    )
    await db.commit()
    return QualitySettingsRead(
        review_mode=payload.review_mode,
        provider=payload.provider,
        model=payload.model or None,
    )


def _validate_budgets(budgets: dict[str, int]) -> None:
    for slug, value in budgets.items():
        if not (256 <= value <= 32000):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Orçamento inválido para {slug} (256–32000).",
            )


def _validate_depth(depth: dict[str, dict[str, int]]) -> None:
    for name, entry in depth.items():
        s, e = entry.get("sources"), entry.get("excerpt")
        if not (isinstance(s, int) and 1 <= s <= 30 and isinstance(e, int) and 500 <= e <= 20000):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Profundidade inválida em {name}.",
            )


@router.get("/agent-settings", response_model=AgentSettingsRead)
async def get_agent_settings(
    _current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentSettingsRead:
    cfg = _limits_config()
    budgets = dict(cfg.get("token_budgets", {}))
    depth = dict(cfg.get("research_depth", {}))
    saved_b = await _setting_value(db, AGENT_TOKEN_BUDGETS_KEY)
    saved_d = await _setting_value(db, RESEARCH_DEPTH_LIMITS_KEY)
    if saved_b:
        try:
            budgets.update(json.loads(saved_b))
        except (ValueError, TypeError):
            pass
    if saved_d:
        try:
            depth.update(json.loads(saved_d))
        except (ValueError, TypeError):
            pass
    return AgentSettingsRead(token_budgets=budgets, research_depth=depth)


@router.put("/agent-settings", response_model=AgentSettingsRead)
async def update_agent_settings(
    payload: AgentSettingsUpdate,
    current_user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentSettingsRead:
    _validate_budgets(payload.token_budgets)
    _validate_depth(payload.research_depth)
    await _upsert_setting(db, AGENT_TOKEN_BUDGETS_KEY, json.dumps(payload.token_budgets))
    await _upsert_setting(db, RESEARCH_DEPTH_LIMITS_KEY, json.dumps(payload.research_depth))
    await record_audit_event(
        db, user=current_user, action="admin.agent_settings_updated",
        entity_type="settings", status="success",
        summary="Limites de agentes atualizados",
        metadata={
            "token_budgets": payload.token_budgets,
            "research_depth": payload.research_depth,
        },
    )
    await db.commit()
    return AgentSettingsRead(
        token_budgets=payload.token_budgets, research_depth=payload.research_depth
    )


@router.put("/providers/{provider}", response_model=ProviderCredentialRead)
async def upsert_provider(
    provider: str,
    payload: ProviderCredentialUpdate,
    current_user: Annotated[User, Depends(require_admin)],
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

    await db.flush()  # garante id para a trilha (credencial nova)
    await record_audit_event(
        db, user=current_user, action="admin.provider_updated",
        entity_type="provider", entity_id=credential.id, status="success",
        summary=f"Provedor {credential.provider} atualizado",
        metadata={
            "provider": credential.provider,
            "display_name": credential.display_name,
            "default_model": credential.default_model,
            "base_url": credential.base_url,
            "is_enabled": credential.is_enabled,
            # NUNCA gravar a chave; apenas se houve troca.
            "api_key_changed": bool(payload.api_key),
        },
    )
    await db.commit()
    await db.refresh(credential)
    return _provider_read(credential)
