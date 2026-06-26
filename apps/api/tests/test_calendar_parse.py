from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.calendar_service import _extract_json_array, _parse_datetime
from app.llm import LLMConfigurationError

FALLBACK = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


def test_extract_json_array_raises_domain_error_on_invalid_json() -> None:
    bad = "Claro! Aqui estao os eventos: [ {titulo: sem aspas,, ] abraco"
    with pytest.raises(LLMConfigurationError):
        _extract_json_array(bad)


def test_extract_json_array_raises_domain_error_when_not_a_list() -> None:
    with pytest.raises(LLMConfigurationError):
        _extract_json_array('{"titulo": "evento unico"}')


def test_extract_json_array_parses_valid_array() -> None:
    text = '```json\n[{"title": "Post A"}, {"title": "Post B"}]\n```'
    result = _extract_json_array(text)
    assert [item["title"] for item in result] == ["Post A", "Post B"]


def test_parse_datetime_returns_fallback_on_bad_string() -> None:
    assert _parse_datetime("amanha de manha", FALLBACK) == FALLBACK


def test_parse_datetime_parses_iso() -> None:
    parsed = _parse_datetime("2026-07-15T14:30:00Z", FALLBACK)
    assert parsed.year == 2026 and parsed.month == 7 and parsed.day == 15
