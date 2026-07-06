from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import assert_brand_access
from app.audit_service import record_audit_event
from app.calendar_service import generate_press_output
from app.db import get_db
from app.dependencies import get_current_user
from app.document_formatting import document_profile, document_sections, quality_notes_for_content
from app.llm import LLMConfigurationError
from app.models import Output, OutputVersion, User
from app.schemas import ContentOutputRead, PressGenerateRequest

router = APIRouter(prefix="/api/press", tags=["press"])


async def _current_version(db: AsyncSession, output: Output) -> OutputVersion | None:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output.id)
        .order_by(OutputVersion.version_number.desc())
    )
    return result.scalars().first()


async def _output_read(db: AsyncSession, output: Output) -> ContentOutputRead:
    version = await _current_version(db, output)
    content = version.content if version else ""
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
        current_version_number=version.version_number if version else None,
        current_content=content,
        document_type=profile.document_type,
        document_sections=document_sections(content),
        quality_notes=quality_notes_for_content(content, profile),
        created_at=output.created_at,
        updated_at=output.updated_at,
    )


@router.post("/generate", response_model=ContentOutputRead)
async def generate_press(
    payload: PressGenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentOutputRead:
    assert_brand_access(current_user, payload.brand_slug)
    try:
        output = await generate_press_output(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao gerar assessoria: {exc}",
        ) from exc
    await record_audit_event(
        db,
        user=current_user,
        action="press.output_created",
        entity_type="output",
        entity_id=output.id,
        status=output.status,
        brand_slug=output.brand_slug,
        agent_slug="press_agent",
        summary=f"Entrega de imprensa criada: {output.title}",
        metadata={"format": output.format, "event_id": payload.event_id},
    )
    await db.commit()
    return await _output_read(db, output)
