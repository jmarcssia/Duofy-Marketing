"""Importa a base normalizada do calendário (docs/calendario_base/calendario_base.json)
para o banco: eventos → CalendarEvent; temas → ContentTheme; roteiros → ContentScript.

Idempotente:
- Eventos: marcados com execution_payload["import_batch"]; ao reimportar, os do mesmo
  batch são apagados e reinseridos (não toca eventos criados manualmente).
- Temas/Roteiros: dedupe por título (pula se já existe) — não destrói entradas manuais.

Uso: `python -m app.import_calendar [caminho_do_json]`
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, text

from app.db import AsyncSessionLocal
from app.models import CalendarEvent, ContentScript, ContentTheme

IMPORT_BATCH = "calendario_xlsx_v1"
DEFAULT_BASE = (
    Path(__file__).resolve().parents[3] / "docs" / "calendario_base" / "calendario_base.json"
)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


async def import_base(session, base: dict) -> dict:
    summary = {"events_inserted": 0, "events_skipped_nodate": 0,
               "themes_inserted": 0, "themes_skipped": 0,
               "scripts_inserted": 0, "scripts_skipped": 0}

    # ── Eventos (delete+reinsert do batch) ──
    await session.execute(
        text("DELETE FROM calendar_events WHERE execution_payload->>'import_batch' = :b"),
        {"b": IMPORT_BATCH},
    )
    for ev in base.get("events", []):
        start = _parse_dt(ev.get("start_at"))
        if start is None:
            summary["events_skipped_nodate"] += 1
            continue
        payload = dict(ev.get("execution_payload") or {})
        payload["import_batch"] = IMPORT_BATCH
        session.add(CalendarEvent(
            brand_slug=ev["brand_slug"],
            category=ev.get("category") or "content",
            title=ev["title"],
            description=ev.get("description") or "",
            event_type=ev.get("event_type") or "content",
            status=ev.get("status") or "planned",
            channel=ev.get("channel"),
            format=ev.get("format"),
            start_at=start,
            execution_payload=payload,
        ))
        summary["events_inserted"] += 1

    # ── Temas (dedupe por título) ──
    existing_themes = set(
        (await session.execute(select(ContentTheme.title))).scalars().all()
    )
    for t in base.get("themes", []):
        title = (t.get("title") or "").strip()
        if not title or title in existing_themes:
            summary["themes_skipped"] += 1
            continue
        existing_themes.add(title)
        session.add(ContentTheme(
            title=title[:255],
            theme=t.get("theme") or "",
            brand_slug=t.get("brand_slug"),
            audience=(t.get("audience") or None),
            kind=(t.get("kind") or None),
            owner=(t.get("owner") or None),
            status=(t.get("status") or None),
        ))
        summary["themes_inserted"] += 1

    # ── Roteiros (dedupe por título) ──
    existing_scripts = set(
        (await session.execute(select(ContentScript.title))).scalars().all()
    )
    for r in base.get("roteiros", []):
        title = (r.get("title") or "").strip()
        if not title or title in existing_scripts:
            summary["scripts_skipped"] += 1
            continue
        existing_scripts.add(title)
        session.add(ContentScript(
            title=title[:255],
            brand_slug=r.get("brand_slug"),
            recording_status=(r.get("recording_status") or None),
            script=r.get("script") or "",
            scenes=(r.get("scenes") or None),
            lettering=(r.get("lettering") or None),
            caption=(r.get("caption") or None),
            status=(r.get("status") or None),
        ))
        summary["scripts_inserted"] += 1

    await session.commit()
    return summary


async def main(path: str | None = None) -> dict:
    base_path = Path(path) if path else DEFAULT_BASE
    with open(base_path, encoding="utf-8") as f:
        base = json.load(f)
    async with AsyncSessionLocal() as session:
        summary = await import_base(session, base)
    print("Import concluído:", summary)
    return summary


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
