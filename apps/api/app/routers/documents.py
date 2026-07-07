from __future__ import annotations

from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import accessible_brands, assert_brand_access
from app.db import get_db
from app.dependencies import get_current_user
from app.document_processing import chunk_text, estimate_tokens, extract_text
from app.embeddings import embed_text, vector_to_sql
from app.export_service import ExportDocument, ExportResult, export_document
from app.models import Brand, Document, DocumentChunk, Source, User
from app.rag import INSTITUTIONAL_BRAND
from app.schemas import DocumentChunkRead, DocumentRead

router = APIRouter(prefix="/api/documents", tags=["documents"])

STORAGE_DIR = Path("storage/documents")
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown", ".yaml", ".yml"}


def _document_read(document: Document) -> DocumentRead:
    return DocumentRead(
        id=document.id,
        brand_slug=document.brand_slug,
        category=document.category,
        filename=document.filename,
        content_type=document.content_type,
        file_size=document.file_size,
        status=document.status,
        error=document.error,
        created_at=document.created_at,
    )


async def _get_document_or_404(db: AsyncSession, document_id: int, user: User) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento nao encontrado.",
        )
    assert_brand_access(user, document.brand_slug)  # C1: isolamento por marca
    return document


async def _document_chunks(db: AsyncSession, document_id: int) -> list[DocumentChunk]:
    result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
    )
    return list(result.scalars().all())


def _export_response(exported: ExportResult) -> Response:
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )


def _document_export(document: Document, chunks: list[DocumentChunk]) -> ExportDocument:
    content = "\n\n".join(chunk.content for chunk in chunks).strip()
    if not content:
        content = document.error or "Documento sem texto indexado."
    return ExportDocument(
        title=document.filename,
        subtitle="Documento de memoria Duofy",
        metadata=[
            ("Marca", document.brand_slug),
            ("Categoria", document.category),
            ("Tipo", document.content_type),
            ("Status", document.status),
            ("Tamanho", f"{document.file_size} bytes"),
            ("Chunks", str(len(chunks))),
        ],
        content=content,
        filename_prefix=f"duofy-document-{document.id}",
    )


@router.post("/upload", response_model=DocumentRead)
async def upload_document(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
    brand_slug: Annotated[str, Form()],
    category: Annotated[str, Form()] = "general",
    source_type: Annotated[str, Form()] = "upload",
) -> DocumentRead:
    assert_brand_access(current_user, brand_slug)  # C1: não alimenta RAG de marca alheia
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato nao suportado. Use PDF, DOCX, TXT ou MD.",
        )

    # "institucional" e o slug sentinela para documentos que valem para TODAS as marcas
    # no RAG — nao precisa (e nao deve) existir como Brand real.
    if brand_slug != INSTITUTIONAL_BRAND:
        brand_result = await db.execute(select(Brand).where(Brand.slug == brand_slug))
        if brand_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Marca nao encontrada.",
            )

    content = await file.read()
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = STORAGE_DIR / f"{uuid4().hex}{suffix}"
    await run_in_threadpool(stored_path.write_bytes, content)

    source = Source(
        name=file.filename or stored_path.name,
        source_type=source_type,
        url=None,
    )
    db.add(source)
    await db.flush()

    document = Document(
        source_id=source.id,
        brand_slug=brand_slug,
        category=category,
        filename=file.filename or stored_path.name,
        stored_path=str(stored_path),
        content_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        status="processing",
    )
    db.add(document)
    await db.flush()

    try:
        text = await run_in_threadpool(extract_text, document.filename, content)
        chunks = chunk_text(text)
        if not chunks:
            raise ValueError("Documento sem texto extraivel.")

        for index, chunk in enumerate(chunks):
            embedding = vector_to_sql(await embed_text(db, chunk))
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    brand_slug=brand_slug,
                    category=category,
                    source_type=source_type,
                    chunk_index=index,
                    content=chunk,
                    token_count=estimate_tokens(chunk),
                    embedding=embedding,
                )
            )
        document.status = "indexed"
        document.error = None
    except Exception as exc:
        document.status = "failed"
        document.error = str(exc)

    await db.commit()
    await db.refresh(document)
    return _document_read(document)


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    category: str | None = None,
    query: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[DocumentRead]:
    statement = select(Document)
    allowed = accessible_brands(_current_user)  # C1: restringe às marcas do usuário
    if allowed is not None:
        statement = statement.where(Document.brand_slug.in_(allowed))
    if brand_slug:
        statement = statement.where(Document.brand_slug == brand_slug)
    if category:
        statement = statement.where(Document.category == category)
    if query:
        statement = statement.where(Document.filename.ilike(f"%{query}%"))
    statement = statement.order_by(Document.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(statement)
    return [_document_read(document) for document in result.scalars().all()]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove um documento do RAG: seus chunks, o registro e (best-effort) o arquivo."""
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento nao encontrado."
        )
    assert_brand_access(_current_user, document.brand_slug)  # C1: isolamento por marca
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    source_id = document.source_id
    stored_path = document.stored_path
    await db.delete(document)
    if source_id is not None:
        source = await db.get(Source, source_id)
        if source is not None:
            await db.delete(source)
    await db.commit()
    try:
        if stored_path:
            Path(stored_path).unlink(missing_ok=True)
    except Exception:
        pass


@router.get("/{document_id}/chunks", response_model=list[DocumentChunkRead])
async def list_document_chunks(
    document_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DocumentChunkRead]:
    await _get_document_or_404(db, document_id, _current_user)
    chunks = await _document_chunks(db, document_id)
    return [
        DocumentChunkRead(
            id=chunk.id,
            document_id=chunk.document_id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            token_count=chunk.token_count,
        )
        for chunk in chunks
    ]


@router.get("/{document_id}/download")
async def download_document(
    document_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    document = await _get_document_or_404(db, document_id, _current_user)
    path = Path(document.stored_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo original nao encontrado.",
        )
    return FileResponse(
        path,
        media_type=document.content_type,
        filename=document.filename,
    )


@router.get("/{document_id}/export")
async def export_indexed_document(
    document_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: Annotated[str, Query(pattern="^(pdf|docx|md|html)$")] = "pdf",
) -> Response:
    document = await _get_document_or_404(db, document_id, _current_user)
    chunks = await _document_chunks(db, document.id)
    exported = await run_in_threadpool(
        export_document, _document_export(document, chunks), format
    )
    return _export_response(exported)
