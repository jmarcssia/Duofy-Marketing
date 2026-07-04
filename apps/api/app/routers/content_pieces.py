"""F2b — endpoints de peças/subpeças aprovaveis por peça."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import assert_brand_access
from app.audit_service import record_audit_event
from app.content_pieces_service import (
    MANUAL_KINDS,
    add_manual_piece,
    get_piece,
    list_pieces,
    set_piece_status,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.models import ContentPiece, Output, User
from app.schemas import (
    ContentPieceCreate,
    ContentPieceRead,
    ContentPieceStatusRequest,
    ContentPieceUpdate,
)

router = APIRouter(prefix="/api", tags=["content_pieces"])


def _read(piece: ContentPiece) -> ContentPieceRead:
    return ContentPieceRead.model_validate(piece, from_attributes=True)


async def _output_scoped(db: AsyncSession, output_id: int, user: User) -> Output:
    output = await db.get(Output, output_id)
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conteudo nao encontrado."
        )
    assert_brand_access(user, output.brand_slug)  # C1
    return output


async def _piece_scoped(db: AsyncSession, piece_id: int, user: User) -> ContentPiece:
    piece = await get_piece(db, piece_id)
    if piece is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peca nao encontrada.")
    assert_brand_access(user, piece.brand_slug)  # C1
    return piece


@router.get("/outputs/{output_id}/pieces", response_model=list[ContentPieceRead])
async def list_output_pieces(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ContentPieceRead]:
    await _output_scoped(db, output_id, current_user)
    return [_read(p) for p in await list_pieces(db, output_id)]


@router.post("/outputs/{output_id}/pieces", response_model=ContentPieceRead)
async def create_piece(
    output_id: int,
    payload: ContentPieceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPieceRead:
    output = await _output_scoped(db, output_id, current_user)
    if payload.kind not in MANUAL_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de peça manual inválido. Use um de: {', '.join(MANUAL_KINDS)}.",
        )
    piece = await add_manual_piece(
        db, output, kind=payload.kind, label=payload.label, channel=payload.channel,
        content=payload.content, required=payload.required,
    )
    await record_audit_event(
        db, user=current_user, action="piece.created", entity_type="content_piece",
        entity_id=piece.id, status=piece.status, brand_slug=piece.brand_slug,
        summary=f"Peça manual criada: {piece.label}", metadata={"kind": piece.kind},
    )
    await db.commit()
    await db.refresh(piece)
    return _read(piece)


@router.patch("/pieces/{piece_id}", response_model=ContentPieceRead)
async def update_piece(
    piece_id: int,
    payload: ContentPieceUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPieceRead:
    piece = await _piece_scoped(db, piece_id, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(piece, field, value)
    await db.commit()
    await db.refresh(piece)
    return _read(piece)


@router.delete("/pieces/{piece_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_piece(
    piece_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    piece = await _piece_scoped(db, piece_id, current_user)
    if piece.origin != "manual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Só é possível remover peças manuais.",
        )
    await db.delete(piece)
    await db.commit()


@router.post("/pieces/{piece_id}/status", response_model=ContentPieceRead)
async def set_status(
    piece_id: int,
    payload: ContentPieceStatusRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPieceRead:
    """Aprova/rejeita a peça. Ao completar as obrigatorias, o Output vira 'approved' (idem)."""
    piece = await _piece_scoped(db, piece_id, current_user)
    piece = await set_piece_status(db, piece, payload.status, current_user, payload.note)
    await record_audit_event(
        db, user=current_user, action=f"piece.{payload.status}", entity_type="content_piece",
        entity_id=piece.id, status=piece.status, brand_slug=piece.brand_slug,
        summary=f"Peça {payload.status}: {piece.label}",
    )
    await db.commit()
    await db.refresh(piece)
    return _read(piece)
