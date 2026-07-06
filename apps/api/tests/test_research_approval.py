"""Aprovação de relatório de pesquisa direto do rascunho.

Regressão: a pesquisa nasce 'draft' e a página do Agente de Pesquisa só oferece
Aprovar/Solicitar ajustes (não há estado 'review' para pesquisa). O approve precisa
aceitar um relatório de pesquisa em draft — mas o Guardião de Qualidade continua sendo
o portão. Conteúdo comum segue exigindo 'review' (invariante preservada).
"""

from __future__ import annotations

import pytest

from app.models import AgentRun, Output, OutputVersion, QualityReview, User
from app.security import create_access_token, hash_password

pytestmark = pytest.mark.anyio


async def _draft_output(db, *, channel: str, fmt: str) -> Output:
    run = AgentRun(agent_slug="research_agent", provider="openrouter", model="m",
                   prompt="p", output="o", status="completed")
    db.add(run)
    await db.flush()
    output = Output(
        brand_slug="duofy", category="research", channel=channel, format=fmt,
        title="Relatório", briefing="b", status="draft", provider="openrouter",
        model="m", agent_run_id=run.id,
    )
    db.add(output)
    await db.flush()
    version = OutputVersion(output_id=output.id, version_number=1, content="conteudo")
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    await db.commit()
    await db.refresh(output)
    return output


async def _pass_quality(db, output: Output) -> None:
    """Cria uma revisão de qualidade aprovada da versão atual (portão do approve)."""
    db.add(QualityReview(
        output_id=output.id, version_id=output.current_version_id, agent_run_id=None,
        reviewer_slug="quality_guardian", status="approved", score=95, passed=True,
        summary="ok", review_mode="rules",
    ))
    await db.commit()


async def _admin_headers(db) -> dict:
    from sqlalchemy import select

    admin = (await db.execute(select(User).where(User.role == "admin"))).scalars().first()
    if admin is None:
        admin = User(email="ap@t.com", name="A", password_hash=hash_password("x" * 10),
                     role="admin", is_active=True)
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin)}"}


async def test_research_report_approvable_from_draft(client, db, patch_ai):
    output = await _draft_output(db, channel="Pesquisa", fmt="research_report")
    await _pass_quality(db, output)
    headers = await _admin_headers(db)
    resp = client.post(f"/api/outputs/{output.id}/approve", json={}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"


async def test_research_report_still_gated_by_quality_guardian(client, db, patch_ai):
    """Aprovar do draft NÃO ignora o Guardião: revisão com nota baixa bloqueia mesmo do draft."""
    output = await _draft_output(db, channel="Pesquisa", fmt="research_report")
    # revisão reprovada (nota < 80) da versão atual -> ensure_quality_passed a encontra e bloqueia
    db.add(QualityReview(
        output_id=output.id, version_id=output.current_version_id, agent_run_id=None,
        reviewer_slug="quality_guardian", status="needs_adjustment", score=40, passed=False,
        summary="reprovado", review_mode="rules", critical_failures=["sem fonte"],
    ))
    await db.commit()
    headers = await _admin_headers(db)
    resp = client.post(f"/api/outputs/{output.id}/approve", json={}, headers=headers)
    assert resp.status_code >= 400  # nota baixa bloqueia


async def test_research_gate_score_governs_not_hard_critical(db, patch_ai):
    """Item 1: relatório de pesquisa com nota >= 80 aprova mesmo com 'critical' do LLM
    (o critical vira ajuste recomendado); conteúdo mantém o gate estrito."""
    from app.quality_guardian import MINIMUM_SCORE, _relax_research_gate
    from app.schemas import QualityReviewRead  # noqa: F401 (garante import estável)

    class _Out:
        channel = "Pesquisa"
        format = "research_report"

    class _Content:
        channel = "Instagram"
        format = "Carrossel"

    base = QualityAssessment_like(score=85, critical=["afirmação sem fonte"])
    relaxed = _relax_research_gate(_Out(), base)
    assert relaxed.passed is True
    assert relaxed.critical_failures == []
    assert "afirmação sem fonte" in relaxed.required_fixes
    assert relaxed.score >= MINIMUM_SCORE

    # pesquisa com nota baixa continua reprovada
    low = _relax_research_gate(_Out(), QualityAssessment_like(score=60, critical=["x"]))
    assert low.passed is False

    # conteúdo comum: o helper não mexe (gate estrito preservado no fluxo real)
    content = _relax_research_gate(_Content(), QualityAssessment_like(score=85, critical=["y"]))
    assert content.critical_failures == ["y"]  # inalterado


def QualityAssessment_like(*, score: int, critical: list[str]):
    from app.quality_guardian import QualityAssessment

    return QualityAssessment(
        score=score, status="blocked", passed=False, summary="s",
        critical_failures=list(critical), required_fixes=[], optional_improvements=[],
        verified_sources=[], raw_report="",
    )


async def test_draft_content_still_not_approvable_directly(client, db, patch_ai):
    """Conteúdo comum em draft continua exigindo 'review' (invariante preservada)."""
    output = await _draft_output(db, channel="Instagram", fmt="Carrossel")
    await _pass_quality(db, output)
    headers = await _admin_headers(db)
    resp = client.post(f"/api/outputs/{output.id}/approve", json={}, headers=headers)
    assert resp.status_code >= 400, "conteúdo em draft não deve ser aprovável direto"
