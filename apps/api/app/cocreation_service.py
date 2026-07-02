"""Agente de Cocriacao: transforma tema/pesquisa/fonte num PACOTE ESTRUTURADO de conteudo.

Reusa o pipeline existente (Output/OutputVersion/AgentRun, voz de marca, RAG, LLM) e produz
um ContentPackage (JSON) + uma renderizacao humana (markdown). Consome pesquisa existente —
nao refaz pesquisa profunda.
"""

from __future__ import annotations

import json
import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import brand_voice_section, read_agent_prompt, read_config_text
from app.agent_limits import get_token_budget
from app.llm import LLMConfigurationError, call_llm, provider_for_model
from app.models import (
    Agent,
    AgentRun,
    Brand,
    Output,
    OutputVersion,
    ProviderCredential,
)
from app.rag import build_rag_context
from app.schemas import (
    CocreationRefineRequest,
    ContentPackage,
    CreationRequest,
)

# Mapeia o brand_slug do sistema para o arquivo de perfil modular da cocriacao.
_BRAND_PROFILE = {
    "duofy_solucoes": "duofy",
    "deathcare": "deathcare",
    "postos_combustiveis": "postos",
}

# Detecta quando o prompt PEDE logo/@/#/marca d'agua (proibido) — sem flagar quando ele
# apenas os PROIBE ("sem logo", "elementos proibidos: hashtag"). O acabamento (logo/@) e manual.
# @handle ou #hashtag reais (comeca com letra). Nao casa cor hex "#6221E9" nem "sem @".
_HANDLE_RE = re.compile(r"[@#][A-Za-z]")
_REQUEST_RE = re.compile(
    r"(com|inclua|incluir|adicione|adicionar|insira|inserir|coloque|colocar|desenhe|"
    r"desenhar|use|usar|aplique|aplicar)\b[^.\n]{0,45}?\b"
    r"(logo|logotipo|marca\s+d'?[aá]gua|watermark|selo\s+de\s+parceiro|assinatura|hashtag)",
    re.IGNORECASE,
)


def has_forbidden_prompt(prompt: str) -> bool:
    text = prompt or ""
    return bool(_HANDLE_RE.search(text)) or bool(_REQUEST_RE.search(text))


def _safe_read(*parts: str) -> str:
    try:
        return read_config_text(*parts)
    except Exception:
        return ""


def _brand_profile_text(brand_slug: str) -> str:
    key = _BRAND_PROFILE.get(brand_slug)
    return _safe_read("cocreation", "brands", f"{key}.md") if key else ""


def _format_guide_file(channel: str, content_format: str) -> str:
    text = f"{channel} {content_format}".lower()
    if "carrossel" in text or "carousel" in text:
        return "carousel.md"
    if "linkedin" in text:
        return "linkedin.md"
    if "reels" in text or "reel" in text:
        return "reels.md"
    if "stories" in text or "story" in text:
        return "stories.md"
    if "blog" in text or "artigo" in text:
        return "blog.md"
    if "email" in text or "e-mail" in text or "newsletter" in text:
        return "email.md"
    if "landing" in text:
        return "landing-page.md"
    if "campanha" in text or "campaign" in text:
        return "campaign.md"
    if "webinar" in text:
        return "webinar.md"
    if "comunicado" in text or "institucional" in text:
        return "comunicado-institucional.md"
    if "caso" in text or "case" in text:
        return "estudo-de-caso.md"
    if "newsletter" in text:
        return "newsletter.md"
    if "evento" in text or "event" in text:
        return "evento.md"
    if "bastidor" in text:
        return "bastidores.md"
    if "sequencia" in text or "sequência" in text or "educativ" in text:
        return "sequencia-educativa.md"
    return "post-unico.md"


_PACKAGE_SHAPE = """{
  "brand_slug": str, "channel": str, "format": str,
  "persona": str, "objetivo": str, "etapa_funil": str,
  "analise_estrategica": str, "conceito": str, "arco_narrativo": str, "cta": str,
  "captions": { "instagram": str, "linkedin": str },
  "slides": [ { "numero": int, "funcao": str, "texto": str, "texto_arte": str,
               "image_prompt": str, "alt_text": str } ],
  "visual_direction": { "conceito": str, "estilo": str, "cenario": str, "enquadramento": str,
    "composicao": str, "iluminacao": str, "paleta": str, "tipografia": str, "restricoes": str },
  "factualidade": [str], "checklist": [str]
}"""


