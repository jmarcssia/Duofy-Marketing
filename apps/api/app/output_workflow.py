from __future__ import annotations

import difflib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import embed_text, vector_to_sql
from app.models import MemoryEntry, Output, OutputDecision, OutputVersion, Source, User
from app.schemas import ContentOutputUpdate
from app.text_repair import repair_text


class OutputWorkflowError(RuntimeError):
    pass


def _repo_roots() -> list[Path]:
    current = Path.cwd()
    return [current, *current.parents]


def _load_status_rules() -> dict[str, Any]:
    for root in _repo_roots():
        candidate = root / "config" / "rules" / "output_status.yaml"
        if candidate.exists():
            data = yaml.safe_load(candidate.read_text(encoding="utf-8")) or {}
            return dict(data.get("statuses") or {})

    packaged = Path.cwd().joinpath(
        "DUOFY_V1_pacote_execucao_desenvolvimento",
        "duofy_v1_execucao_desenvolvimento",
        "config",
        "rules",
        "output_status.yaml",
    )
    if packaged.exists():
        data = yaml.safe_load(packaged.read_text(encoding="utf-8")) or {}
        return dict(data.get("statuses") or {})

    return {
        "draft": {"can_edit": True},
        "review": {"can_edit": True, "can_approve": True},
        "approved": {"can_edit": False},
        "rejected": {"can_edit": False, "temporary_days": 30},
        "needs_adjustment": {"can_edit": True},
        "archived": {"can_edit": False},
    }


def _status_rule(status: str) -> dict[str, Any]:
    return dict(_load_status_rules().get(status) or {})


def _require_feedback(feedback: str | None, action: str) -> str:
    cleaned = (feedback or "").strip()
    if not cleaned:
        raise OutputWorkflowError(f"Feedback obrigatorio para {action}.")
    return cleaned


async def current_version(db: AsyncSession, output: Output) -> OutputVersion | None:
    versions = await output_versions(db, output.id)
    return next(
        (version for version in versions if version.id == output.current_version_id),
        versions[-1] if versions else None,
    )


async def output_versions(db: AsyncSession, output_id: int) -> list[OutputVersion]:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output_id)
        .order_by(OutputVersion.version_number.asc())
    )
    return list(result.scalars().all())


async def get_output_version(
    db: AsyncSession,
    output_id: int,
    version_id: int,
) -> OutputVersion | None:
    result = await db.execute(
        select(OutputVersion).where(
            OutputVersion.id == version_id,
            OutputVersion.output_id == output_id,
        )
    )
    return result.scalar_one_or_none()


def compare_version_content(
    from_version: OutputVersion,
    to_version: OutputVersion,
) -> list[dict[str, int | str | None]]:
    old_line_number = 0
    new_line_number = 0
    diff_lines: list[dict[str, int | str | None]] = []
    diff = difflib.ndiff(
        repair_text(from_version.content).splitlines(),
        repair_text(to_version.content).splitlines(),
    )
    for line in diff:
        marker = line[:2]
        content = line[2:]
        if marker == "  ":
            old_line_number += 1
            new_line_number += 1
            diff_lines.append(
                {
                    "change_type": "unchanged",
                    "old_line_number": old_line_number,
                    "new_line_number": new_line_number,
                    "content": content,
                }
            )
        elif marker == "- ":
            old_line_number += 1
            diff_lines.append(
                {
                    "change_type": "removed",
                    "old_line_number": old_line_number,
                    "new_line_number": None,
                    "content": content,
                }
            )
        elif marker == "+ ":
            new_line_number += 1
            diff_lines.append(
                {
                    "change_type": "added",
                    "old_line_number": None,
                    "new_line_number": new_line_number,
                    "content": content,
                }
            )
    return diff_lines


