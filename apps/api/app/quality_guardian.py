from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from typing import Literal
from unicodedata import combining, normalize

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import brand_voice_section, read_agent_prompt, read_config_text
from app.agent_limits import get_token_budget
from app.llm import LLMConfigurationError, LLMResult, call_llm, provider_for_model
from app.models import (
    Agent,
    AgentRun,
    Output,
    OutputVersion,
    ProviderCredential,
    QualityReview,
)
from app.output_workflow import OutputWorkflowError, current_version
from app.rules_validation import validate_document
from app.settings_store import _setting_value
from app.text_repair import has_mojibake, repair_text

MINIMUM_SCORE = 80
REVIEWER_SLUG = "quality_guardian"
QUALITY_REVIEW_MODE_KEY = "quality_review_mode"
QUALITY_REVIEW_PROVIDER_KEY = "quality_review_provider"
QUALITY_REVIEW_MODEL_KEY = "quality_review_model"
ReviewMode = Literal["local_only", "hybrid", "llm_required"]


@dataclass(frozen=True)
class QualityAssessment:
    score: int
    status: str
    passed: bool
    summary: str
    critical_failures: list[str]
    required_fixes: list[str]
    optional_improvements: list[str]
    verified_sources: list[str]
    raw_report: str
    review_mode: str = "local_only"
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_error: str | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class LLMQualityAssessment:
    score: int
    status: str
    summary: str
    critical_failures: list[str]
    required_fixes: list[str]
    optional_improvements: list[str]
    verified_sources: list[str]
    confidence: float
    raw_report: str


def _plain_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def _has_any(text: str, markers: list[str]) -> bool:
    normalized = _plain_text(text)
    return any(marker in normalized for marker in markers)


def _append_issue(
    issues: list[str],
    message: str,
    *,
    penalty: int,
    penalties: list[int],
) -> None:
    issues.append(message)
    penalties.append(penalty)


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = repair_text(str(item)).strip()
        if not cleaned:
            continue
        key = _plain_text(cleaned)
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def _clamp_score(value: object, default: int) -> int:
    try:
        score = int(value)
    except (TypeError, ValueError):
        return default
    return max(0, min(100, score))


def _clamp_confidence(value: object) -> float | None:
    if value is None:
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(1.0, confidence))


