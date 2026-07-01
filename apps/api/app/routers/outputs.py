from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.document_formatting import (
    document_profile,
    document_sections,
    quality_notes_for_content,
    reformat_legacy_outputs,
    repair_formatting_outputs,
)
from app.export_service import ExportDocument, ExportResult, export_document
from app.models import Output, OutputComment, OutputVersion, QualityReview, User
from app.output_workflow import (
    OutputWorkflowError,
    approve_output,
    archive_output,
    compare_version_content,
    edit_output,
    get_output_version,
    output_effects,
    output_versions,
    reject_output,
    request_adjustment,
    restore_output_version,
)
from app.quality_guardian import latest_quality_review, review_output_quality
from app.schemas import (
    ContentOutputRead,
    ContentOutputUpdate,
    ContentOutputVersionRead,
    OutputActionRequest,
    OutputCommentCreate,
    OutputCommentRead,
    OutputCommentUpdate,
    OutputReformatLegacyRequest,
    OutputReformatLegacyResponse,
    OutputRepairFormattingRequest,
    OutputRepairFormattingResponse,
    OutputVersionCompareRead,
    OutputWorkflowDetail,
    QualityReviewRead,
    QualityReviewRequest,
)
from app.text_repair import repair_text

router = APIRouter(prefix="/api/outputs", tags=["outputs"])


def _version_read(version: OutputVersion) -> ContentOutputVersionRead:
    return ContentOutputVersionRead(
        id=version.id,
        output_id=version.output_id,
        version_number=version.version_number,
        content=version.content,
        editor_note=version.editor_note,
        created_at=version.created_at,
    )


def _quality_review_read(review: QualityReview | None) -> QualityReviewRead | None:
    if review is None:
        return None
    return QualityReviewRead(
        id=review.id,
        output_id=review.output_id,
        version_id=review.version_id,
        agent_run_id=review.agent_run_id,
        reviewer_slug=review.reviewer_slug,
        status=review.status,
        score=review.score,
        passed=review.passed,
        summary=repair_text(review.summary),
        critical_failures=[repair_text(str(item)) for item in review.critical_failures or []],
        required_fixes=[repair_text(str(item)) for item in review.required_fixes or []],
        optional_improvements=[
            repair_text(str(item)) for item in review.optional_improvements or []
        ],
        verified_sources=[repair_text(str(item)) for item in review.verified_sources or []],
        raw_report=repair_text(review.raw_report),
        review_mode=review.review_mode,
        llm_provider=review.llm_provider,
        llm_model=review.llm_model,
        llm_error=repair_text(review.llm_error) if review.llm_error else None,
        confidence=review.confidence,
        created_at=review.created_at,
    )


async def _output_read(db: AsyncSession, output: Output) -> ContentOutputRead:
    versions = await output_versions(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    content = current_version.content if current_version else ""
    profile = document_profile(output.channel, output.format, output.category)
    return ContentOutputRead(
        id=output.id,
        brand_slug=output.brand_slug,
        category=output.category,
        channel=output.channel,
        format=output.format,
        title=output.title,
        briefing=output.briefing,
        status=output.status,
        provider=output.provider,
        model=output.model,
        agent_run_id=output.agent_run_id,
        current_version_id=output.current_version_id,
        current_version_number=current_version.version_number if current_version else None,
        current_content=content,
        document_type=profile.document_type,
        document_sections=document_sections(content),
        quality_notes=quality_notes_for_content(content, profile),
        created_at=output.created_at,
        updated_at=output.updated_at,
    )


async def _workflow_detail(db: AsyncSession, output: Output) -> OutputWorkflowDetail:
    base = await _output_read(db, output)
    versions = await output_versions(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    latest_review = await latest_quality_review(
        db,
        output.id,
        current_version.id if current_version else None,
    )
    approved_memory_id, temporary_learning_id, latest_feedback = await output_effects(
        db,
        output.id,
    )
    return OutputWorkflowDetail(
        **base.model_dump(),
        versions=[_version_read(version) for version in versions],
        latest_quality_review=_quality_review_read(latest_review),
        approved_memory_id=approved_memory_id,
        temporary_learning_id=temporary_learning_id,
        latest_feedback=latest_feedback,
    )


async def _get_output_or_404(db: AsyncSession, output_id: int) -> Output:
    result = await db.execute(select(Output).where(Output.id == output_id))
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output nao encontrado.",
        )
    return output


async def _current_version_or_404(db: AsyncSession, output: Output) -> OutputVersion:
    versions = await output_versions(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    if current_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output sem versao exportavel.",
        )
    return current_version


def _export_response(exported: ExportResult) -> Response:
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )


def _output_export_document(output: Output, version: OutputVersion) -> ExportDocument:
    profile = document_profile(output.channel, output.format, output.category)
    sections = document_sections(version.content)
    notes = quality_notes_for_content(version.content, profile)
    return ExportDocument(
        title=output.title,
        subtitle="Output Duofy exportado para revisao",
        metadata=[
            ("Tipo documental", profile.title),
            ("Marca", output.brand_slug),
            ("Categoria", output.category),
            ("Canal", output.channel),
            ("Formato", output.format),
            ("Status", output.status),
            ("Modelo", output.model),
            ("Versao", str(version.version_number)),
            ("Seções", ", ".join(sections[:8]) if sections else "Não detectadas"),
            ("Notas de qualidade", " | ".join(notes[:4])),
        ],
        content=version.content,
        filename_prefix=f"duofy-output-{output.id}",
    )


def _workflow_error(exc: OutputWorkflowError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


async def _comment_read(db: AsyncSession, comment: OutputComment) -> OutputCommentRead:
    user_name: str | None = None
    if comment.user_id is not None:
        result = await db.execute(select(User).where(User.id == comment.user_id))
        user = result.scalar_one_or_none()
        user_name = user.name if user else None
    return OutputCommentRead(
        id=comment.id,
        output_id=comment.output_id,
        version_id=comment.version_id,
        user_id=comment.user_id,
        user_name=user_name,
        anchor_text=comment.anchor_text,
        selected_text=comment.selected_text,
        comment=comment.comment,
        status=comment.status,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


def _polish_editor_note(value: str | None) -> str | None:
    if not value:
        return value
    return (
        repair_text(value)
        .replace("Geracao inicial", "Geração inicial")
        .replace("Relatorio inicial", "Relatório inicial")
        .replace("Edicao manual", "Edição manual")
        .replace("Edicao em aprovacao", "Edição em aprovação")
        .replace("edicao", "edição")
        .replace("Reformatacao", "Reformatação")
        .replace("formatacao", "formatação")
        .replace("Restauracao da versao", "Restauração da versão")
    )


def _version_read(version: OutputVersion) -> ContentOutputVersionRead:
    return ContentOutputVersionRead(
        id=version.id,
        output_id=version.output_id,
        version_number=version.version_number,
        content=repair_text(version.content),
        editor_note=_polish_editor_note(version.editor_note),
        created_at=version.created_at,
    )


async def _output_read(db: AsyncSession, output: Output) -> ContentOutputRead:
    versions = await output_versions(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    content = repair_text(current_version.content) if current_version else ""
    channel = repair_text(output.channel)
    content_format = repair_text(output.format)
    category = repair_text(output.category)
    profile = document_profile(channel, content_format, category)
    return ContentOutputRead(
        id=output.id,
        brand_slug=repair_text(output.brand_slug),
        category=category,
        channel=channel,
        format=content_format,
        title=repair_text(output.title),
        briefing=repair_text(output.briefing),
        status=output.status,
        provider=repair_text(output.provider),
        model=repair_text(output.model),
        agent_run_id=output.agent_run_id,
        current_version_id=output.current_version_id,
        current_version_number=current_version.version_number if current_version else None,
        current_content=content,
        document_type=profile.document_type,
        document_sections=document_sections(content),
        quality_notes=quality_notes_for_content(content, profile),
        created_at=output.created_at,
        updated_at=output.updated_at,
    )


def _output_export_document(output: Output, version: OutputVersion) -> ExportDocument:
    channel = repair_text(output.channel)
    content_format = repair_text(output.format)
    category = repair_text(output.category)
    profile = document_profile(channel, content_format, category)
    content = repair_text(version.content)
    sections = document_sections(content)
    notes = quality_notes_for_content(content, profile)
    return ExportDocument(
        title=repair_text(output.title),
        subtitle="Output Duofy exportado para revisao",
        metadata=[
            ("Tipo documental", profile.title),
            ("Marca", repair_text(output.brand_slug)),
            ("Categoria", category),
            ("Canal", channel),
            ("Formato", content_format),
            ("Status", output.status),
            ("Modelo", repair_text(output.model)),
            ("Versao", str(version.version_number)),
            ("Secoes", ", ".join(sections[:8]) if sections else "Nao detectadas"),
            ("Notas de qualidade", " | ".join(notes[:4])),
        ],
        content=content,
        filename_prefix=f"duofy-output-{output.id}",
    )


@router.get("", response_model=list[ContentOutputRead])
async def list_outputs(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    category: str | None = None,
    format_filter: Annotated[str | None, Query(alias="format")] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    query: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ContentOutputRead]:
    statement = select(Output)
    if brand_slug:
        statement = statement.where(Output.brand_slug == brand_slug)
    if category:
        statement = statement.where(Output.category == category)
    if format_filter:
        statement = statement.where(Output.format == format_filter)
    if status_filter:
        statement = statement.where(Output.status == status_filter)
    if query:
        like_query = f"%{query}%"
        statement = statement.where(
            Output.title.ilike(like_query) | Output.briefing.ilike(like_query)
        )
    statement = statement.order_by(Output.updated_at.desc()).limit(limit)
    result = await db.execute(statement)
    return [await _output_read(db, output) for output in result.scalars().all()]


@router.get("/{output_id}", response_model=OutputWorkflowDetail)
async def get_output(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    return await _workflow_detail(db, output)


@router.get("/{output_id}/comments", response_model=list[OutputCommentRead])
async def list_output_comments(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OutputCommentRead]:
    await _get_output_or_404(db, output_id)
    result = await db.execute(
        select(OutputComment)
        .where(OutputComment.output_id == output_id)
        .order_by(OutputComment.status.asc(), OutputComment.created_at.desc())
    )
    return [await _comment_read(db, comment) for comment in result.scalars().all()]


@router.post("/{output_id}/comments", response_model=OutputCommentRead)
async def create_output_comment(
    output_id: int,
    payload: OutputCommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputCommentRead:
    await _get_output_or_404(db, output_id)
    if payload.version_id is not None:
        version = await get_output_version(db, output_id, payload.version_id)
        if version is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Versao do output nao encontrada.",
            )
    comment = OutputComment(
        output_id=output_id,
        version_id=payload.version_id,
        user_id=current_user.id,
        anchor_text=payload.anchor_text,
        selected_text=payload.selected_text,
        comment=payload.comment,
        status="open",
    )
    db.add(comment)
    await record_audit_event(
        db,
        user=current_user,
        action="output.comment_created",
        entity_type="output",
        entity_id=output_id,
        summary="Comentário criado em output.",
        metadata={"version_id": payload.version_id, "anchor_text": payload.anchor_text},
    )
    await db.commit()
    await db.refresh(comment)
    return await _comment_read(db, comment)


@router.patch("/{output_id}/comments/{comment_id}", response_model=OutputCommentRead)
async def update_output_comment(
    output_id: int,
    comment_id: int,
    payload: OutputCommentUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputCommentRead:
    await _get_output_or_404(db, output_id)
    result = await db.execute(
        select(OutputComment).where(
            OutputComment.id == comment_id,
            OutputComment.output_id == output_id,
        )
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comentario nao encontrado.",
        )
    if payload.comment is not None:
        comment.comment = payload.comment
    if payload.status is not None:
        comment.status = payload.status
        comment.resolved_at = datetime.now(UTC) if payload.status == "resolved" else None
    await record_audit_event(
        db,
        user=current_user,
        action="output.comment_updated",
        entity_type="output",
        entity_id=output_id,
        status=comment.status,
        summary=f"Comentário {comment.id} atualizado.",
        metadata={"comment_id": comment.id},
    )
    await db.commit()
    await db.refresh(comment)
    return await _comment_read(db, comment)


@router.post("/reformat-legacy", response_model=OutputReformatLegacyResponse)
async def reformat_legacy_outputs_endpoint(
    payload: OutputReformatLegacyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputReformatLegacyResponse:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem reformatar outputs legados.",
        )
    result = await reformat_legacy_outputs(
        db,
        status_filter=payload.status,
        brand_slug=payload.brand_slug,
        limit=payload.limit,
    )
    await record_audit_event(
        db,
        user=current_user,
        action="outputs.reformat_legacy",
        entity_type="maintenance",
        status="success",
        brand_slug=payload.brand_slug,
        summary="Reformatação administrativa de outputs legados.",
        metadata=result,
    )
    await db.commit()
    return OutputReformatLegacyResponse(**result)


@router.post("/repair-formatting", response_model=OutputRepairFormattingResponse)
async def repair_formatting_outputs_endpoint(
    payload: OutputRepairFormattingRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputRepairFormattingResponse:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem reparar outputs.",
        )
    result = await repair_formatting_outputs(
        db,
        status_filter=payload.status,
        brand_slug=payload.brand_slug,
        output_id=payload.output_id,
        limit=payload.limit,
    )
    await record_audit_event(
        db,
        user=current_user,
        action="outputs.repair_formatting",
        entity_type="maintenance",
        status="success",
        brand_slug=payload.brand_slug,
        summary="Reparo administrativo de formatação executado.",
        metadata=result,
    )
    await db.commit()
    return OutputRepairFormattingResponse(
        checked=result["checked"],
        repaired=result["repaired"],
        skipped=result["skipped"],
    )


@router.post("/{output_id}/quality-review", response_model=OutputWorkflowDetail)
async def review_output_quality_endpoint(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: Annotated[QualityReviewRequest | None, Body()] = None,
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        review = await review_output_quality(
            db,
            output,
            force=payload.force if payload else True,
            mode=payload.mode if payload else None,
        )
        await record_audit_event(
            db,
            user=current_user,
            action="quality_review.created",
            entity_type="output",
            entity_id=output.id,
            status=review.status,
            brand_slug=output.brand_slug,
            agent_slug="quality_guardian",
            summary=f"Guardião avaliou output com score {review.score}/100.",
            metadata={
                "quality_review_id": review.id,
                "passed": review.passed,
                "review_mode": review.review_mode,
                "llm_provider": review.llm_provider,
            },
        )
        await db.commit()
        await db.refresh(output)
    except OutputWorkflowError as exc:
        await db.rollback()
        raise _workflow_error(exc) from exc
    return await _workflow_detail(db, output)


@router.get("/{output_id}/versions", response_model=list[ContentOutputVersionRead])
async def get_output_versions(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ContentOutputVersionRead]:
    await _get_output_or_404(db, output_id)
    versions = await output_versions(db, output_id)
    return [_version_read(version) for version in versions]


@router.get(
    "/{output_id}/versions/{from_version_id}/compare/{to_version_id}",
    response_model=OutputVersionCompareRead,
)
async def compare_output_versions(
    output_id: int,
    from_version_id: int,
    to_version_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputVersionCompareRead:
    await _get_output_or_404(db, output_id)
    from_version = await get_output_version(db, output_id, from_version_id)
    to_version = await get_output_version(db, output_id, to_version_id)
    if from_version is None or to_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Versao do output nao encontrada.",
        )
    return OutputVersionCompareRead(
        output_id=output_id,
        from_version=_version_read(from_version),
        to_version=_version_read(to_version),
        lines=compare_version_content(from_version, to_version),
    )


@router.post("/{output_id}/versions/{version_id}/restore", response_model=OutputWorkflowDetail)
async def restore_output_version_endpoint(
    output_id: int,
    version_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    version = await get_output_version(db, output_id, version_id)
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Versao do output nao encontrada.",
        )
    try:
        output = await restore_output_version(db, output, version)
    except OutputWorkflowError as exc:
        raise _workflow_error(exc) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="output.version_restored",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Versão {version.version_number} restaurada.",
        metadata={"version_id": version.id},
    )
    await db.commit()
    return await _workflow_detail(db, output)


@router.get("/{output_id}/pdf")
async def export_output_pdf(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    return await export_output(output_id, _current_user, db, "pdf")


@router.get("/{output_id}/export")
async def export_output(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: Annotated[str, Query(pattern="^(pdf|docx|md|html)$")] = "pdf",
) -> Response:
    output = await _get_output_or_404(db, output_id)
    current_version = await _current_version_or_404(db, output)
    export_data = _output_export_document(output, current_version)
    exported = await run_in_threadpool(export_document, export_data, format)
    return _export_response(exported)


@router.patch("/{output_id}", response_model=OutputWorkflowDetail)
async def update_output(
    output_id: int,
    payload: ContentOutputUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        output = await edit_output(db, output, payload)
    except OutputWorkflowError as exc:
        raise _workflow_error(exc) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="output.updated",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Output atualizado: {output.title}",
        metadata={
            "title_changed": payload.title is not None,
            "content_changed": payload.content is not None,
        },
    )
    await db.commit()
    return await _workflow_detail(db, output)


@router.post("/{output_id}/approve", response_model=OutputWorkflowDetail)
async def approve_output_endpoint(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        output = await approve_output(db, output, current_user)
    except OutputWorkflowError as exc:
        raise _workflow_error(exc) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="output.approved",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Output aprovado: {output.title}",
    )
    await db.commit()
    return await _workflow_detail(db, output)


@router.post("/{output_id}/reject", response_model=OutputWorkflowDetail)
async def reject_output_endpoint(
    output_id: int,
    payload: OutputActionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        output = await reject_output(db, output, current_user, payload.feedback)
    except OutputWorkflowError as exc:
        raise _workflow_error(exc) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="output.rejected",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Output rejeitado: {output.title}",
        metadata={"feedback": payload.feedback},
    )
    await db.commit()
    return await _workflow_detail(db, output)


@router.post("/{output_id}/request-adjustment", response_model=OutputWorkflowDetail)
async def request_adjustment_endpoint(
    output_id: int,
    payload: OutputActionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        output = await request_adjustment(db, output, current_user, payload.feedback)
    except OutputWorkflowError as exc:
        raise _workflow_error(exc) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="output.adjustment_requested",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Ajuste solicitado: {output.title}",
        metadata={"feedback": payload.feedback},
    )
    await db.commit()
    return await _workflow_detail(db, output)


@router.post("/{output_id}/archive", response_model=OutputWorkflowDetail)
async def archive_output_endpoint(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutputWorkflowDetail:
    output = await _get_output_or_404(db, output_id)
    output = await archive_output(db, output, current_user)
    await record_audit_event(
        db,
        user=current_user,
        action="output.archived",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        summary=f"Output arquivado: {output.title}",
    )
    await db.commit()
    return await _workflow_detail(db, output)
