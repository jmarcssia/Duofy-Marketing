from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user
from app.export_service import ExportDocument, ExportResult, export_document
from app.metrics_service import generate_report
from app.models import Report, User
from app.schemas import ReportGenerateRequest, ReportRead

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_read(report: Report) -> ReportRead:
    return ReportRead(
        id=report.id,
        title=report.title,
        report_type=report.report_type,
        brand_slug=report.brand_slug,
        period_start=report.period_start,
        period_end=report.period_end,
        content=report.content,
        summary=report.summary,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


async def _get_report_or_404(db: AsyncSession, report_id: int) -> Report:
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Relatorio nao encontrado.",
        )
    return report


def _export_response(exported: ExportResult) -> Response:
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
    )


def _report_export_document(report: Report) -> ExportDocument:
    return ExportDocument(
        title=report.title,
        subtitle="Relatorio interno Duofy",
        metadata=[
            ("Tipo", report.report_type),
            ("Marca", report.brand_slug or "Todas"),
            ("Criado em", report.created_at.isoformat()),
        ],
        content=report.content,
        filename_prefix=f"duofy-report-{report.id}",
    )


@router.get("", response_model=list[ReportRead])
async def list_reports(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    report_type: str | None = None,
    brand_slug: str | None = None,
) -> list[ReportRead]:
    statement = select(Report)
    if report_type:
        statement = statement.where(Report.report_type == report_type)
    if brand_slug:
        statement = statement.where(Report.brand_slug == brand_slug)
    statement = statement.order_by(Report.created_at.desc()).limit(100)
    result = await db.execute(statement)
    return [_report_read(report) for report in result.scalars().all()]


@router.post("/generate", response_model=ReportRead)
async def generate_report_endpoint(
    payload: ReportGenerateRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportRead:
    report = await generate_report(db, payload)
    return _report_read(report)


@router.get("/{report_id}", response_model=ReportRead)
async def get_report(
    report_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportRead:
    return _report_read(await _get_report_or_404(db, report_id))


@router.get("/{report_id}/pdf")
async def export_report_pdf(
    report_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    return await export_report(report_id, _current_user, db, "pdf")


@router.get("/{report_id}/export")
async def export_report(
    report_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: Annotated[str, Query(pattern="^(pdf|docx|md|html)$")] = "pdf",
) -> Response:
    report = await _get_report_or_404(db, report_id)
    return _export_response(export_document(_report_export_document(report), format))
