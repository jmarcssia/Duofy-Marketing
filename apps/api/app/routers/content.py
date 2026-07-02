from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.content_generation import (
    edit_content_output,
    generate_content_output,
    refine_content_output,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.document_formatting import document_profile, document_sections, quality_notes_for_content
from app.llm import LLMConfigurationError
from app.models import Output, OutputVersion, QualityReview, User
from app.output_workflow import OutputWorkflowError
from app.quality_guardian import latest_quality_review, review_output_quality
from app.schemas import (
    ContentGenerateRequest,
    ContentOutputDetail,
    ContentOutputRead,
    ContentOutputUpdate,
    ContentOutputVersionRead,
    ContentRefineRequest,
    QualityReviewRead,
)

router = APIRouter(prefix="/api/content", tags=["content"])


async def _versions_for_output(
    db: AsyncSession,
    output_id: int,
) -> list[OutputVersion]:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output_id)
        .order_by(OutputVersion.version_number.asc())
    )
    return list(result.scalars().all())


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
        summary=review.summary,
        critical_failures=[str(item) for item in review.critical_failures or []],
        required_fixes=[str(item) for item in review.required_fixes or []],
        optional_improvements=[str(item) for item in review.optional_improvements or []],
        verified_sources=[str(item) for item in review.verified_sources or []],
        raw_report=review.raw_report,
        review_mode=review.review_mode,
        llm_provider=review.llm_provider,
        llm_model=review.llm_model,
        llm_error=review.llm_error,
        confidence=review.confidence,
        created_at=review.created_at,
    )


async def _output_read(db: AsyncSession, output: Output) -> ContentOutputRead:
    versions = await _versions_for_output(db, output.id)
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


async def _output_detail(db: AsyncSession, output: Output) -> ContentOutputDetail:
    base = await _output_read(db, output)
    versions = await _versions_for_output(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    review = await latest_quality_review(
        db,
        output.id,
        current_version.id if current_version else None,
    )
    return ContentOutputDetail(
        **base.model_dump(),
        versions=[_version_read(version) for version in versions],
        latest_quality_review=_quality_review_read(review),
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


@router.post("/generate", response_model=ContentOutputRead)
async def generate_content(
    payload: ContentGenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputRead:
    try:
        output = await generate_content_output(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao gerar conteudo: {exc}",
        ) from exc

    await record_audit_event(
        db,
        user=current_user,
        action="content.generated",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        agent_slug="content_agent",
        summary=f"Conteúdo gerado: {output.title}",
        metadata={"channel": output.channel, "format": output.format, "model": output.model},
    )
    await db.commit()
    return await _output_read(db, output)


@router.post("/outputs/{output_id}/refine", response_model=ContentOutputDetail)
async def refine_output(
    output_id: int,
    payload: ContentRefineRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        output = await refine_content_output(db, output, payload.instruction)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao refinar conteudo: {exc}",
        ) from exc

    await record_audit_event(
        db,
        user=current_user,
        action="content.refined",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        agent_slug="content_agent",
        summary=f"Conteúdo refinado: {output.title}",
        metadata={"instruction": payload.instruction[:180]},
    )
    await db.commit()
    return await _output_detail(db, output)


@router.get("/outputs", response_model=list[ContentOutputRead])
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


@router.get("/outputs/{output_id}", response_model=ContentOutputDetail)
async def get_output(
    output_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputDetail:
    output = await _get_output_or_404(db, output_id)
    return await _output_detail(db, output)


@router.patch("/outputs/{output_id}", response_model=ContentOutputDetail)
async def update_output(
    output_id: int,
    payload: ContentOutputUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputDetail:
    output = await _get_output_or_404(db, output_id)
    output = await edit_content_output(db, output, payload)
    await record_audit_event(
        db,
        user=current_user,
        action="content.updated",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        agent_slug="content_agent",
        summary=f"Output atualizado: {output.title}",
        metadata={
            "title_changed": payload.title is not None,
            "content_changed": payload.content is not None,
        },
    )
    await db.commit()
    return await _output_detail(db, output)


@router.post("/outputs/{output_id}/submit-review", response_model=ContentOutputDetail)
async def submit_output_review(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputDetail:
    output = await _get_output_or_404(db, output_id)
    try:
        review = await review_output_quality(db, output, force=True)
        output.status = "review" if review.passed else "needs_adjustment"
        await record_audit_event(
            db,
            user=current_user,
            action="content.submitted_review",
            entity_type="output",
            entity_id=output.id,
            status=output.status,
            brand_slug=output.brand_slug,
            agent_slug="quality_guardian",
            summary=f"Envio para revisão com score {review.score}/100.",
            metadata={"quality_review_id": review.id, "passed": review.passed},
        )
        await db.commit()
        await db.refresh(output)
    except OutputWorkflowError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return await _output_detail(db, output)