def assess_output_quality(output: Output, version: OutputVersion) -> QualityAssessment:
    content = repair_text(version.content or "")
    normalized = _plain_text(content)
    critical: list[str] = []
    required: list[str] = []
    optional: list[str] = []
    verified_sources: list[str] = []
    penalties: list[int] = []

    if has_mojibake(content):
        _append_issue(
            critical,
            "Texto contém sinais de encoding quebrado/mojibake.",
            penalty=30,
            penalties=penalties,
        )
    if _has_any(content, ["[preencher]", "lorem ipsum", "secao a completar"]):
        _append_issue(
            critical,
            "Conteúdo contém placeholder editorial.",
            penalty=30,
            penalties=penalties,
        )
    if len(content.strip()) < 280:
        _append_issue(
            required,
            "Conteúdo curto demais para revisão profissional.",
            penalty=18,
            penalties=penalties,
        )
    if "## " not in content:
        _append_issue(
            required,
            "Documento sem seções Markdown estruturadas.",
            penalty=14,
            penalties=penalties,
        )
    if output.channel.lower() != "pesquisa" and "cta" not in normalized:
        _append_issue(
            required,
            "CTA não identificado no conteúdo.",
            penalty=8,
            penalties=penalties,
        )
    if "fonte" in normalized or "evidencia" in normalized or "http" in normalized:
        verified_sources.append("Referências ou evidências declaradas no conteúdo.")
    elif output.channel.lower() == "pesquisa":
        _append_issue(
            critical,
            "Relatório de pesquisa sem fontes/evidências declaradas.",
            penalty=30,
            penalties=penalties,
        )
    else:
        optional.append("Adicionar fontes ou memória usada quando houver afirmações factuais.")

    if output.brand_slug == "deathcare" and _has_any(
        content,
        ["postos de combustiveis", "pista", "bomba de combustivel", "loja de conveniencia"],
    ):
        _append_issue(
            critical,
            "Possível mistura indevida entre DeathCare e Postos.",
            penalty=35,
            penalties=penalties,
        )
    if output.brand_slug == "postos_combustiveis" and _has_any(
        content,
        ["funeraria", "funerario", "cemiterio", "crematorio", "plano funerario"],
    ):
        _append_issue(
            critical,
            "Possível mistura indevida entre Postos e DeathCare.",
            penalty=35,
            penalties=penalties,
        )
    if output.brand_slug == "deathcare" and _has_any(
        content,
        ["explorar o luto", "medo da morte", "aproveitar o luto"],
    ):
        _append_issue(
            critical,
            "Tom sensível inadequado para DeathCare.",
            penalty=40,
            penalties=penalties,
        )
    if "%" in content and not (
        "fonte" in normalized or "evidencia" in normalized or "http" in normalized
    ):
        _append_issue(
            required,
            "Percentual ou dado numérico aparece sem fonte/evidência explícita.",
            penalty=12,
            penalties=penalties,
        )

    if (
        "direcao visual" not in normalized
        and output.channel.lower() not in {"pesquisa", "insights"}
    ):
        optional.append("Incluir direção visual para orientar produção criativa.")
    if "persona" not in normalized and output.channel.lower() != "pesquisa":
        optional.append("Deixar persona mais explícita.")

    _agent_slug = "research_agent" if output.channel == "Pesquisa" else "content_agent"
    for _violation in validate_document(content, _agent_slug, channel=output.channel):
        if _violation["severity"] == "critical":
            _append_issue(
                critical,
                _violation["message"],
                penalty=30,
                penalties=penalties,
            )
        else:
            _append_issue(
                required,
                _violation["message"],
                penalty=10,
                penalties=penalties,
            )

    score = max(0, 100 - sum(penalties))
    passed = score >= MINIMUM_SCORE and not critical
    status = "approved" if passed else ("blocked" if critical else "needs_adjustment")
    summary = (
        "Revisão aprovada pelo Guardião local."
        if passed
        else "Revisão exige ajustes antes da aprovação humana."
    )
    raw_report = "\n".join(
        [
            "Modo: local_only",
            f"Score local: {score}/100",
            f"Status: {status}",
            f"Falhas críticas: {len(critical)}",
            f"Correções obrigatórias: {len(required)}",
            f"Melhorias opcionais: {len(optional)}",
        ]
    )
    return QualityAssessment(
        score=score,
        status=status,
        passed=passed,
        summary=summary,
        critical_failures=critical,
        required_fixes=required,
        optional_improvements=optional,
        verified_sources=verified_sources,
        raw_report=raw_report,
    )


async def _quality_settings(db: AsyncSession) -> tuple[ReviewMode, str | None, str | None]:
    mode = await _setting_value(db, QUALITY_REVIEW_MODE_KEY)
    provider = await _setting_value(db, QUALITY_REVIEW_PROVIDER_KEY)
    model = await _setting_value(db, QUALITY_REVIEW_MODEL_KEY)
    if mode not in {"local_only", "hybrid", "llm_required"}:
        mode = "hybrid"
    return mode, provider or None, model or None


async def _quality_agent(db: AsyncSession) -> Agent | None:
    result = await db.execute(select(Agent).where(Agent.slug == REVIEWER_SLUG))
    return result.scalar_one_or_none()


async def _quality_credential(
    db: AsyncSession,
    output: Output,
    configured_provider: str | None,
    configured_model: str | None,
    agent: Agent | None,
) -> tuple[ProviderCredential, str]:
    model = configured_model or (agent.default_model if agent else None) or output.model
    provider = configured_provider or provider_for_model(model) or output.provider
    result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} para revisão LLM."
        )
    return credential, model


def _strip_json_fence(value: str) -> str:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first >= 0 and last >= first:
        return cleaned[first : last + 1]
    return cleaned


def _list_field(data: dict, key: str) -> list[str]:
    value = data.get(key)
    if isinstance(value, list):
        return _unique([str(item) for item in value])
    if isinstance(value, str) and value.strip():
        return [repair_text(value.strip())]
    return []


