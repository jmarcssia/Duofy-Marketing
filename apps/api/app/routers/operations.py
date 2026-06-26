from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.models import AuditEvent, QualityReview, User
from app.operations_service import agent_health, apply_audit_filters, operations_summary
from app.schemas import (
    AgentHealthRead,
    AuditEventRead,
    OperationsSummary,
    QualityReviewListItem,
)
from app.text_repair import repair_text

router = APIRouter(prefix="/api/operations", tags=["operations"])


def _audit_event_read(event: AuditEvent) -> AuditEventRead:
    return AuditEventRead(
        id=event.id,
        user_id=event.user_id,
        user_email=event.user_email,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        action=event.action,
        status=event.status,
        brand_slug=event.brand_slug,
        agent_slug=event.agent_slug,
        summary=repair_text(event.summary),
        metadata_json=event.metadata_json,
        created_at=event.created_at,
    )


def _quality_review_item(review: QualityReview) -> QualityReviewListItem:
    return QualityReviewListItem(
        id=review.id,
        output_id=review.output_id,
        version_id=review.version_id,
        reviewer_slug=review.reviewer_slug,
        status=review.status,
        score=review.score,
        passed=review.passed,
        review_mode=review.review_mode,
        llm_provider=review.llm_provider,
        llm_model=review.llm_model,
        llm_error=repair_text(review.llm_error) if review.llm_error else None,
        confidence=review.confidence,
        summary=repair_text(review.summary),
        created_at=review.created_at,
    )


@router.get("/summary", response_model=OperationsSummary)
async def get_operations_summary(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
) -> OperationsSummary:
    return OperationsSummary(
        **await operations_summary(db, start=start, end=end, brand_slug=brand_slug)
    )


@router.get("/agent-health", response_model=list[AgentHealthRead])
async def get_agent_health(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[AgentHealthRead]:
    return [AgentHealthRead(**item) for item in await agent_health(db, start=start, end=end)]


@router.get("/quality-reviews", response_model=list[QualityReviewListItem])
async def list_quality_reviews(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    passed: bool | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
) -> list[QualityReviewListItem]:
    statement = select(QualityReview)
    if passed is not None:
        statement = statement.where(QualityReview.passed == passed)
    if status_filter:
        statement = statement.where(QualityReview.status == status_filter)
    result = await db.execute(statement.order_by(QualityReview.created_at.desc()).limit(limit))
    return [_quality_review_item(review) for review in result.scalars().all()]


@router.get("/audit-events", response_model=list[AuditEventRead])
async def list_audit_events(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=300)] = 120,
) -> list[AuditEventRead]:
    statement = apply_audit_filters(
        select(AuditEvent),
        start=start,
        end=end,
        brand_slug=brand_slug,
        action=action,
        entity_type=entity_type,
        status=status_filter,
    )
    result = await db.execute(statement.order_by(AuditEvent.created_at.desc()).limit(limit))
    return [_audit_event_read(event) for event in result.scalars().all()]
