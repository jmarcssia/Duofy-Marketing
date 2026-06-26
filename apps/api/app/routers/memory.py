from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.models import MemoryEntry, User
from app.rag import search_memory
from app.schemas import MemoryEntryRead, MemorySearchRequest, MemorySearchResult

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("", response_model=list[MemoryEntryRead])
async def list_memory_entries(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    category: str | None = None,
    source_type: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[MemoryEntryRead]:
    statement = select(MemoryEntry)
    if brand_slug:
        statement = statement.where(MemoryEntry.brand_slug == brand_slug)
    if category:
        statement = statement.where(MemoryEntry.category == category)
    if source_type:
        statement = statement.where(MemoryEntry.source_type == source_type)
    statement = statement.order_by(MemoryEntry.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(statement)
    return [
        MemoryEntryRead(
            id=entry.id,
            brand_slug=entry.brand_slug,
            category=entry.category,
            source_type=entry.source_type,
            title=entry.title,
            content=entry.content,
            created_at=entry.created_at,
        )
        for entry in result.scalars().all()
    ]


@router.post("/search", response_model=list[MemorySearchResult])
async def search_memory_entries(
    payload: MemorySearchRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MemorySearchResult]:
    hits = await search_memory(
        db=db,
        query=payload.query,
        brand_slug=payload.brand_slug,
        category=payload.category,
        source_type=payload.source_type,
        limit=payload.limit,
    )
    return [
        MemorySearchResult(
            id=hit.id,
            kind=hit.kind,  # type: ignore[arg-type]
            document_id=hit.document_id,
            brand_slug=hit.brand_slug,
            category=hit.category,
            source_type=hit.source_type,
            title=hit.title,
            content=hit.content,
            score=hit.score,
        )
        for hit in hits
    ]