def _parse_llm_assessment(result: LLMResult) -> LLMQualityAssessment:
    data = json.loads(_strip_json_fence(result.output))
    score = _clamp_score(data.get("score"), 0)
    critical = _list_field(data, "critical_failures")
    required = _list_field(data, "required_fixes")
    optional = _list_field(data, "optional_improvements")
    verified = _list_field(data, "verified_sources")
    confidence = _clamp_confidence(data.get("confidence"))
    status = repair_text(str(data.get("status") or "")).strip().lower()
    if status not in {"approved", "needs_adjustment", "blocked"}:
        status = "approved" if score >= MINIMUM_SCORE and not critical else "needs_adjustment"
    summary = repair_text(str(data.get("summary") or "Revisão LLM concluída.")).strip()
    return LLMQualityAssessment(
        score=score,
        status=status,
        summary=summary,
        critical_failures=critical,
        required_fixes=required,
        optional_improvements=optional,
        verified_sources=verified,
        confidence=confidence if confidence is not None else 0.6,
        raw_report=result.output,
    )


def _llm_user_prompt(output: Output, version: OutputVersion, local: QualityAssessment) -> str:
    contract = read_config_text("templates", "quality_review_contract.md")
    content = repair_text(version.content or "")
    if len(content) > 18000:
        content = f"{content[:18000]}\n\n[CONTEUDO TRUNCADO PARA REVISAO]"
    return "\n".join(
        [
            "Revise a entrega abaixo como Guardião de Qualidade Duofy.",
            "Responda somente com JSON válido no contrato informado.",
            "",
            "Contrato obrigatório:",
            contract,
            "",
            "Metadados da entrega:",
            f"- Output ID: {output.id}",
            f"- Marca: {output.brand_slug}",
            f"- Categoria: {output.category}",
            f"- Canal: {output.channel}",
            f"- Formato: {output.format}",
            f"- Status atual: {output.status}",
            f"- Versão: {version.version_number}",
            "",
            "Resultado da validação local soberana:",
            local.raw_report,
            "",
            "Conteúdo para revisão:",
            content,
        ]
    )


def _merge_assessments(
    local: QualityAssessment,
    llm: LLMQualityAssessment | None,
    *,
    mode: ReviewMode,
    llm_provider: str | None,
    llm_model: str | None,
    llm_error: str | None,
) -> QualityAssessment:
    if mode == "llm_required" and llm is None:
        critical = _unique(local.critical_failures + ["Revisão LLM obrigatória não executada."])
        raw_report = "\n\n".join(
            [local.raw_report, f"Erro LLM: {llm_error or 'sem retorno do provedor'}"]
        )
        return QualityAssessment(
            score=0,
            status="blocked",
            passed=False,
            summary="Guardião bloqueou porque a revisão LLM obrigatória falhou.",
            critical_failures=critical,
            required_fixes=local.required_fixes,
            optional_improvements=local.optional_improvements,
            verified_sources=local.verified_sources,
            raw_report=raw_report,
            review_mode=mode,
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_error=llm_error,
            confidence=0.0,
        )

    if llm is None:
        return QualityAssessment(
            **{
                **local.__dict__,
                "review_mode": mode,
                "llm_provider": llm_provider,
                "llm_model": llm_model,
                "llm_error": llm_error,
            }
        )

    critical = _unique(local.critical_failures + llm.critical_failures)
    required = _unique(local.required_fixes + llm.required_fixes)
    optional = _unique(local.optional_improvements + llm.optional_improvements)
    verified = _unique(local.verified_sources + llm.verified_sources)
    score = min(local.score, llm.score)
    passed = score >= MINIMUM_SCORE and not critical and llm.status == "approved"
    status = "approved" if passed else ("blocked" if critical else "needs_adjustment")
    summary = (
        "Revisão híbrida aprovada pelo Guardião."
        if passed
        else "Revisão híbrida exige ajustes antes da aprovação humana."
    )
    raw_report = "\n\n".join(
        [
            f"Modo: {mode}",
            local.raw_report,
            f"Score LLM: {llm.score}/100",
            f"Confiança LLM: {llm.confidence:.2f}",
            f"Resumo LLM: {llm.summary}",
            "Relatório bruto LLM:",
            llm.raw_report,
        ]
    )
    return QualityAssessment(
        score=score,
        status=status,
        passed=passed,
        summary=summary,
        critical_failures=critical,
        required_fixes=required,
        optional_improvements=optional,
        verified_sources=verified,
        raw_report=raw_report,
        review_mode=mode,
        llm_provider=llm_provider,
        llm_model=llm_model,
        llm_error=llm_error,
        confidence=llm.confidence,
    )


