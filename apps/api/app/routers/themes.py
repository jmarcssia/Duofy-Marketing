from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.models import ContentTheme, User
from app.schemas import (
    ContentThemeCreate,
    ContentThemeRead,
    ThemeImportResult,
)
from app.theme_import import import_themes, parse_themes_csv

router = APIRouter(prefix="/api/themes", tags=["themes"])


def _theme_read(theme: ContentTheme) -> ContentThemeRead:
    return ContentThemeRead(
        id=theme.id, title=theme.title, theme=theme.theme, brand_slug=theme.brand_slug,
        audience=theme.audience, kind=theme.kind, owner=theme.owner, status=theme.status,
    )


@router.get("", response_model=list[ContentThemeRead])
async def list_themes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
) -> list[ContentThemeRead]:
    stmt = select(ContentTheme).order_by(ContentTheme.title)
    if brand_slug:
        stmt = stmt.where(ContentTheme.brand_slug == brand_slug)
    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    return [_theme_read(t) for t in rows]


@router.post("", response_model=ContentThemeRead, status_code=status.HTTP_201_CREATED)
async def create_theme(
    payload: ContentThemeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentThemeRead:
    theme = ContentTheme(
        title=payload.title.strip(),
        theme=payload.theme or "",
        brand_slug=payload.brand_slug or None,
        audience=payload.audience or None,
        kind=payload.kind or None,
        owner=payload.owner or None,
        status=payload.status or None,
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    await record_audit_event(
        db, user=current_user, action="theme.created", entity_type="content_theme",
        entity_id=theme.id, status="success", brand_slug=theme.brand_slug, agent_slug=None,
        summary=f"Tema criado: {theme.title}", metadata=None,
    )
    await db.commit()
    return _theme_read(theme)


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theme(
    theme_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    theme = await db.get(ContentTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tema não encontrado.")
    title = theme.title
    brand = theme.brand_slug
    await db.delete(theme)
    await db.commit()
    await record_audit_event(
        db, user=current_user, action="theme.deleted", entity_type="content_theme",
        entity_id=theme_id, status="success", brand_slug=brand, agent_slug=None,
        summary=f"Tema removido: {title}", metadata=None,
    )
    await db.commit()


@router.post("/import", response_model=ThemeImportResult)
async def import_themes_csv(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ThemeImportResult:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV vazio.")
    themes = parse_themes_csv(raw)
    if not themes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum tema encontrado no CSV (esperado separador ';' com coluna TITULO/TEMA).",
        )
    summary = await import_themes(db, themes)
    await record_audit_event(
        db, user=current_user, action="theme.imported", entity_type="content_theme",
        entity_id=None, status="success", brand_slug=None, agent_slug=None,
        summary=f"Banco de temas importado: {summary['inserted']} novos de {summary['parsed']}.",
        metadata=summary,
    )
    await db.commit()
    return ThemeImportResult(**summary)