def _system_prompt(agent_prompt: str, brand_slug: str) -> str:
    return "\n".join(
        [
            agent_prompt,
            "",
            "Voce e o Agente de Cocriacao: gestor senior de marketing, estrategista de conteudo,"
            " copywriter B2B, diretor de arte e planejador multicanal.",
            f"Data atual: {date.today().isoformat()}.",
            "Interprete a pesquisa/fonte, nao refaca pesquisa. Nao invente produto, funcionalidade,"
            " numero, case, resultado ou integracao. Numero exige fonte; hipotese nunca vira fato.",
            "Nao produza texto generico de IA. Entregue material pronto para producao, com espaco"
            " para acabamento humano.",
            brand_voice_section(brand_slug),
        ]
    )


def _user_prompt(
    brand: Brand,
    payload: CreationRequest,
    profile: str,
    format_guide: str,
    visual_rules: str,
    factuality: str,
    rag_context: str,
    research_context: str,
) -> str:
    lines = [
        "Gere UM pacote de conteudo profissional e retorne SOMENTE um objeto JSON valido "
        "(sem texto ao redor, sem ```), exatamente neste formato:",
        _PACKAGE_SHAPE,
        "",
        "Regras de saida:",
        "- captions: as legendas de canais DIFERENTES devem ser DIFERENTES entre si. Instagram ="
        " proximo, leitura rapida, paragrafos curtos, CTA de interacao/salvamento. LinkedIn ="
        " executivo, tese, analise, implicacao de negocio, CTA profissional. Sempre inclua"
        " 'instagram' e 'linkedin'.",
        "- Se o formato for carrossel: 'slides' com um objeto por slide, cada um com FUNCAO"
        " narrativa (o conteudo evolui de um slide para o proximo), 'texto' exato do slide,"
        " 'texto_arte' curto e legivel, e um 'image_prompt' COMPLETO e INDEPENDENTE.",
        "- CADA image_prompt e autossuficiente (proporcao, cenario, enquadramento, composicao,"
        " luz, profundidade, paleta, hierarquia, texto exato da imagem, espaco de seguranca)."
        " NUNCA escreva 'mantenha o estilo do slide anterior'.",
        "- NUNCA peca no image_prompt: logo, logotipo, marca (TOTVS/Duofy), selo de parceiro,"
        " @/arroba, hashtag, marca d'agua, assinatura, textos extras, nomes de sistemas"
        " inventados, numeros inventados. O logo/@ serao inseridos depois na edicao.",
        "- factualidade: liste o que e fato/evidencia vs interpretacao/hipotese; se a fonte tiver"
        " baixa confianca, evite afirmacoes categoricas.",
        "",
        "Marca:",
        f"- Nome: {brand.name} | Slug: {brand.slug} | Nicho: {brand.niche}",
        f"- Descricao: {brand.description}",
        "",
        "Perfil da marca (fonte de verdade — nao contrarie):",
        profile or "(perfil nao disponivel; use a voz de marca e o RAG)",
        "",
        "Guia do formato:",
        format_guide or "(sem guia especifico)",
        "",
        "Regras de direcao visual e de prompts:",
        visual_rules or "",
        "",
        "Regras de factualidade:",
        factuality or "",
        "",
        "Pesquisa/fonte a consumir (NAO refaca pesquisa):",
        research_context or "(nenhuma pesquisa associada)",
        "",
        "Memoria/RAG relevante:",
        rag_context or "(nenhuma)",
        "",
        "Briefing do usuario:",
        f"- Tema: {payload.theme}",
        f"- Canal: {payload.channel} | Formato: {payload.format}",
        f"- Persona: {payload.persona or '(inferir)'}",
        f"- Objetivo: {payload.objetivo or '(inferir)'}",
        f"- CTA: {payload.cta or '(inferir)'}",
        f"- Nº de slides: {payload.slides or '(decidir pelo arco)'}",
        f"- Profundidade: {payload.depth} | Tom: {payload.tone or '(voz da marca)'}",
        f"- Observacoes: {payload.observacoes or '-'}",
    ]
    if payload.previous_content:
        lines += ["", "Conteudo anterior para reaproveitar/reconstruir (nao apenas recortar):",
                  payload.previous_content[:6000]]
    return "\n".join(lines)