async def assess_output_quality_hybrid(
    db: AsyncSession,
    output: Output,
    version: OutputVersion,
    *,
    mode_override: ReviewMode | None = None,
) -> QualityAssessment:
    local = assess_output_quality(output, version)
    configured_mode, configured_provider, configured_model = await _quality_settings(db)
    mode: ReviewMode = mode_override or configured_mode
    if mode == "local_only":
        return QualityAssessment(**{**local.__dict__, "review_mode": "local_only"})

    agent = await _quality_agent(db)
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_error: str | None = None
    llm_assessment: LLMQualityAssessment | None = None
    try:
        credential, model = await _quality_credential(
            db,
            output,
            configured_provider,
            configured_model,
            agent,
        )
        llm_provider = credential.provider
        llm_model = model
        budget = await get_token_budget(db, "quality_guardian")
        llm_result = await call_llm(
            credential=credential,
            model=model,
            system_prompt=read_agent_prompt(REVIEWER_SLUG) + brand_voice_section(output.brand_slug),
            user_prompt=_llm_user_prompt(output, version, local),
            task_type="quality_review",
            task_id=output.id,
            agent_slug=REVIEWER_SLUG,
            brand_slug=output.brand_slug,
            max_tokens=budget,
        )
        llm_provider = llm_result.provider
        llm_model = llm_result.model
        llm_assessment = _parse_llm_assessment(llm_result)
    except Exception as exc:
        llm_error = repair_text(str(exc))

    return _merge_assessments(
        local,
        llm_assessment,
        mode=mode,
        llm_provider=llm_provider,
        llm_model=llm_model,
        llm_error=llm_error,
    )


async def latest_quality_review(
    db: AsyncSession,
    output_id: int,
    version_id: int | None = None,
) -> QualityReview | None:
    statement = select(QualityReview).where(QualityReview.output_id == output_id)
    if version_id is not None:
        statement = statement.where(QualityReview.version_id == version_id)
    result = await db.execute(statement.order_by(QualityReview.created_at.desc()))
    return result.scalars().first()


def _relax_research_gate(output: Output, assessment: QualityAssessment) -> QualityAssessment:
    """Relatórios de pesquisa: a NOTA (>= MINIMUM_SCORE) governa a aprovação.

    Um relatório de pesquisa é revisado e aprovado por um humano; o score já agrega todas as
    penalidades (fontes ausentes, citação [n] faltando, sensibilidade DeathCare, mojibake…).
    Um 'critical' isolado do LLM (ex.: uma afirmação específica sem fonte) não deve BLOQUEAR
    de forma dura uma pesquisa que pontuou >= 80 — vira 'ajuste recomendado' para o revisor.
    Pesquisa fraca ainda reprova pela nota (as penalidades derrubam o score abaixo de 80).
    Conteúdo comum mantém o gate estrito (critical bloqueia).
    """
    is_research = output.channel == "Pesquisa" and output.format == "research_report"
    if not is_research:
        return assessment
    passed = assessment.score >= MINIMUM_SCORE
    required = _unique(assessment.required_fixes + assessment.critical_failures)
    return replace(
        assessment,
        passed=passed,
        status="approved" if passed else "needs_adjustment",
        critical_failures=[],
        required_fixes=required,
        summary=(
            f"Revisão de pesquisa aprovada pelo Guardião (nota {assessment.score}/100)."
            if passed
            else assessment.summary
        ),
    )


