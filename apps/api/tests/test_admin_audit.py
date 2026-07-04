"""V1 — ações admin sensíveis gravam audit_event (sem vazar segredos).

quality-settings, agent-settings e providers passam a deixar trilha de auditoria,
como já ocorre com brand-scope. A chave de provedor NUNCA aparece na trilha.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEvent

pytestmark = pytest.mark.anyio


async def test_update_quality_settings_records_audit(client, auth_headers, db) -> None:
    resp = client.put(
        "/api/admin/quality-settings",
        json={"review_mode": "hybrid", "provider": "openrouter", "model": "gpt-4o-mini"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    events = (
        await db.execute(
            select(AuditEvent).where(AuditEvent.action == "admin.quality_settings_updated")
        )
    ).scalars().all()
    assert len(events) == 1
    assert events[0].user_email  # autoria registrada


async def test_update_agent_settings_records_audit(client, auth_headers, db) -> None:
    resp = client.put(
        "/api/admin/agent-settings",
        json={
            "token_budgets": {"research_agent": 8000},
            "research_depth": {"deep": {"sources": 20, "excerpt": 5000}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    events = (
        await db.execute(
            select(AuditEvent).where(AuditEvent.action == "admin.agent_settings_updated")
        )
    ).scalars().all()
    assert len(events) == 1


async def test_upsert_provider_records_audit_without_leaking_secret(
    client, auth_headers, db
) -> None:
    secret = "sk-super-secret-value-123456"
    # 'apify' é opt-in e fica desabilitado — não interfere na resolução de LLM dos testes.
    resp = client.put(
        "/api/admin/providers/apify",
        json={
            "provider": "apify",
            "display_name": "Apify (teste auditoria)",
            "base_url": None,
            "default_model": "gpt-4o-mini",
            "is_enabled": False,
            "api_key": secret,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    events = (
        await db.execute(
            select(AuditEvent).where(AuditEvent.action == "admin.provider_updated")
        )
    ).scalars().all()
    assert len(events) == 1
    # a chave em claro nunca pode aparecer na trilha (summary ou metadata)
    blob = (events[0].summary or "") + str(events[0].metadata_json or {})
    assert secret not in blob
    assert "sk-super-secret" not in blob
