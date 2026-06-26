from __future__ import annotations

from app import export_service


def build_duofy_pdf(
    *,
    title: str,
    subtitle: str,
    metadata: list[tuple[str, str]],
    content: str,
) -> bytes:
    return export_service.build_duofy_pdf(
        export_service.ExportDocument(
            title=title,
            subtitle=subtitle,
            metadata=metadata,
            content=content,
            filename_prefix=title,
        )
    )
