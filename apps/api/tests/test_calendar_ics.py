from datetime import UTC, datetime

from app.calendar_ics import build_ics
from app.models import CalendarEvent


def _event(**kw) -> CalendarEvent:
    base = dict(
        id=1,
        brand_slug="duofy_solucoes",
        category="content",
        title="Post de lançamento",
        description="Descrição do evento",
        event_type="content",
        status="scheduled",
        channel="Instagram",
        format="Carrossel",
        start_at=datetime(2026, 5, 15, 14, 0, 0, tzinfo=UTC),
        end_at=datetime(2026, 5, 15, 15, 0, 0, tzinfo=UTC),
        assigned_agent_slug=None,
        execution_payload=None,
        output_id=None,
        agent_run_id=None,
        last_error=None,
    )
    base.update(kw)
    return CalendarEvent(**base)


NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def test_ics_has_valid_envelope_and_event():
    ics = build_ics([_event()], "Duofy — Teste", now=NOW)
    assert ics.startswith("BEGIN:VCALENDAR")
    assert "VERSION:2.0" in ics
    assert ics.rstrip().endswith("END:VCALENDAR")
    assert "BEGIN:VEVENT" in ics and "END:VEVENT" in ics
    assert "UID:duofy-calendar-1@duofy" in ics
    assert "DTSTART:20260515T140000Z" in ics
    assert "DTEND:20260515T150000Z" in ics
    assert "SUMMARY:Post de lançamento" in ics
    assert "STATUS:CONFIRMED" in ics


def test_ics_uses_crlf_line_endings():
    ics = build_ics([_event()], "x", now=NOW)
    assert "\r\n" in ics


def test_ics_escapes_special_chars():
    ics = build_ics([_event(title="A, B; C")], "x", now=NOW)
    assert "SUMMARY:A\\, B\\; C" in ics


def test_ics_defaults_end_to_start_plus_hour():
    ics = build_ics([_event(end_at=None)], "x", now=NOW)
    assert "DTSTART:20260515T140000Z" in ics
    assert "DTEND:20260515T150000Z" in ics


def test_cancelled_status_maps():
    ics = build_ics([_event(status="cancelled")], "x", now=NOW)
    assert "STATUS:CANCELLED" in ics


def test_naive_datetime_treated_as_utc():
    ics = build_ics([_event(start_at=datetime(2026, 5, 15, 14, 0, 0))], "x", now=NOW)
    assert "DTSTART:20260515T140000Z" in ics
