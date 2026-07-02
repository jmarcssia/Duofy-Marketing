from __future__ import annotations

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.models import ResearchTheme, User
from app.schemas import ResearchThemeCreate, ResearchThemeRead, ThemeImportResult

router = APIRouter(prefix="/api/research-themes", tags=["research-themes"])


def _read(theme: ResearchTheme) -> ResearchThemeRead:
    return ResearchThemeRead(
        id=theme.id, title=theme.title, notes=theme.notes, brand_slug=theme.brand_slug
    )


def _decode(raw: bytes | str) -> str:
    if isinstance(raw, str):
        return raw
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _parse_csv(raw: bytes | str) -> list[dict]:
    """CSV separador ';', colunas TITULO;NOTAS (NOTAS opcional). Ignora cabecalho e linhas vazias."""
    reader = csv.reader(io.StringIO(_decode(raw)), delimiter=";")
    themes: list[dict] = []
    for i, row in enumerate(reader):
        cells = [(c or "").strip() for c in row]
        cells += [""] * (2 - len(cells))
        titulo, notas = cells[0], cells[1]
        if i == 0 and titulo.upper() in {"TITULO", "TÍTULO"}:
            continue
        if not titulo:
            continue
        themes.append({"title": titulo[:255], "notes": (notas or None)})
    return themes


@router.get("", response_model=list[ResearchThemeRead])
async def list_research_themes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
) -> list[ResearchThemeRead]:
    stmt = select(ResearchTheme).order_by(ResearchTheme.title)
    if brand_slug:
        stmt = stmt.where(ResearchTheme.brand_slug == brand_slug)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(ResearchTheme.title.ilike(like) | ResearchTheme.notes.ilike(like))
    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    return [_read(t) for t in rows]


@router.post("", response_model=ResearchThemeRead, status_code=status.HTTP_201_CREATED)
async def create_research_theme(
    payload: ResearchThemeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchThemeRead:
    theme = ResearchTheme(
        title=payload.title.strip(),
        notes=(payload.notes or None),
        brand_slug=(payload.brand_slug or None),
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    await record_audit_event(
        db, user=current_user, action="research_theme.created", entity_type="research_theme",
        entity_id=theme.id, status="success", brand_slug=theme.brand_slug, agent_slug=None,
        summary=f"Tema de pesquisa criado: {theme.title}", metadata=None,
    )
    await db.commit()
    return _read(theme)


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_theme(
    theme_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    theme = await db.get(ResearchTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tema de pesquisa nao encontrado.")
    title, brand = theme.title, theme.brand_slug
    await db.delete(theme)
    await db.commit()
    await record_audit_event(
        db, user=current_user, action="research_theme.deleted", entity_type="research_theme",
        entity_id=theme_id, status="success", brand_slug=brand, agent_slug=None,
        summary=f"Tema de pesquisa removido: {title}", metadata=None,
    )
    await db.commit()


@router.post("/import", response_model=ThemeImportResult)
async def import_research_themes_csv(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = Query(default=None),
) -> ThemeImportResult:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV vazio.")
    parsed = _parse_csv(raw)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum tema encontrado no CSV (esperado separador ';' com coluna TITULO).",
        )
    existing = set(
        (await db.execute(
            select(ResearchTheme.title).where(ResearchTheme.brand_slug == brand_slug)
        )).scalars().all()
    )
    inserted = 0
    for t in parsed:
        if t["title"] in existing:
            continue
        existing.add(t["title"])
        db.add(ResearchTheme(title=t["title"], notes=t["notes"], brand_slug=brand_slug))
        inserted += 1
    await db.commit()
    await record_audit_event(
        db, user=current_user, action="research_theme.imported", entity_type="research_theme",
        entity_id=None, status="success", brand_slug=brand_slug, agent_slug=None,
        summary=f"Banco de temas de pesquisa importado: {inserted} novos de {len(parsed)}.",
        metadata={"parsed": len(parsed), "inserted": inserted},
    )
    await db.commit()
    return ThemeImportResult(parsed=len(parsed), inserted=inserted, skipped=len(parsed) - inserted)
