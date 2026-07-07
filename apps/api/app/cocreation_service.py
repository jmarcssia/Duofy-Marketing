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
from app.briefing_filters import briefing_filters_to_prompt, normalize_briefing_filters
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
  "extra_pieces": [ { "kind": str, "label": str, "channel": str, "content": str } ],
  "factualidade": [str], "checklist": [str]
}"""

# Canais sociais cujas legendas entram em `captions` (chave minúscula no pacote).
_CAPTION_CHANNELS = {"instagram", "linkedin", "facebook", "tiktok"}

# Peças extras que o briefing pode pedir → instrução de geração por kind.
_EXTRA_PIECE_SPECS: dict[str, tuple[str, str]] = {
    "whatsapp": (
        "Mensagem WhatsApp",
        "mensagem CURTA de WhatsApp (2-5 linhas, tom direto e pessoal, sem hashtag), "
        "pronta para nutrição de leads; inclua uma variação alternativa após a linha "
        "'--- Alternativa ---'",
    ),
    "whatsapp_image_prompt": (
        "Prompt de imagem WhatsApp",
        "prompt visual COMPLETO e independente para uma imagem opcional de apoio à mensagem "
        "de WhatsApp (sem logo/@/#/marca)",
    ),
    "email": (
        "E-mail",
        "e-mail de nutrição com as linhas 'Assunto:', 'Preheader:', 'Corpo:' (2-4 parágrafos "
        "curtos) e 'CTA:' — nesta ordem",
    ),
    "blog": (
        "Blog post",
        "artigo de blog com estrutura (## subtítulos), introdução, desenvolvimento, conclusão "
        "e uma linha final 'SEO: palavra-chave foco + meta descrição'",
    ),
    "release": (
        "Release para imprensa",
        "release jornalístico (título, subtítulo, lide com o essencial, 2-3 parágrafos de "
        "desenvolvimento com aspas de porta-voz genérico, boilerplate da marca)",
    ),
    "pitch": (
        "Pitch para jornalista",
        "pitch curto e direto para jornalista (por que a pauta importa agora, ângulo "
        "editorial, o que a marca pode oferecer)",
    ),
    "landing_page": (
        "Landing page",
        "estrutura de landing page (headline, subheadline, blocos de benefício, prova social "
        "sem inventar números, CTA)",
    ),
}


# Canal selecionado no briefing → kind de peça extra correspondente.
_CHANNEL_TO_KIND = {
    "whatsapp": "whatsapp",
    "e-mail": "email",
    "email": "email",
    "blog": "blog",
    "release": "release",
    "pitch": "pitch",
    "landing page": "landing_page",
    "landing_page": "landing_page",
}


def requested_caption_channels(payload: CreationRequest) -> list[str]:
    """Canais sociais (minúsculos) que devem ter legenda própria no pacote.

    Sem multicanal explícito (`channels` vazio), mantém o comportamento clássico:
    Instagram e LinkedIn sempre presentes e diferentes entre si.
    """
    seen: list[str] = []
    for item in (payload.channel, *payload.channels):
        key = (item or "").strip().lower()
        if key in _CAPTION_CHANNELS and key not in seen:
            seen.append(key)
    if not payload.channels:
        for default in ("instagram", "linkedin"):
            if default not in seen:
                seen.append(default)
    return seen


def requested_extra_kinds(payload: CreationRequest) -> list[str]:
    """Kinds de peças extras pedidos no briefing (via `pieces` e/ou canais não-sociais)."""
    seen: list[str] = []
    for piece in payload.pieces:
        key = (piece or "").strip().lower()
        if key in _EXTRA_PIECE_SPECS and key not in seen:
            seen.append(key)
    for item in (payload.channel, *payload.channels):
        kind = _CHANNEL_TO_KIND.get((item or "").strip().lower())
        if kind and kind not in seen:
            seen.append(kind)
    return seen


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
    caption_channels = requested_caption_channels(payload)
    extra_kinds = requested_extra_kinds(payload)
    caption_rule = (
        "- captions: as legendas de canais DIFERENTES devem ser DIFERENTES entre si."
        " Instagram = proximo, leitura rapida, paragrafos curtos, CTA de interacao/salvamento."
        " LinkedIn = executivo, tese, analise, implicacao de negocio, CTA profissional."
        f" Inclua EXATAMENTE estas chaves em captions: {', '.join(caption_channels)}."
        if caption_channels
        else "- captions: deixe o objeto vazio ({}) — nenhum canal social foi selecionado."
    )
    extra_rules: list[str] = []
    if extra_kinds:
        extra_rules.append(
            "- extra_pieces: gere UMA peça por item abaixo (campo 'kind' EXATAMENTE como"
            " indicado, 'label' amigavel, 'channel' do canal correspondente, 'content' com o"
            " texto completo da peça):"
        )
        for kind in extra_kinds:
            label, spec = _EXTRA_PIECE_SPECS[kind]
            extra_rules.append(f"  - kind '{kind}' ({label}): {spec}.")
    else:
        extra_rules.append("- extra_pieces: deixe a lista vazia ([]).")
    lines = [
        "Gere UM pacote de conteudo profissional e retorne SOMENTE um objeto JSON valido "
        "(sem texto ao redor, sem ```), exatamente neste formato:",
        _PACKAGE_SHAPE,
        "",
        "JSON valido e obrigatorio: escape aspas internas com \\\" e nao use quebras de linha "
        "literais dentro de valores string (use \\n). Para citacoes no texto, prefira aspas "
        "tipograficas (« ») em vez de aspas retas.",
        "",
        "Regras de saida:",
        caption_rule,
        *extra_rules,
        "- Se o formato for carrossel: 'slides' com um objeto por slide, cada um com FUNCAO"
        " narrativa (o conteudo evolui de um slide para o proximo), 'texto' exato do slide,"
        " 'texto_arte' curto e legivel, e um 'image_prompt' COMPLETO e INDEPENDENTE."
        " O MESMO carrossel serve para todos os canais sociais selecionados — o que muda"
        " por canal e a legenda.",
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
        f"- Canal principal: {payload.channel} | Formato: {payload.format}",
        *(
            [f"- Canais selecionados: {', '.join(payload.channels)}"]
            if payload.channels
            else []
        ),
        f"- Persona: {payload.persona or '(inferir)'}",
        f"- Objetivo: {payload.objetivo or '(inferir)'}",
        f"- CTA: {payload.cta or '(inferir)'}",
        f"- Nº de slides: {payload.slides or '(decidir pelo arco)'}",
        f"- Profundidade: {payload.depth} | Tom: {payload.tone or '(voz da marca)'}",
        f"- Observacoes: {payload.observacoes or '-'}",
    ]
    filters_text = briefing_filters_to_prompt(payload.briefing_filters)
    if filters_text:
        lines += ["", "Briefing estruturado (filtros escolhidos — respeite-os):", filters_text]
    if payload.previous_content:
        lines += ["", "Conteudo anterior para reaproveitar/reconstruir (nao apenas recortar):",
                  payload.previous_content[:6000]]
    return "\n".join(lines)


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")


def _escape_bare_controls(text: str) -> str:
    """Escapa quebras de linha/tabs literais que aparecem DENTRO de strings JSON.

    Modelos as vezes inserem \\n cru dentro de um valor string, o que invalida o JSON.
    Percorre o texto rastreando se estamos dentro de uma string e escapa os controles crus.
    """
    out: list[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if escaped:
            out.append(ch)
            escaped = False
            continue
        if ch == "\\":
            out.append(ch)
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            out.append(ch)
            continue
        if in_string and ch == "\n":
            out.append("\\n")
        elif in_string and ch == "\r":
            out.append("\\r")
        elif in_string and ch == "\t":
            out.append("\\t")
        else:
            out.append(ch)
    return "".join(out)


def _extract_json(raw: str) -> dict:
    """Extrai um objeto JSON tolerando os erros comuns de LLM (fences, virgula final,
    controles crus dentro de strings). Levanta ValueError se nao houver JSON recuperavel."""
    text = _FENCE_RE.sub("", (raw or "").strip())
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Resposta sem JSON.")
    candidate = text[start : end + 1]
    for attempt in (
        candidate,
        _TRAILING_COMMA_RE.sub(r"\1", candidate),
        _escape_bare_controls(candidate),
        _TRAILING_COMMA_RE.sub(r"\1", _escape_bare_controls(candidate)),
    ):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    # Ultima tentativa: expor o erro real para o chamador decidir (retry/reparo).
    return json.loads(candidate)


def validate_package(
    pkg: ContentPackage, payload: CreationRequest | None = None
) -> list[str]:
    warnings: list[str] = []
    caps = {k.lower(): v for k, v in pkg.captions.items()}
    expected_captions = (
        requested_caption_channels(payload) if payload else ["instagram", "linkedin"]
    )
    for channel in expected_captions:
        if not caps.get(channel, "").strip():
            warnings.append(f"Legenda de {channel.capitalize()} ausente.")
    seen_caps: dict[str, str] = {}
    for channel in expected_captions:
        text = caps.get(channel, "").strip()
        if not text:
            continue
        for other, other_text in seen_caps.items():
            if text == other_text:
                warnings.append(
                    f"{other.capitalize()} e {channel.capitalize()} com a mesma legenda "
                    "(devem diferir)."
                )
        seen_caps[channel] = text
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
    if payload is not None:
        generated_kinds = {piece.kind.strip().lower() for piece in pkg.extra_pieces}
        for kind in requested_extra_kinds(payload):
            if kind not in generated_kinds:
                label = _EXTRA_PIECE_SPECS[kind][0]
                warnings.append(f"Peça solicitada não gerada: {label} ({kind}).")
    for piece in pkg.extra_pieces:
        if piece.kind.strip().lower() == "whatsapp_image_prompt" and has_forbidden_prompt(
            piece.content
        ):
            warnings.append(
                "Prompt de imagem do WhatsApp contem termo proibido (logo/@/#/marca)."
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


def _md_extra_pieces(pkg: ContentPackage) -> list[str]:
    if not pkg.extra_pieces:
        return []
    out: list[str] = ["## Peças extras"]
    for piece in pkg.extra_pieces:
        suffix = f" ({piece.channel})" if piece.channel else ""
        out += [f"### {piece.label or piece.kind}{suffix}", piece.content.strip() or "—", ""]
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
        *_md_extra_pieces(pkg),
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
    """Contexto da pesquisa aprovada para a cocriação: usa o briefing estruturado da pesquisa
    (quando houver) + o relatório. Se o briefing_json for insuficiente, usa o conteúdo do output."""
    if research_output_id is None:
        return ""
    output = await db.get(Output, research_output_id)
    if output is None or output.channel != "Pesquisa":
        return ""
    version = None
    if output.current_version_id is not None:
        version = await db.get(OutputVersion, output.current_version_id)
    content = (version.content if version else "") or ""
    parts = [f"Pesquisa #{output.id} — {output.title}"]
    briefing = getattr(output, "briefing_json", None)
    if isinstance(briefing, dict) and briefing:
        bf = briefing_filters_to_prompt(briefing)
        if bf:
            parts.append("Briefing da pesquisa (filtros escolhidos):\n" + bf)
    fallback = "(relatório de pesquisa sem texto disponível)"
    parts.append(content[:9000] if content.strip() else fallback)
    return "\n\n".join(parts)


def _is_empty_package(pkg: ContentPackage) -> bool:
    """True quando o pacote não tem NENHUM conteúdo aproveitável (slides/legendas/extras)."""
    has_slides = bool(pkg.slides)
    has_caption = any((v or "").strip() for v in (pkg.captions or {}).values())
    has_extra = any((p.content or "").strip() for p in (pkg.extra_pieces or []))
    return not (has_slides or has_caption or has_extra)


def _to_package(data: dict, brand: Brand) -> ContentPackage:
    data.setdefault("brand_slug", brand.slug)
    data.setdefault("channel", "")  # o chamador sobrescreve com o valor do payload
    data.setdefault("format", "")
    return ContentPackage.model_validate(data)


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
    """Chama o LLM e devolve um pacote valido, tolerando o JSON as vezes malformado que o
    modo JSON via OpenRouter/Claude nao garante. Estrategia: (1) gera; (2) regera com instrucao
    corretiva; (3) chamada dedicada de REPARO do texto cru para JSON valido. Retorna
    (pkg, provider, model, prompt_usado)."""
    budget = max(await get_token_budget(db, "content_agent"), 12000)
    attempt_prompt = user_prompt
    last_error = ""
    last_raw = ""
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
        last_raw = result.output
        try:
            pkg = _to_package(_extract_json(result.output), brand)
            return pkg, result.provider, result.model, attempt_prompt
        except Exception as exc:  # noqa: BLE001 - trata na proxima tentativa/reparo
            last_error = str(exc)[:200]
            attempt_prompt = (
                user_prompt
                + "\n\nATENCAO: sua resposta anterior nao era JSON valido. Retorne SOMENTE um "
                "objeto JSON valido no formato pedido, sem texto fora do JSON, escapando aspas "
                'internas com \\" e sem quebras de linha literais dentro de valores string.'
            )

    # Reparo final: pede ao modelo para consertar o proprio texto cru em JSON valido.
    repair = await call_llm(
        credential=credential,
        model=model,
        system_prompt="Voce conserta JSON. Devolva SOMENTE um objeto JSON valido, sem "
        "comentarios, sem ```; preserve todo o conteudo, apenas corrija a sintaxe.",
        user_prompt="Converta o texto abaixo em um objeto JSON valido e completo, escapando "
        'aspas internas com \\" e quebras de linha com \\n:\n\n' + last_raw,
        task_type="cocreation",
        agent_slug=agent.slug,
        brand_slug=brand.slug,
        json_mode=True,
        max_tokens=budget,
    )
    try:
        pkg = _to_package(_extract_json(repair.output), brand)
        return pkg, repair.provider, repair.model, attempt_prompt
    except Exception as exc:  # noqa: BLE001
        last_error = str(exc)[:200] or last_error
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
            briefing_json=normalize_briefing_filters(payload.briefing_filters),
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
    # F9: rejeita pacote vazio (o LLM às vezes devolve {}), que validaria e travaria o gate de
    # aprovação por peças (zero peças derivadas). Melhor falhar claro do que persistir vazio.
    if _is_empty_package(pkg):
        raise LLMConfigurationError(
            "O agente retornou um pacote vazio. Revise o briefing/filtros e gere novamente."
        )
    warnings = validate_package(pkg, payload)
    output, version = await _persist_version(
        db, agent=agent, brand=brand, payload=payload, pkg=pkg, provider=provider,
        model=used_model, prompt=prompt, editor_note="Cocriacao — geracao inicial.", existing=None,
    )
    # F2b: explode o pacote em peças aprovaveis individualmente.
    from app.content_pieces_service import explode_package_into_pieces

    await explode_package_into_pieces(db, output, pkg)
    await db.commit()
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
    # Ajuste orientado pelo Guardião (F2): injeta as recomendações da avaliação + nota humana.
    guardian_block = ""
    if payload.use_guardian_feedback:
        from app.quality_guardian import latest_review_feedback

        guardian_block = await latest_review_feedback(db, output)
    human_note = (payload.human_note or "").strip()
    focus = {
        "caption": f"Reescreva APENAS a legenda do canal '{payload.channel or 'instagram'}'.",
        "slide": f"Regenere APENAS o slide {payload.slide_number}.",
        "cta": "Reescreva APENAS o CTA.",
        "visual": "Reescreva APENAS a direcao visual (visual_direction).",
        "tone": "Ajuste APENAS o tom, preservando a estrutura.",
        "shorten": "Encurte o conteudo, preservando a estrutura e as secoes.",
        "persona": "Troque APENAS a persona e ajuste o minimo necessario.",
        "guardian": (
            "Aplique as correcoes recomendadas ao PACOTE INTEIRO, preservando o que ja esta bom "
            "e mantendo canais/pecas. Corrija tom, CTA, persona, factualidade e aderencia a marca."
        ),
    }[payload.target]
    correcao = ""
    if guardian_block:
        correcao += f"\n\nCorrija os pontos apontados pelo Guardião de Qualidade:\n{guardian_block}"
    if human_note:
        correcao += f"\n\nObservação da gestora (priorize): {human_note}"
    ask = (
        "Voce recebe um pacote de conteudo (JSON) ja aprovado. Faca uma alteracao PONTUAL e "
        "devolva o PACOTE INTEIRO em JSON valido, preservando tudo que nao foi pedido para mudar.\n"
        f"Alteracao: {focus} {instruction}"
        f"{correcao}\n"
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
    await db.commit()
    # F1/F2: o Guardião REAVALIA a nova versão (não é loop — só o humano dispara o próximo refino).
    from app.quality_guardian import run_guardian_after_generation

    await run_guardian_after_generation(db, output)
    return output, version, new_pkg, warnings
