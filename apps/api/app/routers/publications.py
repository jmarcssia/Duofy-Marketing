"""FASE 9 — Publicações e Canais.

Gestão de canais (Meta/IG/FB — conexão real é fase futura), fila de publicações,
upload de mídia e publicação. A Meta é um **stub honesto** (retorna 400 claro, nunca finge
sucesso); 'manual' registra publicação externa. Isolamento por marca (C1) + auditoria.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import accessible_brands, assert_brand_access
from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.models import Publication, PublicationChannel, User
from app.schemas import (
    PublicationChannelCreate,
    PublicationChannelRead,
    PublicationCreate,
    PublicationRead,
    PublicationUpdate,
)

router = APIRouter(prefix="/api/publications", tags=["publications"])

MEDIA_DIR = Path("storage/media")
MAX_MEDIA_BYTES = 25 * 1024 * 1024
ALLOWED_MEDIA = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov"}

META_NOT_READY = (
    "Publicação na Meta ainda não está integrada. Conecte a conta Meta (Instagram/Facebook) — "
    "a integração entra na próxima fase. Use 'manual' para registrar uma publicação externa."
)


def _channel_read(c: PublicationChannel) -> PublicationChannelRead:
    return PublicationChannelRead(
        id=c.id, brand_slug=c.brand_slug, platform=c.platform, display_name=c.display_name,
        external_id=c.external_id, status=c.status, last_error=c.last_error,
        created_at=c.created_at,
    )


def _pub_read(p: Publication) -> PublicationRead:
    return PublicationRead(
        id=p.id, brand_slug=p.brand_slug, channel_id=p.channel_id, output_id=p.output_id,
        title=p.title, caption=p.caption, first_comment=p.first_comment, hashtags=p.hashtags,
        media_paths=list(p.media_paths or []), post_type=p.post_type, status=p.status, mode=p.mode,
        scheduled_at=p.scheduled_at, published_at=p.published_at, publish_ref=p.publish_ref,
        last_error=p.last_error, created_at=p.created_at, updated_at=p.updated_at,
    )


async def _get_pub_or_404(db: AsyncSession, pub_id: int, user: User) -> Publication:
    pub = await db.get(Publication, pub_id)
    if pub is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Publicação não encontrada."
        )
    assert_brand_access(user, pub.brand_slug)  # C1
    return pub


# ------------------------------------------------------------------ Canais

@router.get("/channels", response_model=list[PublicationChannelRead])
async def list_channels(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
) -> list[PublicationChannelRead]:
    stmt = select(PublicationChannel)
    allowed = accessible_brands(current_user)  # C1
    if allowed is not None:
        stmt = stmt.where(PublicationChannel.brand_slug.in_(allowed))
    if brand_slug:
        assert_brand_access(current_user, brand_slug)
        stmt = stmt.where(PublicationChannel.brand_slug == brand_slug)
    result = await db.execute(stmt.order_by(PublicationChannel.id.desc()))
    return [_channel_read(c) for c in result.scalars().all()]


@router.post("/channels", response_model=PublicationChannelRead)
async def connect_channel(
    payload: PublicationChannelCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicationChannelRead:
    assert_brand_access(current_user, payload.brand_slug)  # C1
    # A conexão real (OAuth/Graph) é fase futura: o canal entra como 'pending'.
    channel = PublicationChannel(
        brand_slug=payload.brand_slug, platform=payload.platform,
        display_name=payload.display_name, external_id=payload.external_id,
        status="pending", created_by=current_user.id,
    )
    db.add(channel)
    await db.flush()
    await record_audit_event(
        db, user=current_user, action="publication.channel_connected",
        entity_type="publication_channel", entity_id=channel.id, status="success",
        brand_slug=channel.brand_slug,
        summary=f"Canal {channel.platform} adicionado (pendente): {channel.display_name}",
        metadata={"platform": channel.platform},
    )
    await db.commit()
    await db.refresh(channel)
    return _channel_read(channel)


# ------------------------------------------------------------------ Fila

@router.get("", response_model=list[PublicationRead])
async def list_publications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[PublicationRead]:
    stmt = select(Publication)
    allowed = accessible_brands(current_user)  # C1
    if allowed is not None:
        stmt = stmt.where(Publication.brand_slug.in_(allowed))
    if brand_slug:
        assert_brand_access(current_user, brand_slug)
        stmt = stmt.where(Publication.brand_slug == brand_slug)
    if status_filter:
        stmt = stmt.where(Publication.status == status_filter)
    result = await db.execute(stmt.order_by(Publication.updated_at.desc()).limit(limit))
    return [_pub_read(p) for p in result.scalars().all()]


@router.post("", response_model=PublicationRead)
async def create_publication(
    payload: PublicationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicationRead:
    assert_brand_access(current_user, payload.brand_slug)  # C1
    initial = "scheduled" if payload.scheduled_at else "draft"
    pub = Publication(
        brand_slug=payload.brand_slug, channel_id=payload.channel_id, output_id=payload.output_id,
        title=payload.title, caption=payload.caption, first_comment=payload.first_comment,
        hashtags=payload.hashtags, media_paths=list(payload.media_paths),
        post_type=payload.post_type, status=initial, scheduled_at=payload.scheduled_at,
        created_by=current_user.id,
    )
    db.add(pub)
    await db.flush()
    await record_audit_event(
        db, user=current_user, action="publication.created",
        entity_type="publication", entity_id=pub.id, status="success",
        brand_slug=pub.brand_slug, summary=f"Publicação preparada: {pub.title or '(sem título)'}",
        metadata={"post_type": pub.post_type, "output_id": pub.output_id},
    )
    await db.commit()
    await db.refresh(pub)
    return _pub_read(pub)


@router.patch("/{pub_id}", response_model=PublicationRead)
async def update_publication(
    pub_id: int,
    payload: PublicationUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicationRead:
    pub = await _get_pub_or_404(db, pub_id, current_user)
    if pub.status == "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Publicação já publicada."
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pub, field, value)
    await db.commit()
    await db.refresh(pub)
    return _pub_read(pub)


@router.delete("/{pub_id}")
async def delete_publication(
    pub_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    pub = await _get_pub_or_404(db, pub_id, current_user)
    if pub.status == "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível remover uma publicação já publicada.",
        )
    await db.delete(pub)
    await record_audit_event(
        db, user=current_user, action="publication.deleted", entity_type="publication",
        entity_id=pub_id, status="success", brand_slug=pub.brand_slug,
        summary="Publicação removida",
    )
    await db.commit()
    return {"deleted": pub_id}


# ------------------------------------------------------------------ Mídia

@router.post("/media")
async def upload_media(
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile,
    brand_slug: Annotated[str, Query(min_length=2)],
) -> dict:
    assert_brand_access(current_user, brand_slug)  # C1
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_MEDIA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato de mídia não suportado: {suffix or '(sem extensão)'}.",
        )
    content = await file.read()
    if len(content) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo excede 25MB.")
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    stored = MEDIA_DIR / f"{uuid4().hex}{suffix}"
    await run_in_threadpool(stored.write_bytes, content)
    return {"path": str(stored), "filename": file.filename or stored.name, "size": len(content)}


# ------------------------------------------------------------------ Publicar

@router.post("/{pub_id}/publish", response_model=PublicationRead)
async def publish_publication(
    pub_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    target: Annotated[str, Query(pattern="^(meta|manual)$")] = "manual",
) -> PublicationRead:
    pub = await _get_pub_or_404(db, pub_id, current_user)
    if pub.status == "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Publicação já publicada."
        )

    if target == "meta":
        # Stub honesto: NÃO marca como publicado, retorna 400 claro.
        pub.mode = "meta"
        pub.last_error = META_NOT_READY
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=META_NOT_READY)

    # Manual: registra publicação externa.
    pub.mode = "manual"
    pub.status = "published"
    pub.published_at = datetime.now(UTC)
    pub.publish_ref = "manual"
    pub.last_error = None
    await record_audit_event(
        db, user=current_user, action="publication.published", entity_type="publication",
        entity_id=pub.id, status="success", brand_slug=pub.brand_slug,
        summary=f"Publicação registrada (manual): {pub.title or '(sem título)'}",
        metadata={"post_type": pub.post_type},
    )
    await db.commit()
    await db.refresh(pub)
    return _pub_read(pub)
