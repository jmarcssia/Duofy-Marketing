from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentRun, AuditEvent, ModelCall, OutputDecision, QualityReview


def apply_audit_filters(
    statement: Select[tuple[AuditEvent]],
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    status: str | None = None,
) -> Select[tuple[AuditEvent]]:
    if start:
        statement = statement.where(AuditEvent.created_at >= start)
    if end:
        statement = statement.where(AuditEvent.created_at <= end)
    if brand_slug:
        statement = statement.where(AuditEvent.brand_slug == brand_slug)
    if action:
        statement = statement.where(AuditEvent.action == action)
    if entity_type:
        statement = statement.where(AuditEvent.entity_type == entity_type)
    if status:
        statement = statement.where(AuditEvent.status == status)
    return statement


async def operations_summary(
    db: AsyncSession,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
) -> dict[str, Any]:
    model_calls = select(ModelCall)
    quality_reviews = select(QualityReview)
    audit_events = select(AuditEvent)
    if start:
        model_calls = model_calls.where(ModelCall.created_at >= start)
        quality_reviews = quality_reviews.where(QualityReview.created_at >= start)
        audit_events = audit_events.where(AuditEvent.created_at >= start)
    if end:
        model_calls = model_calls.where(ModelCall.created_at <= end)
        quality_reviews = quality_reviews.where(QualityReview.created_at <= end)
        audit_events = audit_events.where(AuditEvent.created_at <= end)
    if brand_slug:
        model_calls = model_calls.where(ModelCall.brand_slug == brand_slug)
        audit_events = audit_events.where(AuditEvent.brand_slug == brand_slug)

    model_base = model_calls.subquery()
    quality_base = quality_reviews.subquery()
    audit_base = audit_events.subquery()

    model_totals = (
        await db.execute(
            select(
                func.count(model_base.c.id),
                func.count(model_base.c.id).filter(model_base.c.status == "failed"),
                func.coalesce(func.sum(model_base.c.estimated_cost_usd), 0.0),
                func.avg(model_base.c.latency_ms),
            )
        )
    ).one()
    run_statement = select(AgentRun)
    if start:
        run_statement = run_statement.where(AgentRun.created_at >= start)
    if end:
        run_statement = run_statement.where(AgentRun.created_at <= end)
    run_base = run_statement.subquery()
    run_totals = (
        await db.execute(
            select(
                func.count(run_base.c.id),
                func.count(run_base.c.id).filter(run_base.c.status == "failed"),
            )
        )
    ).one()
    quality_totals = (
        await db.execute(
            select(
                func.count(quality_base.c.id),
                func.count(quality_base.c.id).filter(quality_base.c.passed.is_(False)),
                func.avg(quality_base.c.score),
            )
        )
    ).one()
    decision_totals = (await db.execute(select(func.count(OutputDecision.id)))).scalar_one()
    audit_total = (await db.execute(select(func.count(audit_base.c.id)))).scalar_one()

    by_agent = await _group_model_calls(db, model_base, "agent_slug")
    by_provider = await _group_model_calls(db, model_base, "provider")
    by_action_result = await db.execute(
        select(
            audit_base.c.action.label("key"),
            func.count(audit_base.c.id).label("events"),
        )
        .group_by(audit_base.c.action)
        .order_by(func.count(audit_base.c.id).desc())
        .limit(12)
    )
    recent_error_result = await db.execute(
        select(ModelCall)
        .where(ModelCall.status == "failed")
        .order_by(ModelCall.created_at.desc())
        .limit(8)
    )
    return {
        "total_model_calls": int(model_totals[0] or 0),
        "failed_model_calls": int(model_totals[1] or 0),
        "estimated_cost_usd": float(model_totals[2] or 0),
        "avg_latency_ms": float(model_totals[3]) if model_totals[3] is not None else None,
        "total_agent_runs": int(run_totals[0] or 0),
        "failed_agent_runs": int(run_totals[1] or 0),
        "total_quality_reviews": int(quality_totals[0] or 0),
        "failed_quality_reviews": int(quality_totals[1] or 0),
        "avg_quality_score": float(quality_totals[2]) if quality_totals[2] is not None else None,
        "total_decisions": int(decision_totals or 0),
        "audit_events": int(audit_total or 0),
        "recent_errors": [
            {
                "id": call.id,
                "agent_slug": call.agent_slug,
                "provider": call.provider,
                "model": call.model,
                "error": call.error,
                "created_at": call.created_at.isoformat(),
            }
            for call in recent_error_result.scalars().all()
        ],
        "by_agent": by_agent,
        "by_provider": by_provider,
        "by_action": [
            {"key": row.key or "sem_acao", "events": int(row.events or 0)}
            for row in by_action_result
        ],
    }


