"""Geração de feed iCalendar (.ics) do calendário editorial.

Formato padrão RFC 5545, compatível com Google Agenda e Outlook (importar/assinar).
Sem dependências externas — o iCal é texto simples e bem definido.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models import CalendarEvent

_STATUS_MAP = {
    "planned": "TENTATIVE",
    "scheduled": "CONFIRMED",
    "in_progress": "CONFIRMED",
    "completed": "CONFIRMED",
    "failed": "CONFIRMED",
    "cancelled": "CANCELLED",
}


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _fmt(value: datetime) -> str:
    return _to_utc(value).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """Dobra linhas em 75 octetos (RFC 5545) com continuação por espaço."""
    if len(line) <= 75:
        return line
    chunks = [line[:75]]
    rest = line[75:]
    while rest:
        chunks.append(" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(chunks)


def _vevent(event: CalendarEvent, now: datetime) -> list[str]:
    start = event.start_at
    end = event.end_at or (start + timedelta(hours=1))
    summary = event.title or "Evento Duofy"
    desc_parts = []
    if event.description:
        desc_parts.append(event.description)
    meta = " · ".join(
        p for p in [event.channel, event.format, event.category] if p
    )
    if meta:
        desc_parts.append(meta)
    desc_parts.append("Origem: Duofy (calendário editorial)")
    description = "\n".join(desc_parts)

    lines = [
        "BEGIN:VEVENT",
        f"UID:duofy-calendar-{event.id}@duofy",
        f"DTSTAMP:{_fmt(now)}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        _fold(f"SUMMARY:{_escape(summary)}"),
        _fold(f"DESCRIPTION:{_escape(description)}"),
        f"STATUS:{_STATUS_MAP.get(event.status, 'CONFIRMED')}",
    ]
    if event.category:
        lines.append(_fold(f"CATEGORIES:{_escape(event.category)}"))
    lines.append("END:VEVENT")
    return lines


def build_ics(events: list[CalendarEvent], calendar_name: str, now: datetime | None = None) -> str:
    """Monta um documento VCALENDAR com os eventos informados."""
    stamp = _to_utc(now) if now else datetime.now(UTC)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Duofy//Calendario Editorial//PT-BR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        _fold(f"X-WR-CALNAME:{_escape(calendar_name)}"),
        "X-WR-TIMEZONE:UTC",
    ]
    for event in events:
        lines.extend(_vevent(event, stamp))
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