def _extract_json(raw: str) -> dict:
    text = (raw or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Resposta sem JSON.")
    return json.loads(text[start : end + 1])


def validate_package(pkg: ContentPackage) -> list[str]:
    warnings: list[str] = []
    caps = {k.lower(): v for k, v in pkg.captions.items()}
    if "instagram" not in caps or not caps["instagram"].strip():
        warnings.append("Legenda de Instagram ausente.")
    if "linkedin" not in caps or not caps["linkedin"].strip():
        warnings.append("Legenda de LinkedIn ausente.")
    if (
        caps.get("instagram", "").strip()
        and caps.get("instagram", "").strip() == caps.get("linkedin", "").strip()
    ):
        warnings.append("Instagram e LinkedIn com a mesma legenda (devem diferir).")
    is_carousel = "carrossel" in pkg.format.lower() or "carousel" in pkg.format.lower()
    if is_carousel and not pkg.slides:
        warnings.append("Carrossel sem slides.")
    for slide in pkg.slides:
        if not slide.image_prompt.strip():
            warnings.append(f"Slide {slide.numero} sem image_prompt.")
        elif has_forbidden_prompt(slide.image_prompt):
            warnings.append(
                f"Slide {slide.numero}: image_prompt contem termo proibido (logo/@/#/marca)."
            )
    return warnings


def _md_captions(pkg: ContentPackage) -> list[str]:
    out: list[str] = ["## Legendas por canal"]
    for channel, caption in pkg.captions.items():
        out += [f"### {channel.capitalize()}", caption.strip() or "—", ""]
    return out


def _md_slides(pkg: ContentPackage) -> list[str]:
    if not pkg.slides:
        return []
    out = ["## Carrossel — slides"]
    for slide in pkg.slides:
        out += [
            f"### Slide {slide.numero} — {slide.funcao}",
            slide.texto.strip() or "—",
            f"**Texto da arte:** {slide.texto_arte.strip() or '—'}",
            f"**Alt text:** {slide.alt_text.strip() or '—'}",
            "**Prompt de imagem (independente):**",
            f"> {slide.image_prompt.strip() or '—'}",
            "",
        ]
    return out


def package_to_markdown(pkg: ContentPackage) -> str:
    vd = pkg.visual_direction
    fact = [f"- {item}" for item in pkg.factualidade] or ["—"]
    check = [f"- {item}" for item in pkg.checklist] or ["—"]
    lines = [
        f"# {pkg.format} — {pkg.channel} ({pkg.brand_slug})",
        "",
        "## Analise estrategica",
        pkg.analise_estrategica.strip() or "—",
        "",
        "## Persona e objetivo",
        f"- **Persona:** {pkg.persona or '—'}",
        f"- **Objetivo:** {pkg.objetivo or '—'}",
        f"- **Etapa do funil:** {pkg.etapa_funil or '—'}",
        "",
        "## Conceito",
        pkg.conceito.strip() or "—",
        "",
        "## Arco narrativo",
        pkg.arco_narrativo.strip() or "—",
        "",
        *_md_slides(pkg),
        *_md_captions(pkg),
        "## Direcao visual",
        f"- **Conceito:** {vd.conceito or '—'}",
        f"- **Estilo:** {vd.estilo or '—'}",
        f"- **Cenario:** {vd.cenario or '—'}",
        f"- **Enquadramento:** {vd.enquadramento or '—'}",
        f"- **Composicao:** {vd.composicao or '—'}",
        f"- **Iluminacao:** {vd.iluminacao or '—'}",
        f"- **Paleta:** {vd.paleta or '—'}",
        f"- **Tipografia:** {vd.tipografia or '—'}",
        f"- **Restricoes:** {vd.restricoes or '—'}",
        "",
        "## CTA",
        pkg.cta.strip() or "—",
        "",
        "## Factualidade",
        *fact,
        "",
        "## Checklist final",
        *check,
    ]
    return "\n".join(lines)


async def _resolve(
    db: AsyncSession, brand_slug: str, model: str | None, provider: str | None
) -> tuple[Agent, Brand, ProviderCredential, str]:
    agent = (
        await db.execute(select(Agent).where(Agent.slug == "content_agent"))
    ).scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente content_agent nao encontrado ou inativo.")
    brand = (
        await db.execute(select(Brand).where(Brand.slug == brand_slug))
    ).scalar_one_or_none()
    if brand is None or not brand.is_active:
        raise LLMConfigurationError("Marca nao encontrada ou inativa.")
    resolved_model = model or agent.default_model
    resolved_provider = provider or provider_for_model(resolved_model)
    credential = (
        await db.execute(
            select(ProviderCredential).where(ProviderCredential.provider == resolved_provider)
        )
    ).scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {resolved_provider} em Admin > Modelos LLM."
        )
    return agent, brand, credential, resolved_model


