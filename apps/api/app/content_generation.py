from __future__ import annotations

from datetime import date
from unicodedata import combining, normalize

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import read_agent_prompt, read_config_text
from app.document_formatting import normalize_document_content
from app.llm import LLMConfigurationError, call_llm
from app.models import Agent, AgentRun, Brand, Output, OutputVersion, ProviderCredential
from app.rag import build_rag_context
from app.schemas import ContentGenerateRequest, ContentOutputUpdate


def _provider_for_model(model: str) -> str:
    if model.startswith("openai/") or model.startswith("anthropic/"):
        return "openrouter"
    if model.startswith("gpt-"):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    return "openrouter"


def _plain_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def _template_name(channel: str, content_format: str) -> str:
    normalized = _plain_text(f"{channel} {content_format}")
    if "carrossel" in normalized or "carousel" in normalized:
        return "carrossel.md"
    if "linkedin" in normalized:
        return "linkedin.md"
    if "instagram" in normalized or "post unico" in normalized or "legenda" in normalized:
        return "instagram.md"
    if "reels" in normalized or "reel" in normalized:
        return "reels.md"
    if "blog" in normalized or "artigo" in normalized:
        return "blog.md"
    if "email" in normalized or "e-mail" in normalized or "newsletter" in normalized:
        return "email.md"
    if "webinar" in normalized:
        return "webinar.md"
    if "campanha" in normalized:
        return "campanha.md"
    if "visual" in normalized or "prompt" in normalized:
        return "prompts_visuais.md"
    return "generic.md"


def _system_prompt(agent_prompt: str) -> str:
    return "\n".join(
        [
            agent_prompt,
            "",
            "Contexto operacional:",
            f"- Data atual do sistema: {date.today().isoformat()}.",
            "- A entrega deve ser estruturada, editavel e pronta para revisao.",
            "- Nunca afirme que uma informacao veio de memoria se ela nao estiver no contexto RAG.",
        ]
    )


def _user_prompt(
    brand: Brand,
    payload: ContentGenerateRequest,
    template: str,
    rag_context: str,
) -> str:
    context = rag_context or "Nenhum trecho relevante encontrado na memoria RAG."
    return "\n".join(
        [
            "Gere uma entrega de co-criacao de conteudo.",
            "",
            "Dados da marca:",
            f"- Nome: {brand.name}",
            f"- Slug: {brand.slug}",
            f"- Nicho: {brand.niche}",
            f"- Descricao: {brand.description}",
            "",
            "Pedido:",
            f"- Categoria RAG: {payload.category}",
            f"- Canal: {payload.channel}",
            f"- Formato: {payload.format}",
            f"- Briefing: {payload.briefing}",
            "",
            "Template obrigatorio:",
            template,
            "",
            "Contexto RAG recuperado antes da geração:",
            context,
            "",
            "Regras finais:",
            "- Inclua marca, persona, dor, solucao e CTA.",
            "- Para carrossel, entregue slides organizados e prompts visuais por slide.",
            "- Para LinkedIn, entregue gancho, contexto, dor, ponto de vista, solucao e CTA.",
            "- Nao use dados mockados.",
        ]
    )


def _derive_title(content: str, payload: ContentGenerateRequest) -> str:
    for line in content.splitlines():
        cleaned = line.strip().strip("#").strip()
        if cleaned:
            return cleaned[:255]
    return f"{payload.format} - {payload.channel}"


async def generate_content_output(
    db: AsyncSession,
    payload: ContentGenerateRequest,
) -> Output:
    agent_result = await db.execute(select(Agent).where(Agent.slug == "content_agent"))
    agent = agent_result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente content_agent nao encontrado ou inativo.")

    brand_result = await db.execute(select(Brand).where(Brand.slug == payload.brand_slug))
    brand = brand_result.scalar_one_or_none()
    if brand is None or not brand.is_active:
        raise LLMConfigurationError("Marca nao encontrada ou inativa.")

    model = payload.model or agent.default_model
    provider = payload.provider or _provider_for_model(model)
    credential_result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = credential_result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )

    agent_prompt = read_agent_prompt("content_agent")
    template = read_config_text("templates", _template_name(payload.channel, payload.format))
    rag_context = await build_rag_context(
        db=db,
        query=payload.briefing,
        brand_slug=payload.brand_slug,
        category=payload.category if payload.category != "all" else None,
        limit=6,
    )
    user_prompt = _user_prompt(brand, payload, template, rag_context)

    try:
        llm_result = await call_llm(
            credential=credential,
            model=credential.default_model or model,
            system_prompt=_system_prompt(agent_prompt),
            user_prompt=user_prompt,
            task_type="content_generation",
            agent_slug=agent.slug,
            brand_slug=brand.slug,
        )
        normalized_output = normalize_document_content(
            title=_derive_title(llm_result.output, payload),
            brand_slug=brand.slug,
            category=payload.category,
            channel=payload.channel,
            content_format=payload.format,
            briefing=payload.briefing,
            content=llm_result.output,
            source_label="content_agent",
        )

        run = AgentRun(
            agent_slug=agent.slug,
            provider=llm_result.provider,
            model=llm_result.model,
            prompt=user_prompt,
            output=normalized_output,
            status="completed",
        )
        db.add(run)
        await db.flush()

        output = Output(
            brand_slug=brand.slug,
            category=payload.category,
            channel=payload.channel,
            format=payload.format,
            title=_derive_title(normalized_output, payload),
            briefing=payload.briefing,
            status=payload.status,
            provider=llm_result.provider,
            model=llm_result.model,
            agent_run_id=run.id,
        )
        db.add(output)
        await db.flush()

        version = OutputVersion(
            output_id=output.id,
            version_number=1,
            content=normalized_output,
            editor_note="Geração inicial do content_agent.",
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id
        await db.commit()
        await db.refresh(output)
        return output
    except Exception as exc:
        await db.rollback()
        run = AgentRun(
            agent_slug=agent.slug,
            provider=provider,
            model=model,
            prompt=user_prompt,
            output="",
            status="failed",
            error=str(exc),
        )
        db.add(run)
        await db.commit()
        raise


async def edit_content_output(
    db: AsyncSession,
    output: Output,
    payload: ContentOutputUpdate,
) -> Output:
    if payload.title is not None:
        output.title = payload.title
    if payload.status is not None:
        output.status = payload.status
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
            content=payload.content,
            editor_note=payload.editor_note or "Edição manual.",
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id

    await db.commit()
    await db.refresh(output)
    return output
