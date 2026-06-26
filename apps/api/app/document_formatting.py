from __future__ import annotations

import re
from dataclasses import dataclass
from unicodedata import combining, normalize

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Output, OutputVersion
from app.text_repair import has_mojibake, repair_text

PROFESSIONAL_REFORMAT_NOTE = "Reformatação profissional local - Fase 13."
PROFESSIONAL_REPAIR_NOTE = "Reparo local de escrita e formatação - Fase 15."
SAFE_REFORMAT_STATUSES = {"draft", "review", "rejected"}
SAFE_REPAIR_STATUSES = {"draft", "review", "needs_adjustment", "rejected"}


@dataclass(frozen=True)
class DocumentProfile:
    document_type: str
    title: str
    required_sections: list[str]
    quality_notes: list[str]


def classify_document_type(channel: str, content_format: str, category: str = "") -> str:
    normalized = _plain(f"{channel} {content_format} {category}")
    if "pesquisa" in normalized or "research" in normalized:
        return "research_report"
    if "metric" in normalized or "relatorio" in normalized or "insight" in normalized:
        return "executive_report"
    if "carrossel" in normalized or "carousel" in normalized:
        return "carousel"
    if "linkedin" in normalized:
        return "linkedin_post"
    if "instagram" in normalized:
        return "instagram_post"
    if "email" in normalized or "e-mail" in normalized:
        return "email"
    if "blog" in normalized or "artigo" in normalized:
        return "blog_article"
    if "webinar" in normalized:
        return "webinar"
    if "reels" in normalized or "reel" in normalized:
        return "reels_script"
    if "campanha" in normalized:
        return "campaign"
    if "prompt" in normalized or "visual" in normalized:
        return "visual_prompts"
    return "editorial_document"


def document_profile(channel: str, content_format: str, category: str = "") -> DocumentProfile:
    document_type = classify_document_type(channel, content_format, category)
    profiles = {
        "research_report": DocumentProfile(
            document_type,
            "Relatorio Executivo de Pesquisa",
            [
                "Sumario executivo",
                "Contexto e escopo",
                "Evidencias e fontes",
                "Sinais de mercado",
                "Oportunidades",
                "Riscos e limitacoes",
                "Recomendacoes",
                "Plano de acao",
            ],
            ["Citar evidencias", "Separar fato de interpretacao", "Registrar limitacoes"],
        ),
        "executive_report": DocumentProfile(
            document_type,
            "Relatorio Executivo",
            ["Sumario executivo", "Indicadores", "Analise", "Recomendacoes", "Proximos passos"],
            ["Organizar indicadores", "Destacar decisoes", "Manter tom executivo"],
        ),
        "carousel": DocumentProfile(
            document_type,
            "Roteiro Profissional de Carrossel",
            [
                "Objetivo da peca",
                "Persona e dor",
                "Estrutura dos slides",
                "Legenda completa",
                "Prompts visuais por slide",
                "Checklist de revisao",
            ],
            ["Slides numerados", "Copy curta por card", "Prompt visual executável"],
        ),
        "linkedin_post": DocumentProfile(
            document_type,
            "Post Profissional para LinkedIn",
            [
                "Objetivo editorial",
                "Persona",
                "Gancho",
                "Desenvolvimento",
                "Ponto de vista",
                "CTA",
                "Sugestao visual",
            ],
            ["Gancho claro", "Tom consultivo", "CTA objetivo"],
        ),
        "email": DocumentProfile(
            document_type,
            "E-mail Profissional",
            ["Assunto", "Pre-header", "Abertura", "Corpo", "CTA", "Observacoes"],
            ["Assunto especifico", "CTA unico", "Corpo escaneavel"],
        ),
        "blog_article": DocumentProfile(
            document_type,
            "Artigo Editorial",
            ["Titulo SEO", "Resumo", "Introducao", "Desenvolvimento", "Conclusao", "CTA"],
            ["Hierarquia clara", "Escaneabilidade", "CTA final"],
        ),
    }
    return profiles.get(
        document_type,
        DocumentProfile(
            document_type,
            "Documento Editorial Profissional",
            ["Objetivo", "Contexto", "Conteudo final", "Direcao visual", "CTA", "Revisao"],
            ["Estrutura minima", "Sem dados inventados", "Pronto para revisao"],
        ),
    )


