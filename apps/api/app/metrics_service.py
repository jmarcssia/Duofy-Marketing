from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import read_agent_prompt
from app.document_formatting import normalize_document_content
from app.models import ModelCall, Report
from app.operations_service import operations_summary
from app.schemas import ReportGenerateRequest


def default_period_start() -> datetime:
    return datetime.now(UTC) - timedelta(days=30)


def default_period_end() -> datetime:
    return datetime.now(UTC)


def apply_model_call_filters(
    statement: Select[tuple[ModelCall]],
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
    agent_slug: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    status: str | None = None,
    allowed_brands: list[str] | None = None,
) -> Select[tuple[ModelCall]]:
    if start:
        statement = statement.where(ModelCall.created_at >= start)
    if end:
        statement = statement.where(ModelCall.created_at <= end)
    if brand_slug:
        statement = statement.where(ModelCall.brand_slug == brand_slug)
    if allowed_brands is not None:
        # C1 — usuário restrito só enxerga custo/uso das marcas do seu escopo.
        statement = statement.where(ModelCall.brand_slug.in_(allowed_brands))
    if agent_slug:
        statement = statement.where(ModelCall.agent_slug == agent_slug)
    if provider:
        statement = statement.where(ModelCall.provider == provider)
    if model:
        statement = statement.where(ModelCall.model == model)
    if status:
        statement = statement.where(ModelCall.status == status)
    return statement


async def metrics_summary(
    db: AsyncSession,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    brand_slug: str | None = None,
    allowed_brands: list[str] | None = None,
) -> dict[str, Any]:
    base = apply_model_call_filters(
        select(ModelCall),
        start=start,
        end=end,
        brand_slug=brand_slug,
        allowed_brands=allowed_brands,
    ).subquery()

    totals_result = await db.execute(
        select(
            func.count(base.c.id),
            func.count(base.c.id).filter(base.c.status == "completed"),
            func.count(base.c.id).filter(base.c.status == "failed"),
            func.coalesce(func.sum(base.c.input_tokens), 0),
            func.coalesce(func.sum(base.c.output_tokens), 0),
            func.coalesce(func.sum(base.c.total_tokens), 0),
            func.coalesce(func.sum(base.c.estimated_cost_usd), 0.0),
            func.avg(base.c.latency_ms),
        )
    )
    totals = totals_result.one()

    async def group_by(column_name: str) -> list[dict[str, Any]]:
        column = getattr(base.c, column_name)
        result = await db.execute(
            select(
                column.label("key"),
                func.count(base.c.id).label("calls"),
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
                "tokens": int(row.tokens or 0),
                "cost": float(row.cost or 0),
            }
            for row in result
        ]

    return {
        "total_calls": int(totals[0] or 0),
        "completed_calls": int(totals[1] or 0),
        "failed_calls": int(totals[2] or 0),
        "total_input_tokens": int(totals[3] or 0),
        "total_output_tokens": int(totals[4] or 0),
        "total_tokens": int(totals[5] or 0),
        "estimated_cost_usd": float(totals[6] or 0),
        "avg_latency_ms": float(totals[7]) if totals[7] is not None else None,
        "by_provider": await group_by("provider"),
        "by_agent": await group_by("agent_slug"),
        "by_model": await group_by("model"),
    }


def metrics_report_content(
    summary: dict[str, Any],
    payload: ReportGenerateRequest,
    operations: dict[str, Any] | None = None,
) -> str:
    period_start = payload.period_start.isoformat() if payload.period_start else "padrao"
    period_end = payload.period_end.isoformat() if payload.period_end else "padrao"
    agent_prompt = read_agent_prompt("metrics_agent")
    operations = operations or {}
    return "\n".join(
        [
            "# Relatorio interno de metricas",
            "",
            f"Periodo inicial: {period_start}",
            f"Periodo final: {period_end}",
            f"Marca: {payload.brand_slug or 'Todas'}",
            "",
            "## Resumo operacional",
            f"- Chamadas totais: {summary['total_calls']}",
            f"- Chamadas concluidas: {summary['completed_calls']}",
            f"- Chamadas com falha: {summary['failed_calls']}",
            f"- Tokens totais: {summary['total_tokens']}",
            f"- Custo estimado USD: {summary['estimated_cost_usd']:.6f}",
            f"- Latencia media ms: {summary['avg_latency_ms'] or 0:.0f}",
            f"- Revisoes do Guardiao: {operations.get('total_quality_reviews', 0)}",
            f"- Revisoes bloqueadas: {operations.get('failed_quality_reviews', 0)}",
            f"- Decisoes registradas: {operations.get('total_decisions', 0)}",
            f"- Eventos de auditoria: {operations.get('audit_events', 0)}",
            "",
            "## Providers",
            *[
                f"- {item['key']}: {item['calls']} chamadas, "
                f"{item['tokens']} tokens, USD {item['cost']:.6f}"
                for item in summary["by_provider"]
            ],
            "",
            "## Agentes",
            *[
                f"- {item['key']}: {item['calls']} chamadas, "
                f"{item['tokens']} tokens, USD {item['cost']:.6f}"
                for item in summary["by_agent"]
            ],
            "",
            "## Riscos operacionais",
            *[
                (
                    f"- {item.get('agent_slug') or 'sem_agente'} / "
                    f"{item.get('provider')} / {item.get('model')}: {item.get('error')}"
                )
                for item in operations.get("recent_errors", [])[:6]
            ],
            "",
            "## Criterios do agente",
            agent_prompt.split("## Missao", maxsplit=1)[-1].strip()[:900],
        ]
    )


async def generate_report(db: AsyncSession, payload: ReportGenerateRequest) -> Report:
    start = payload.period_start or default_period_start()
    end = payload.period_end or default_period_end()
    summary = await metrics_summary(
        db,
        start=start,
        end=end,
        brand_slug=payload.brand_slug,
    )
    operations = await operations_summary(
        db,
        start=start,
        end=end,
        brand_slug=payload.brand_slug,
    )
    title = payload.title or f"Relatorio de metricas - {end.date().isoformat()}"
    raw_content = metrics_report_content(summary, payload, operations)
    normalized_content = normalize_document_content(
        title=title,
        brand_slug=payload.brand_slug or "todas",
        category="metrics",
        channel="Insights",
        content_format=payload.report_type,
        briefing="Relatorio interno de metricas, uso de IA, tokens e custo estimado.",
        content=raw_content,
        source_label="metrics_service",
    )
    report = Report(
        title=title,
        report_type=payload.report_type,
        brand_slug=payload.brand_slug,
        period_start=start,
        period_end=end,
        content=normalized_content,
        summary={**summary, "operations": operations},
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report