async def agent_health(
    db: AsyncSession,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[dict[str, Any]]:
    model_calls = select(ModelCall)
    if start:
        model_calls = model_calls.where(ModelCall.created_at >= start)
    if end:
        model_calls = model_calls.where(ModelCall.created_at <= end)
    base = model_calls.subquery()
    result = await db.execute(
        select(
            base.c.agent_slug,
            func.count(base.c.id).label("model_calls"),
            func.count(base.c.id).filter(base.c.status == "failed").label("failed_model_calls"),
            func.coalesce(func.sum(base.c.estimated_cost_usd), 0.0).label("cost"),
            func.avg(base.c.latency_ms).label("avg_latency_ms"),
            func.max(base.c.created_at).label("last_activity_at"),
        )
        .group_by(base.c.agent_slug)
        .order_by(func.count(base.c.id).desc())
    )
    rows = result.all()
    health: list[dict[str, Any]] = []
    for row in rows:
        agent_slug = row.agent_slug or "sem_agente"
        runs = await _agent_run_totals(db, agent_slug, start=start, end=end)
        failed_calls = int(row.failed_model_calls or 0)
        total_calls = int(row.model_calls or 0)
        failure_rate = failed_calls / total_calls if total_calls else 0
        status = "ok" if failure_rate < 0.15 else ("warning" if failure_rate < 0.35 else "critical")
        health.append(
            {
                "agent_slug": agent_slug,
                "model_calls": total_calls,
                "failed_model_calls": failed_calls,
                "agent_runs": runs["agent_runs"],
                "failed_agent_runs": runs["failed_agent_runs"],
                "estimated_cost_usd": float(row.cost or 0),
                "avg_latency_ms": (
                    float(row.avg_latency_ms) if row.avg_latency_ms is not None else None
                ),
                "last_activity_at": row.last_activity_at,
                "health_status": status,
            }
        )
    return health


async def _agent_run_totals(
    db: AsyncSession,
    agent_slug: str,
    *,
    start: datetime | None,
    end: datetime | None,
) -> dict[str, int]:
    statement = select(AgentRun).where(AgentRun.agent_slug == agent_slug)
    if start:
        statement = statement.where(AgentRun.created_at >= start)
    if end:
        statement = statement.where(AgentRun.created_at <= end)
    base = statement.subquery()
    totals = (
        await db.execute(
            select(
                func.count(base.c.id),
                func.count(base.c.id).filter(base.c.status == "failed"),
            )
        )
    ).one()
    return {"agent_runs": int(totals[0] or 0), "failed_agent_runs": int(totals[1] or 0)}


async def _group_model_calls(db: AsyncSession, base: Any, column_name: str) -> list[dict[str, Any]]:
    column = getattr(base.c, column_name)
    result = await db.execute(
        select(
            column.label("key"),
            func.count(base.c.id).label("calls"),
            func.count(base.c.id).filter(base.c.status == "failed").label("failed"),
            func.coalesce(func.sum(base.c.total_tokens), 0).label("tokens"),
            func.coalesce(func.sum(base.c.estimated_cost_usd), 0.0).label("cost"),
        )
        .group_by(column)
        .order_by(func.count(base.c.id).desc())
        .limit(12)
    )
    return [
        {
            "key": row.key or "sem_valor",
            "calls": int(row.calls or 0),
            "failed": int(row.failed or 0),
            "tokens": int(row.tokens or 0),
            "cost": float(row.cost or 0),
        }
        for row in result
    ]
