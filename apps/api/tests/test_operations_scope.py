"""C1 em operações e rotas legadas (FASE 1).

Fecha os furos encontrados na auditoria: /operations/summary sem brand_slug agora
respeita o escopo (inclusive multi-marca e recent_errors); agent-health e
quality-reviews idem; content (lista legada), research/run e documents/upload
aplicam o escopo; e o PUT de brand-scope rejeita slug inexistente.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.models import AgentRun, ModelCall, Output, OutputVersion, QualityReview, User
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


def _user(scope):
    return User(
        email=f"ops-{uuid4().hex[:10]}@t.com", name="Ops",
        password_hash=hash_password("x" * 10), role="manager", is_active=True,
        brand_scope=scope,
    )


async def _scoped_headers(db, brands):
    user = _user(brands)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


async def _model_call(db, brand: str, status: str = "completed", cost: float = 0.01):
    db.add(ModelCall(
        task_type="research_generation", agent_slug="research_agent", brand_slug=brand,
        provider="openrouter", model="m", input_tokens=10, output_tokens=10,
        total_tokens=20, estimated_cost_usd=cost, latency_ms=42, status=status,
        error=f"boom-{brand}" if status == "failed" else None,
    ))
    await db.commit()


async def _output_with_review(db, brand: str) -> Output:
    run = AgentRun(agent_slug="content_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(
        brand_slug=brand, category="content", channel="Instagram", format="Post",
        title="t", briefing="b", status="review", provider="openrouter", model="m",
        agent_run_id=run.id,
    )
    db.add(output)
    await db.flush()
    version = OutputVersion(output_id=output.id, version_number=1, content="c")
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    db.add(QualityReview(
        output_id=output.id, version_id=version.id, agent_run_id=None,
        reviewer_slug="quality_guardian", status="completed", score=80, passed=True,
        summary="ok", review_mode="rules",
    ))
    await db.commit()
    await db.refresh(output)
    return output


async def test_summary_without_brand_respects_scope(client, db):
    await _model_call(db, "duofy")
    await _model_call(db, "duofy", status="failed")
    await _model_call(db, "postos")
    await _model_call(db, "postos", status="failed", cost=5.0)

    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/operations/summary", headers=headers).json()
    assert body["total_model_calls"] == 2
    assert body["failed_model_calls"] == 1
    # recent_errors não vaza a falha de 'postos'
    assert len(body["recent_errors"]) == 1
    assert all("postos" not in (e.get("error") or "") for e in body["recent_errors"])

    # usuário multi-marca restrito: agrega as DUAS marcas do escopo (e nada além)
    both = await _scoped_headers(db, ["duofy", "postos"])
    body2 = client.get("/api/operations/summary", headers=both).json()
    assert body2["total_model_calls"] == 4


async def test_summary_admin_still_sees_everything(client, auth_headers, db):
    await _model_call(db, "duofy")
    await _model_call(db, "postos")
    body = client.get("/api/operations/summary", headers=auth_headers).json()
    assert body["total_model_calls"] == 2


async def test_agent_health_respects_scope(client, db):
    await _model_call(db, "duofy")
    await _model_call(db, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/operations/agent-health", headers=headers).json()
    total = sum(item["model_calls"] for item in body)
    assert total == 1


async def test_quality_reviews_scoped_by_output_brand(client, db):
    await _output_with_review(db, "duofy")
    other = await _output_with_review(db, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/operations/quality-reviews", headers=headers).json()
    assert all(item["output_id"] != other.id for item in body)
    assert len(body) == 1


async def test_content_outputs_list_and_detail_scoped(client, db):
    mine = await _output_with_review(db, "duofy")
    other = await _output_with_review(db, "postos")
    headers = await _scoped_headers(db, ["duofy"])
    listing = client.get("/api/content/outputs", headers=headers).json()
    ids = {o["id"] for o in listing}
    assert mine.id in ids and other.id not in ids
    assert client.get(f"/api/content/outputs/{other.id}", headers=headers).status_code == 404


async def test_research_run_blocked_cross_brand(client, db, patch_ai):
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.post(
        "/api/research/run",
        json={"brand_slug": "postos", "theme": "Tema fora do escopo", "depth": "quick"},
        headers=headers,
    )
    assert resp.status_code == 404  # não gasta tokens em marca alheia


async def test_document_upload_blocked_cross_brand(client, db):
    headers = await _scoped_headers(db, ["duofy"])
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("nota.txt", b"conteudo de teste", "text/plain")},
        data={"brand_slug": "postos"},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_brand_scope_put_rejects_unknown_slug(client, auth_headers, db):
    user = _user(None)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    resp = client.put(
        f"/api/admin/users/{user.id}/brand-scope",
        json={"brand_scope": ["marca_que_nao_existe"]},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "marca_que_nao_existe" in resp.json()["detail"]
    # escopo válido continua funcionando
    ok = client.put(
        f"/api/admin/users/{user.id}/brand-scope",
        json={"brand_scope": ["duofy"]},
        headers=auth_headers,
    )
    assert ok.status_code == 200

    # e a listagem de usuários segue íntegra
    users = client.get("/api/admin/users", headers=auth_headers).json()
    assert any(u["id"] == user.id and u["brand_scope"] == ["duofy"] for u in users)


async def test_audit_events_list_scoped(client, db):
    from app.models import AuditEvent

    db.add(AuditEvent(user_id=None, user_email="a@t.com", entity_type="output", entity_id=1,
                      action="content.generated", status="success", brand_slug="duofy",
                      summary="s"))
    db.add(AuditEvent(user_id=None, user_email="a@t.com", entity_type="output", entity_id=2,
                      action="content.generated", status="success", brand_slug="postos",
                      summary="s"))
    await db.commit()
    headers = await _scoped_headers(db, ["duofy"])
    body = client.get("/api/operations/audit-events", headers=headers).json()
    brands = {e["brand_slug"] for e in body}
    assert "postos" not in brands
