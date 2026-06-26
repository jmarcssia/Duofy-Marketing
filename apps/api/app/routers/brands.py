from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.models import Brand, User
from app.schemas import BrandRead

router = APIRouter(prefix="/api/brands", tags=["brands"])


@router.get("", response_model=list[BrandRead])
async def list_brands(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BrandRead]:
    result = await db.execute(
        select(Brand).where(Brand.is_active.is_(True)).order_by(Brand.name.asc())
    )
    return [
        BrandRead(
            id=brand.id,
            name=brand.name,
            slug=brand.slug,
            niche=brand.niche,
            description=brand.description,
        )
        for brand in result.scalars().all()
    ]