async def review_output_quality(
    db: AsyncSession,
    output: Output,
    *,
    force: bool = False,
    mode: ReviewMode | None = None,
) -> QualityReview:
    version = await current_version(db, output)
    if version is None:
        raise OutputWorkflowError("Output sem versão atual para revisão de qualidade.")

    if not force:
        existing = await latest_quality_review(db, output.id, version.id)
        if existing is not None:
            return existing

    assessment = await assess_output_quality_hybrid(db, output, version, mode_override=mode)
    assessment = _relax_research_gate(output, assessment)
    agent_run_id: int | None = None
    agent = await _quality_agent(db)
    if agent is not None:
        run = AgentRun(
            agent_slug=REVIEWER_SLUG,
            provider=assessment.llm_provider or "local",
            model=assessment.llm_model or "deterministic-rubric-v1",
            prompt=f"Revisar output #{output.id}, versão #{version.version_number}.",
            output=assessment.raw_report,
            status="completed" if assessment.llm_error is None else "needs_adjustment",
            error=assessment.llm_error,
        )
        db.add(run)
        await db.flush()
        agent_run_id = run.id

    review = QualityReview(
        output_id=output.id,
        version_id=version.id,
        agent_run_id=agent_run_id,
        reviewer_slug=REVIEWER_SLUG,
        status=assessment.status,
        score=assessment.score,
        passed=assessment.passed,
        summary=assessment.summary,
        critical_failures=assessment.critical_failures,
        required_fixes=assessment.required_fixes,
        optional_improvements=assessment.optional_improvements,
        verified_sources=assessment.verified_sources,
        raw_report=assessment.raw_report,
        review_mode=assessment.review_mode,
        llm_provider=assessment.llm_provider,
        llm_model=assessment.llm_model,
        llm_error=assessment.llm_error,
        confidence=assessment.confidence,
    )
    db.add(review)
    await db.flush()
    return review


logger = logging.getLogger(__name__)


async def run_guardian_after_generation(db: AsyncSession, output: Output) -> QualityReview | None:
    """Roda o Guardião automaticamente após a geração (pesquisa/cocriação/refino) e PERSISTE a
    avaliação — **sem aprovar** o output (só orienta a revisão humana).

    Roda numa SESSÃO PRÓPRIA (isolada da transação do request), como o tracking de ModelCall:
    best-effort, uma falha nunca derruba a geração nem expira objetos do request. O output já foi
    commitado pelo chamador, então a sessão nova o lê pelo id."""
    from sqlalchemy import inspect as sa_inspect

    from app.db import AsyncSessionLocal

    # Identidade do output sem disparar IO (o objeto pode estar expirado/em outra sessão).
    try:
        identity = sa_inspect(output).identity
        output_id = identity[0] if identity else getattr(output, "id", None)
    except Exception:  # noqa: BLE001
        output_id = getattr(output, "id", None)
    if output_id is None:
        return None

    try:
        async with AsyncSessionLocal() as gdb:
            fresh = await gdb.get(Output, output_id)
            if fresh is None:
                return None
            review = await review_output_quality(gdb, fresh)
            await gdb.commit()
            logger.info(
                "Guardião automático: output=%s score=%s status=%s",
                output_id, review.score, review.status,
            )
            return review
    except Exception:  # noqa: BLE001 - Guardião é best-effort; não pode quebrar a geração
        logger.exception("Guardião automático falhou (best-effort) para output %s.", output_id)
        return None


def guardian_feedback_block(review: QualityReview) -> str:
    """Formata a avaliação do Guardião em um bloco de texto para orientar o refino do agente."""
    parts: list[str] = []
    if review.score is not None:
        parts.append(f"Avaliação do Guardião: {review.score}/100 (status: {review.status}).")
    if review.critical_failures:
        parts.append("Falhas críticas a corrigir:\n- " + "\n- ".join(review.critical_failures))
    if review.required_fixes:
        parts.append("Ajustes obrigatórios:\n- " + "\n- ".join(review.required_fixes))
    if review.optional_improvements:
        parts.append("Melhorias sugeridas:\n- " + "\n- ".join(review.optional_improvements))
    if review.summary:
        parts.append("Resumo: " + review.summary)
    return "\n\n".join(parts)


async def latest_review_feedback(db: AsyncSession, output: Output) -> str:
    """Bloco de feedback do Guardião para a versão atual do output (vazio se não houver review)."""
    version = await current_version(db, output)
    if version is None:
        return ""
    review = await latest_quality_review(db, output.id, version.id)
    return guardian_feedback_block(review) if review is not None else ""


async def ensure_quality_passed(db: AsyncSession, output: Output) -> QualityReview:
    version = await current_version(db, output)
    if version is None:
        raise OutputWorkflowError("Output sem versão atual para aprovação.")
    review = await latest_quality_review(db, output.id, version.id)
    if review is None:
        review = await review_output_quality(db, output)
    if not review.passed:
        fixes = "; ".join(review.critical_failures + review.required_fixes)
        raise OutputWorkflowError(
            f"Guardião de Qualidade bloqueou a aprovação ({review.score}/100): {fixes}"
        )
    return review