def document_sections(content: str) -> list[str]:
    sections = []
    for line in repair_text(content).splitlines():
        cleaned = line.strip()
        if cleaned.startswith("#"):
            title = cleaned.strip("#").strip()
            if title and title not in sections:
                sections.append(title)
    return sections


def quality_notes_for_content(content: str, profile: DocumentProfile) -> list[str]:
    repaired = repair_text(content)
    found = {_plain(section) for section in document_sections(repaired)}
    missing = [section for section in profile.required_sections if _plain(section) not in found]
    notes = list(profile.quality_notes)
    if missing:
        notes.append("Secoes recomendadas ausentes: " + ", ".join(missing[:4]))
    else:
        notes.append("Estrutura profissional completa.")
    if has_mojibake(content):
        notes.append("Texto contem sinais de encoding legado e deve ser reparado.")
    if "fonte" not in _plain(repaired) and profile.document_type == "research_report":
        notes.append("Pesquisa deve preservar fontes e limitacoes quando disponiveis.")
    return notes


def normalize_document_content(
    *,
    title: str,
    brand_slug: str,
    category: str,
    channel: str,
    content_format: str,
    briefing: str,
    content: str,
    source_label: str = "Saida Duofy",
) -> str:
    profile = document_profile(channel, content_format, category)
    normalized = _normalize_markdown(content)
    normalized = _ensure_title(normalized, title)
    normalized = _ensure_metadata_block(
        normalized,
        profile=profile,
        brand_slug=brand_slug,
        category=category,
        channel=channel,
        content_format=content_format,
        briefing=briefing,
        source_label=source_label,
    )
    normalized = _remove_editorial_placeholders(normalized)
    normalized = _polish_markdown_spacing(normalized)
    return normalized.strip() + "\n"


async def reformat_legacy_outputs(
    db: AsyncSession,
    *,
    status_filter: str | None = None,
    brand_slug: str | None = None,
    limit: int = 50,
) -> dict[str, int]:
    return await _create_repaired_versions(
        db,
        note=PROFESSIONAL_REFORMAT_NOTE,
        allowed_statuses=SAFE_REFORMAT_STATUSES,
        status_filter=status_filter,
        brand_slug=brand_slug,
        output_id=None,
        limit=limit,
        use_full_normalization=True,
    )


async def repair_formatting_outputs(
    db: AsyncSession,
    *,
    status_filter: str | None = None,
    brand_slug: str | None = None,
    output_id: int | None = None,
    limit: int = 50,
) -> dict[str, int]:
    return await _create_repaired_versions(
        db,
        note=PROFESSIONAL_REPAIR_NOTE,
        allowed_statuses=SAFE_REPAIR_STATUSES,
        status_filter=status_filter,
        brand_slug=brand_slug,
        output_id=output_id,
        limit=limit,
        use_full_normalization=True,
    )


async def _create_repaired_versions(
    db: AsyncSession,
    *,
    note: str,
    allowed_statuses: set[str],
    status_filter: str | None,
    brand_slug: str | None,
    output_id: int | None,
    limit: int,
    use_full_normalization: bool,
) -> dict[str, int]:
    statement = select(Output)
    if output_id is not None:
        statement = statement.where(Output.id == output_id)
    elif status_filter:
        if status_filter not in allowed_statuses:
            return {"checked": 0, "repaired": 0, "reformatted": 0, "skipped": 0}
        statement = statement.where(Output.status == status_filter)
    else:
        statement = statement.where(Output.status.in_(allowed_statuses))
    if brand_slug:
        statement = statement.where(Output.brand_slug == brand_slug)
    statement = statement.order_by(Output.updated_at.desc()).limit(limit)
    result = await db.execute(statement)
    outputs = list(result.scalars().all())
    repaired_count = 0
    skipped = 0

    for output in outputs:
        if output.status not in allowed_statuses and output_id is None:
            skipped += 1
            continue
        versions = await _versions_for_output(db, output.id)
        if not versions:
            skipped += 1
            continue
        current = next(
            (version for version in versions if version.id == output.current_version_id),
            versions[-1],
        )
        repaired = repair_text(current.content)
        if use_full_normalization:
            repaired = normalize_document_content(
                title=repair_text(output.title),
                brand_slug=repair_text(output.brand_slug),
                category=repair_text(output.category),
                channel=repair_text(output.channel),
                content_format=repair_text(output.format),
                briefing=repair_text(output.briefing),
                content=repaired,
                source_label="Reparo local",
            )
        if repaired.strip() == current.content.strip():
            skipped += 1
            continue
        version = OutputVersion(
            output_id=output.id,
            version_number=max(version.version_number for version in versions) + 1,
            content=repaired,
            editor_note=note,
        )
        output.title = repair_text(output.title)
        output.briefing = repair_text(output.briefing)
        db.add(version)
        await db.flush()
        output.current_version_id = version.id
        repaired_count += 1

    await db.commit()
    return {
        "checked": len(outputs),
        "repaired": repaired_count,
        "reformatted": repaired_count,
        "skipped": skipped,
    }