async def edit_output(
    db: AsyncSession,
    output: Output,
    payload: ContentOutputUpdate,
) -> Output:
    if not _status_rule(output.status).get("can_edit", False):
        raise OutputWorkflowError(f"Output em status {output.status} nao pode ser editado.")

    if payload.title is not None:
        output.title = payload.title
    if payload.content is not None:
        result = await db.execute(
            select(func.max(OutputVersion.version_number)).where(
                OutputVersion.output_id == output.id
            )
        )
        next_version = int(result.scalar() or 0) + 1
        version = OutputVersion(
            output_id=output.id,
            version_number=next_version,
            content=repair_text(payload.content),
            editor_note=payload.editor_note or "Edição em aprovação.",
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id

    await db.commit()
    await db.refresh(output)
    return output


async def restore_output_version(
    db: AsyncSession,
    output: Output,
    version: OutputVersion,
) -> Output:
    if not _status_rule(output.status).get("can_edit", False):
        raise OutputWorkflowError(f"Output em status {output.status} nao pode ser restaurado.")

    result = await db.execute(
        select(func.max(OutputVersion.version_number)).where(
            OutputVersion.output_id == output.id
        )
    )
    next_version = int(result.scalar() or 0) + 1
    restored = OutputVersion(
        output_id=output.id,
        version_number=next_version,
        content=repair_text(version.content),
        editor_note=f"Restauração da versão {version.version_number}.",
    )
    db.add(restored)
    await db.flush()
    output.current_version_id = restored.id
    await db.commit()
    await db.refresh(output)
    return output


async def _memory_for_output(
    db: AsyncSession,
    output: Output,
    source_type: str,
) -> MemoryEntry | None:
    result = await db.execute(
        select(MemoryEntry).where(
            MemoryEntry.output_id == output.id,
            MemoryEntry.source_type == source_type,
        )
    )
    return result.scalar_one_or_none()


def _approved_memory_content(output: Output, content: str) -> str:
    return "\n\n".join(
        [
            f"Output aprovado: {output.title}",
            (
                f"Marca: {output.brand_slug} | Categoria: {output.category} | "
                f"Canal: {output.channel} | Formato: {output.format}"
            ),
            "Briefing:",
            output.briefing,
            "Versao aprovada:",
            content,
        ]
    )


def _rejected_learning_content(output: Output, feedback: str, content: str) -> str:
    return "\n\n".join(
        [
            f"Feedback de rejeicao temporario: {output.title}",
            (
                f"Marca: {output.brand_slug} | Categoria: {output.category} | "
                f"Canal: {output.channel} | Formato: {output.format}"
            ),
            "Feedback:",
            feedback,
            "Conteudo rejeitado:",
            content[:3000],
        ]
    )


async def _create_memory(
    db: AsyncSession,
    output: Output,
    title: str,
    content: str,
    category: str,
    source_type: str,
    expires_at: datetime | None,
) -> MemoryEntry:
    source = Source(
        name=title,
        source_type=source_type,
        url=None,
    )
    db.add(source)
    await db.flush()
    embedding = vector_to_sql(await embed_text(db, content))
    memory = MemoryEntry(
        brand_slug=output.brand_slug,
        category=category,
        source_type=source_type,
        title=title,
        content=content,
        source_id=source.id,
        output_id=output.id,
        expires_at=expires_at,
        embedding=embedding,
    )
    db.add(memory)
    await db.flush()
    return memory


async def _record_decision(
    db: AsyncSession,
    output: Output,
    user: User,
    action: str,
    feedback: str | None = None,
    memory: MemoryEntry | None = None,
) -> OutputDecision:
    decision = OutputDecision(
        output_id=output.id,
        user_id=user.id,
        action=action,
        feedback=feedback,
        memory_entry_id=memory.id if memory else None,
    )
    db.add(decision)
    await db.flush()
    return decision


async def approve_output(db: AsyncSession, output: Output, user: User) -> Output:
    if output.status == "approved":
        return output
    # Relatórios de pesquisa não passam por um estado "review" (a página do Agente de Pesquisa
    # só oferece Aprovar/Solicitar ajustes): aprova direto do rascunho. O Guardião de Qualidade
    # segue sendo o portão (ensure_quality_passed abaixo). Conteúdo mantém o fluxo via review.
    is_research = output.channel == "Pesquisa" and output.format == "research_report"
    research_ok = is_research and output.status in ("draft", "needs_adjustment")
    if not research_ok and not _status_rule(output.status).get("can_approve", False):
        raise OutputWorkflowError(f"Output em status {output.status} nao pode ser aprovado.")

    version = await current_version(db, output)
    if version is None:
        raise OutputWorkflowError("Output sem versao atual.")
    from app.quality_guardian import ensure_quality_passed

    await ensure_quality_passed(db, output)

    memory = await _memory_for_output(db, output, "approved_output")
    if memory is None:
        content = _approved_memory_content(output, version.content)
        memory = await _create_memory(
            db=db,
            output=output,
            title=f"Output aprovado: {output.title}",
            content=content,
            category="output_approved",
            source_type="approved_output",
            expires_at=None,
        )

    output.status = "approved"
    await _record_decision(db, output, user, "approved", memory=memory)
    await db.commit()
    await db.refresh(output)
    return output


async def reject_output(
    db: AsyncSession,
    output: Output,
    user: User,
    feedback: str | None,
) -> Output:
    cleaned_feedback = _require_feedback(feedback, "rejeicao")
    version = await current_version(db, output)
    if version is None:
        raise OutputWorkflowError("Output sem versao atual.")

    expires_at = datetime.now(UTC) + timedelta(days=30)
    memory = await _memory_for_output(db, output, "temporary_feedback")
    if memory is None:
        content = _rejected_learning_content(output, cleaned_feedback, version.content)
        memory = await _create_memory(
            db=db,
            output=output,
            title=f"Feedback rejeitado: {output.title}",
            content=content,
            category="feedback_rejected",
            source_type="temporary_feedback",
            expires_at=expires_at,
        )

    output.status = "rejected"
    await _record_decision(
        db=db,
        output=output,
        user=user,
        action="rejected",
        feedback=cleaned_feedback,
        memory=memory,
    )
    await db.commit()
    await db.refresh(output)
    return output


async def request_adjustment(
    db: AsyncSession,
    output: Output,
    user: User,
    feedback: str | None,
) -> Output:
    cleaned_feedback = _require_feedback(feedback, "solicitacao de ajuste")
    if output.status not in {"review", "draft", "needs_adjustment"}:
        raise OutputWorkflowError(
            f"Output em status {output.status} nao pode receber ajuste."
        )
    output.status = "needs_adjustment"
    await _record_decision(db, output, user, "needs_adjustment", feedback=cleaned_feedback)
    await db.commit()
    await db.refresh(output)
    return output


async def archive_output(db: AsyncSession, output: Output, user: User) -> Output:
    output.status = "archived"
    await _record_decision(db, output, user, "archived")
    await db.commit()
    await db.refresh(output)
    return output


async def output_effects(
    db: AsyncSession,
    output_id: int,
) -> tuple[int | None, int | None, str | None]:
    memory_result = await db.execute(
        select(MemoryEntry).where(MemoryEntry.output_id == output_id)
    )
    memories = list(memory_result.scalars().all())
    approved_memory_id = next(
        (memory.id for memory in memories if memory.source_type == "approved_output"),
        None,
    )
    temporary_learning_id = next(
        (memory.id for memory in memories if memory.source_type == "temporary_feedback"),
        None,
    )

    decision_result = await db.execute(
        select(OutputDecision)
        .where(OutputDecision.output_id == output_id)
        .order_by(OutputDecision.created_at.desc())
    )
    latest_decision = decision_result.scalars().first()
    return (
        approved_memory_id,
        temporary_learning_id,
        latest_decision.feedback if latest_decision else None,
    )
