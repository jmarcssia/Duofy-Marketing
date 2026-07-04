from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import accessible_brands, assert_brand_access
from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.document_formatting import document_profile, document_sections, quality_notes_for_content
from app.llm import LLMConfigurationError
from app.models import Output, OutputVersion, ResearchSource, User
from app.research_service import (
    research_to_content_briefing,
    run_market_research,
    save_research_as_memory,
)
from app.schemas import (
    ResearchContentBriefingResponse,
    ResearchMemoryResponse,
    ResearchReportRead,
    ResearchRunRequest,
    ResearchSourceRead,
)

router = APIRouter(prefix="/api/research", tags=["research"])


def _source_read(source: ResearchSource) -> ResearchSourceRead:
    return ResearchSourceRead(
        id=source.id,
        output_id=source.output_id,
        title=source.title,
        url=source.url,
        publisher=source.publisher,
        published_at=source.published_at,
        accessed_at=source.accessed_at,
        reliability=source.reliability,
        source_kind=source.source_kind,
        status=source.status,
        evidence=source.evidence,
        error=source.error,
    )


async def _versions_for_output(db: AsyncSession, output_id: int) -> list[OutputVersion]:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output_id)
        .order_by(OutputVersion.version_number.asc())
    )
    return list(result.scalars().all())


async def _sources_for_output(db: AsyncSession, output_id: int) -> list[ResearchSource]:
    result = await db.execute(
        select(ResearchSource)
        .where(ResearchSource.output_id == output_id)
        .order_by(ResearchSource.id.asc())
    )
    return list(result.scalars().all())


async def _report_read(db: AsyncSession, output: Output) -> ResearchReportRead:
    versions = await _versions_for_output(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    sources = await _sources_for_output(db, output.id)
    content = current_version.content if current_version else ""
    profile = document_profile(output.channel, output.format, output.category)
    return ResearchReportRead(
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
        sources=[_source_read(source) for source in sources],
    )


async def _get_report_or_404(
    db: AsyncSession, output_id: int, user: User | None = None
) -> Output:
    result = await db.execute(
        select(Output).where(
            Output.id == output_id,
            Output.channel == "Pesquisa",
            Output.format == "research_report",
        )
    )
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relatorio de pesquisa nao encontrado.",
        )
    if user is not None:  # C1: isolamento por marca
        assert_brand_access(user, output.brand_slug)
    return output


async def _current_content_or_404(db: AsyncSession, output: Output) -> str:
    versions = await _versions_for_output(db, output.id)
    current_version = next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )
    if current_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relatorio sem versao atual.",
        )
    return current_version.content


@router.post("/run", response_model=ResearchReportRead)
async def run_research(
    payload: ResearchRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchReportRead:
    try:
        output = await run_market_research(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao executar pesquisa: {exc}",
        ) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="research.report_created",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        agent_slug="research_agent",
        summary=f"Pesquisa criada: {output.title}",
        metadata={"theme": payload.theme, "depth": payload.depth, "provider": output.provider},
    )
    await db.commit()
    return await _report_read(db, output)


@router.get("/reports", response_model=list[ResearchReportRead])
async def list_reports(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    theme: str | None = None,
    period: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ResearchReportRead]:
    statement = select(Output).where(
        Output.channel == "Pesquisa",
        Output.format == "research_report",
    )
    allowed = accessible_brands(current_user)  # C1: só as marcas do usuário
    if allowed is not None:
        statement = statement.where(Output.brand_slug.in_(allowed))
    if brand_slug:
        statement = statement.where(Output.brand_slug == brand_slug)
    if status_filter:
        statement = statement.where(Output.status == status_filter)
    if theme:
        like_theme = f"%{theme}%"
        statement = statement.where(
            Output.title.ilike(like_theme) | Output.briefing.ilike(like_theme)
        )
    if period:
        statement = statement.where(Output.briefing.ilike(f"%{period}%"))
    statement = statement.order_by(Output.updated_at.desc()).limit(limit)
    result = await db.execute(statement)
    return [await _report_read(db, output) for output in result.scalars().all()]


@router.get("/reports/{report_id}", response_model=ResearchReportRead)
async def get_report(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchReportRead:
    output = await _get_report_or_404(db, report_id, current_user)
    return await _report_read(db, output)


@router.post("/reports/{report_id}/save-memory", response_model=ResearchMemoryResponse)
async def save_report_memory(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchMemoryResponse:
    output = await _get_report_or_404(db, report_id, current_user)
    content = await _current_content_or_404(db, output)
    memory = await save_research_as_memory(db, output, content)
    await record_audit_event(
        db,
        user=current_user,
        action="research.saved_memory",
        entity_type="memory_entry",
        entity_id=memory.id,
        status="success",
        brand_slug=output.brand_slug,
        agent_slug="research_agent",
        summary=f"Pesquisa salva como memória: {output.title}",
        metadata={"output_id": output.id},
    )
    await db.commit()
    return ResearchMemoryResponse(memory_entry_id=memory.id, title=memory.title)


@router.post(
    "/reports/{report_id}/use-in-content",
    response_model=ResearchContentBriefingResponse,
)
async def use_report_in_content(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchContentBriefingResponse:
    output = await _get_report_or_404(db, report_id, current_user)
    content = await _current_content_or_404(db, output)
    await record_audit_event(
        db,
        user=current_user,
        action="research.used_in_content",
        entity_type="output",
        entity_id=output.id,
        status="success",
        brand_slug=output.brand_slug,
        agent_slug="research_agent",
        summary=f"Pesquisa enviada para briefing: {output.title}",
    )
    await db.commit()
    return ResearchContentBriefingResponse(
        brand_slug=output.brand_slug,
        category="research",
        channel="LinkedIn",
        format="Post LinkedIn",
        briefing=research_to_content_briefing(output, content),
    )