async def _versions_for_output(db: AsyncSession, output_id: int) -> list[OutputVersion]:
    result = await db.execute(
        select(OutputVersion)
        .where(OutputVersion.output_id == output_id)
        .order_by(OutputVersion.version_number.asc())
    )
    return list(result.scalars().all())


async def next_version_number(db: AsyncSession, output_id: int) -> int:
    result = await db.execute(
        select(func.max(OutputVersion.version_number)).where(OutputVersion.output_id == output_id)
    )
    return int(result.scalar() or 0) + 1


def _normalize_markdown(content: str) -> str:
    text = repair_text(content).replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = []
    seen_title = False
    for line in text.splitlines():
        stripped = line.strip()
        if _is_placeholder_line(stripped):
            continue
        if stripped.startswith("# "):
            if seen_title:
                lines.append("## " + stripped[2:].strip())
            else:
                lines.append(line)
                seen_title = True
        elif re.match(r"^[A-ZÁ-Úa-zá-ú0-9][^:]{2,70}:$", stripped):
            lines.append(f"## {stripped.rstrip(':')}")
        elif re.match(r"^(Slide|Card)\s+\d+", stripped, flags=re.IGNORECASE):
            lines.append(f"### {stripped}")
        else:
            lines.append(line)
    return "\n".join(lines).strip()


def _ensure_title(content: str, title: str) -> str:
    if content.lstrip().startswith("# "):
        return content
    return f"# {repair_text(title).strip() or 'Documento Duofy'}\n\n{content}"


def _ensure_metadata_block(
    content: str,
    *,
    profile: DocumentProfile,
    brand_slug: str,
    category: str,
    channel: str,
    content_format: str,
    briefing: str,
    source_label: str,
) -> str:
    if "## Metadados editoriais" in content:
        return content
    block = "\n".join(
        [
            "## Metadados editoriais",
            f"- **Tipo de documento:** {profile.title}",
            f"- **Marca:** {brand_slug}",
            f"- **Categoria:** {category}",
            f"- **Canal:** {channel}",
            f"- **Formato:** {content_format}",
            f"- **Origem:** {source_label}",
            f"- **Briefing-base:** {briefing[:360].strip() or 'Nao informado'}",
        ]
    )
    lines = content.splitlines()
    if lines and lines[0].startswith("# "):
        return "\n".join([lines[0], "", block, "", *lines[1:]]).strip()
    return f"{block}\n\n{content}"


def _remove_editorial_placeholders(content: str) -> str:
    lines = [line for line in content.splitlines() if not _is_placeholder_line(line.strip())]
    return "\n".join(lines)


def _is_placeholder_line(value: str) -> bool:
    normalized = _plain(value)
    return "secao a completar na revisao editorial" in normalized


def _polish_markdown_spacing(content: str) -> str:
    text = re.sub(r"\n(#{1,3} .+)\n(?!\n)", r"\n\1\n\n", content)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"(?m)^\s*---\s*$", "\n---\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _plain(value: str) -> str:
    repaired = repair_text(value).lower()
    return "".join(
        char for char in normalize("NFKD", repaired) if not combining(char)
    )