async def _research_context(db: AsyncSession, research_output_id: int | None) -> str:
    if research_output_id is None:
        return ""
    output = await db.get(Output, research_output_id)
    if output is None or output.channel != "Pesquisa":
        return ""
    version = None
    if output.current_version_id is not None:
        version = await db.get(OutputVersion, output.current_version_id)
    content = (version.content if version else "") or ""
    return f"Pesquisa #{output.id} — {output.title}\n{content[:9000]}"


async def _call_package(
    db: AsyncSession,
    *,
    agent: Agent,
    brand: Brand,
    credential: ProviderCredential,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> tuple[ContentPackage, str, str, str]:
    """Chama o LLM (com uma retentativa se o JSON vier invalido). Retorna (pkg, provider,
    model, prompt_usado)."""
    budget = max(await get_token_budget(db, "content_agent"), 8000)
    attempt_prompt = user_prompt
    last_error = ""
    for _attempt in range(2):
        result = await call_llm(
            credential=credential,
            model=model,
            system_prompt=system_prompt,
            user_prompt=attempt_prompt,
            task_type="cocreation",
            agent_slug=agent.slug,
            brand_slug=brand.slug,
            json_mode=True,
            max_tokens=budget,
        )
        try:
            data = _extract_json(result.output)
            data.setdefault("brand_slug", brand.slug)
            pkg = ContentPackage.model_validate(data)
            return pkg, result.provider, result.model, attempt_prompt
        except Exception as exc:  # noqa: BLE001 - retenta uma vez com instrucao corretiva
            last_error = str(exc)[:200]
            attempt_prompt = (
                user_prompt
                + "\n\nATENCAO: retorne SOMENTE um objeto JSON valido no formato pedido, "
                "sem nenhum texto fora do JSON."
            )
    raise LLMConfigurationError(f"O modelo nao retornou um pacote valido: {last_error}")


async def _persist_version(
    db: AsyncSession,
    *,
    agent: Agent,
    brand: Brand,
    payload: CreationRequest,
    pkg: ContentPackage,
    provider: str,
    model: str,
    prompt: str,
    editor_note: str,
    existing: Output | None,
) -> tuple[Output, OutputVersion]:
    markdown = package_to_markdown(pkg)
    structured = json.dumps(pkg.model_dump(), ensure_ascii=False)
    run = AgentRun(
        agent_slug=agent.slug, provider=provider, model=model,
        prompt=prompt, output=markdown, status="completed",
    )
    db.add(run)
    await db.flush()
    if existing is None:
        title = pkg.conceito[:255] or f"{payload.format} - {payload.channel}"
        output = Output(
            brand_slug=brand.slug, category=payload.category, channel=payload.channel,
            format=payload.format, title=title,
            briefing=payload.theme, status=payload.status, provider=provider, model=model,
            agent_run_id=run.id,
        )
        db.add(output)
        await db.flush()
        version_number = 1
    else:
        output = existing
        output.agent_run_id = run.id
        last = (
            await db.execute(
                select(OutputVersion)
                .where(OutputVersion.output_id == output.id)
                .order_by(OutputVersion.version_number.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        version_number = (last.version_number + 1) if last else 1
    version = OutputVersion(
        output_id=output.id, version_number=version_number, content=markdown,
        editor_note=editor_note, structured_json=structured,
    )
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    await db.commit()
    await db.refresh(output)
    await db.refresh(version)
    return output, version


async def generate_content_package(
    db: AsyncSession, payload: CreationRequest
) -> tuple[Output, OutputVersion, ContentPackage, list[str]]:
    agent, brand, credential, model = await _resolve(
        db, payload.brand_slug, payload.model, payload.provider
    )
    profile = _brand_profile_text(brand.slug)
    guide_file = _format_guide_file(payload.channel, payload.format)
    format_guide = _safe_read("cocreation", "formats", guide_file)
    visual_rules = "\n\n".join(
        _safe_read("cocreation", "visual", name)
        for name in ("visual-direction.md", "image-prompt-engine.md", "negative-rules.md")
    )
    factuality = _safe_read("cocreation", "references", "factuality.md")
    rag_context = await build_rag_context(
        db=db, query=payload.theme, brand_slug=brand.slug, limit=6
    )
    research_context = await _research_context(db, payload.research_output_id)
    user_prompt = _user_prompt(
        brand, payload, profile, format_guide, visual_rules, factuality, rag_context,
        research_context,
    )
    pkg, provider, used_model, prompt = await _call_package(
        db, agent=agent, brand=brand, credential=credential, model=model,
        system_prompt=_system_prompt(read_agent_prompt("content_agent"), brand.slug),
        user_prompt=user_prompt,
    )
    pkg.brand_slug = brand.slug
    pkg.channel = payload.channel
    pkg.format = payload.format
    warnings = validate_package(pkg)
    output, version = await _persist_version(
        db, agent=agent, brand=brand, payload=payload, pkg=pkg, provider=provider,
        model=used_model, prompt=prompt, editor_note="Cocriacao — geracao inicial.", existing=None,
    )
    return output, version, pkg, warnings


def _load_package(version: OutputVersion) -> ContentPackage | None:
    if not version.structured_json:
        return None
    try:
        return ContentPackage.model_validate(json.loads(version.structured_json))
    except Exception:
        return None


async def refine_content_package(
    db: AsyncSession, output_id: int, payload: CocreationRefineRequest
) -> tuple[Output, OutputVersion, ContentPackage, list[str]]:
    output = await db.get(Output, output_id)
    if output is None:
        raise LLMConfigurationError("Conteudo nao encontrado.")
    version = (
        await db.get(OutputVersion, output.current_version_id)
        if output.current_version_id else None
    )
    pkg = _load_package(version) if version else None
    if pkg is None:
        raise LLMConfigurationError("Este conteudo nao tem pacote estruturado para refinar.")

    agent, brand, credential, model = await _resolve(
        db, output.brand_slug, payload.model, payload.provider
    )
    instruction = (payload.instruction or "").strip()
    focus = {
        "caption": f"Reescreva APENAS a legenda do canal '{payload.channel or 'instagram'}'.",
        "slide": f"Regenere APENAS o slide {payload.slide_number}.",
        "cta": "Reescreva APENAS o CTA.",
        "visual": "Reescreva APENAS a direcao visual (visual_direction).",
        "tone": "Ajuste APENAS o tom, preservando a estrutura.",
        "shorten": "Encurte o conteudo, preservando a estrutura e as secoes.",
        "persona": "Troque APENAS a persona e ajuste o minimo necessario.",
    }[payload.target]
    ask = (
        "Voce recebe um pacote de conteudo (JSON) ja aprovado. Faca uma alteracao PONTUAL e "
        "devolva o PACOTE INTEIRO em JSON valido, preservando tudo que nao foi pedido para mudar.\n"
        f"Alteracao: {focus} {instruction}\n"
        "Mantenha as regras: legendas de canais diferentes DIFERENTES; image_prompt independente "
        "e sem logo/@/#/marca.\n\n"
        f"Pacote atual:\n{json.dumps(pkg.model_dump(), ensure_ascii=False)}"
    )
    new_pkg, provider, used_model, prompt = await _call_package(
        db, agent=agent, brand=brand, credential=credential, model=model,
        system_prompt=_system_prompt(read_agent_prompt("content_agent"), brand.slug),
        user_prompt=ask,
    )
    new_pkg.brand_slug = pkg.brand_slug
    new_pkg.channel = pkg.channel
    new_pkg.format = pkg.format
    warnings = validate_package(new_pkg)
    payload_req = CreationRequest(
        brand_slug=output.brand_slug, theme=output.briefing, channel=output.channel,
        format=output.format, category=output.category, status=output.status,
    )
    output, version = await _persist_version(
        db, agent=agent, brand=brand, payload=payload_req, pkg=new_pkg, provider=provider,
        model=used_model, prompt=prompt,
        editor_note=f"Cocriacao — refino ({payload.target}).", existing=output,
    )
    return output, version, new_pkg, warnings
