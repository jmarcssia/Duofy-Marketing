from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.metrics_service import apply_model_call_filters, metrics_summary
from app.models import ModelCall, User
from app.schemas import MetricsSummary, ModelCallRead

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _model_call_read(call: ModelCall) -> ModelCallRead:
    return ModelCallRead(
        id=call.id,
        task_type=call.task_type,
        task_id=call.task_id,
        agent_slug=call.agent_slug,
        brand_slug=call.brand_slug,
        provider=call.provider,
        model=call.model,
        input_tokens=call.input_tokens,
        output_tokens=call.output_tokens,
        total_tokens=call.total_tokens,
        estimated_cost_usd=call.estimated_cost_usd,
        latency_ms=call.latency_ms,
        status=call.status,
        error=call.error,
        created_at=call.created_at,
    )


@router.get("/summary", response_model=MetricsSummary)
async def get_summary(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
) -> MetricsSummary:
    summary = await metrics_summary(db, start=start, end=end, brand_slug=brand_slug)
    return MetricsSummary(**summary)


@router.get("/model-calls", response_model=list[ModelCallRead])
async def list_model_calls(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
    agent_slug: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    status: str | None = None,
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
) -> list[ModelCallRead]:
    statement = apply_model_call_filters(
        select(ModelCall),
        start=start,
        end=end,
        brand_slug=brand_slug,
        agent_slug=agent_slug,
        provider=provider,
        model=model,
        status=status,
    )
    statement = statement.order_by(ModelCall.created_at.desc()).limit(limit)
    result = await db.execute(statement)
    return [_model_call_read(call) for call in result.scalars().all()]
