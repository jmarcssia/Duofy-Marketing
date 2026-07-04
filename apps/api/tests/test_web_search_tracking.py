"""V5 — chamadas de web-search são rastreadas em ModelCall (custo/tokens/latência).

Antes, `_openrouter_web_search` usava httpx cru e não registrava nada; o custo
dessa etapa ficava invisível nos relatórios.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import ModelCall
from app.research_service import _openrouter_web_search

pytestmark = pytest.mark.anyio


class _FakeResp:
    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return {
            "usage": {"prompt_tokens": 30, "completion_tokens": 90, "total_tokens": 120},
            "choices": [
                {
                    "message": {
                        "annotations": [
                            {"url_citation": {"url": "https://example.com", "title": "Ex"}}
                        ]
                    }
                }
            ],
        }


class _FakeClient:
    async def post(self, *args, **kwargs) -> _FakeResp:
        return _FakeResp()


class _BoomClient:
    async def post(self, *args, **kwargs):
        raise RuntimeError("rede indisponível")


async def test_web_search_records_model_call(db) -> None:
    annotations = await _openrouter_web_search(
        _FakeClient(),
        "https://openrouter.ai/api/v1",
        "sk-x",
        "google/gemini-2.5-pro",
        "energia solar",
        brand_slug="duofy",
    )
    assert annotations  # as anotações foram retornadas normalmente
    calls = (
        await db.execute(select(ModelCall).where(ModelCall.task_type == "web_search"))
    ).scalars().all()
    assert len(calls) == 1
    assert calls[0].provider == "openrouter"
    assert calls[0].brand_slug == "duofy"
    assert calls[0].total_tokens == 120
    assert calls[0].status == "completed"


async def test_web_search_records_failed_call_best_effort(db) -> None:
    annotations = await _openrouter_web_search(
        _BoomClient(),
        "https://openrouter.ai/api/v1",
        "sk-x",
        "google/gemini-2.5-pro",
        "energia solar",
        brand_slug="duofy",
    )
    assert annotations == []  # falha não derruba a coleta
    calls = (
        await db.execute(select(ModelCall).where(ModelCall.task_type == "web_search"))
    ).scalars().all()
    assert len(calls) == 1
    assert calls[0].status == "failed"
