"""F2b — peças/subpeças aprovaveis por peça.

Um Output de cocriacao carrega um ContentPackage (slides, legendas, direcao visual). Aqui ele e
"explodido" em PECAS aprovaveis individualmente, e permitimos PECAS MANUAIS (WhatsApp, e-mail,
blog, release...). Quando as pecas OBRIGATORIAS ficam aprovadas, o proprio Output vira 'approved'
(mesmo status/decisao de sempre — sem 2o sistema de aprovacao); se uma obrigatoria e rejeitada, o
Output volta a 'review'.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContentPiece, Output, OutputDecision, User
from app.schemas import ContentPackage

PIECE_STATUSES = ("pending", "approved", "rejected")
# Tipos manuais suportados (alem dos derivados do pacote).
MANUAL_KINDS = (
    "whatsapp", "whatsapp_image_prompt", "email", "blog", "release", "pitch",
    "landing_page", "custom",
)

# Nome de exibição dos canais sociais nas peças de legenda.
_CHANNEL_LABELS = {
    "instagram": "Instagram",
    "linkedin": "LinkedIn",
    "facebook": "Facebook",
    "tiktok": "TikTok",
}


def _slides_to_text(pkg: ContentPackage) -> str:
    out: list[str] = []
    for slide in pkg.slides:
        out.append(
            f"Slide {slide.numero} — {slide.funcao}\n{slide.texto}\n"
            f"Arte: {slide.texto_arte}\nPrompt: {slide.image_prompt}"
        )
    return "\n\n".join(out).strip()


def _visual_to_text(pkg: ContentPackage) -> str:
    vd = pkg.visual_direction
    fields = [
        ("Conceito", vd.conceito), ("Estilo", vd.estilo), ("Cenário", vd.cenario),
        ("Enquadramento", vd.enquadramento), ("Composição", vd.composicao),
        ("Iluminação", vd.iluminacao), ("Paleta", vd.paleta), ("Tipografia", vd.tipografia),
        ("Restrições", vd.restricoes),
    ]
    return "\n".join(f"{k}: {v}" for k, v in fields if v).strip()


def _derive_specs(pkg: ContentPackage) -> list[dict]:
    """Peças derivadas do pacote (com obrigatoriedade e ordem)."""
    specs: list[dict] = []
    if pkg.slides:
        specs.append({"kind": "carousel", "label": "Carrossel", "channel": pkg.channel,
                      "content": _slides_to_text(pkg), "required": True})
    for channel_key, caption in pkg.captions.items():
        if not (caption or "").strip():
            continue
        key = channel_key.strip().lower()
        label = _CHANNEL_LABELS.get(key, channel_key.strip())
        specs.append({"kind": f"caption_{key}", "label": f"Legenda {label}",
                      "channel": label, "content": caption, "required": True})
    for piece in pkg.extra_pieces:
        if not (piece.content or "").strip():
            continue
        kind = (piece.kind or "custom").strip().lower()
        if kind not in MANUAL_KINDS and not kind.startswith("caption_"):
            kind = "custom"
        specs.append({"kind": kind, "label": piece.label or kind,
                      "channel": piece.channel, "content": piece.content,
                      "required": bool(piece.required)})
    visual = _visual_to_text(pkg)
    if visual:
        specs.append({"kind": "visual_direction", "label": "Direção visual", "channel": None,
                      "content": visual, "required": False})
    return specs


async def explode_package_into_pieces(
    db: AsyncSession, output: Output, pkg: ContentPackage
) -> list[ContentPiece]:
    """Cria as peças derivadas do pacote (idempotente: só cria se ainda não houver peças)."""
    existing = (
        await db.execute(select(ContentPiece).where(ContentPiece.output_id == output.id))
    ).scalars().first()
    if existing is not None:
        return await list_pieces(db, output.id)
    pieces: list[ContentPiece] = []
    for position, spec in enumerate(_derive_specs(pkg)):
        piece = ContentPiece(
            output_id=output.id, brand_slug=output.brand_slug, kind=spec["kind"],
            label=spec["label"], channel=spec["channel"], content=spec["content"],
            required=spec["required"], origin="derived", position=position, status="pending",
        )
        db.add(piece)
        pieces.append(piece)
    return pieces


async def list_pieces(db: AsyncSession, output_id: int) -> list[ContentPiece]:
    rows = await db.execute(
        select(ContentPiece)
        .where(ContentPiece.output_id == output_id)
        .order_by(ContentPiece.position.asc(), ContentPiece.id.asc())
    )
    return list(rows.scalars().all())


async def get_piece(db: AsyncSession, piece_id: int) -> ContentPiece | None:
    return await db.get(ContentPiece, piece_id)


async def add_manual_piece(
    db: AsyncSession, output: Output, *, kind: str, label: str, channel: str | None,
    content: str, required: bool,
) -> ContentPiece:
    pieces = await list_pieces(db, output.id)
    piece = ContentPiece(
        output_id=output.id, brand_slug=output.brand_slug, kind=kind, label=label,
        channel=channel, content=content, required=required, origin="manual",
        position=len(pieces), status="pending",
    )
    db.add(piece)
    await db.flush()
    return piece


def required_pieces_approved(pieces: list[ContentPiece]) -> bool:
    """True se ha pecas e todas as OBRIGATORIAS estao aprovadas (sem obrigatorias, exige todas)."""
    if not pieces:
        return False
    required = [p for p in pieces if p.required] or pieces
    return all(p.status == "approved" for p in required)


async def content_review_complete(db: AsyncSession, output_id: int) -> bool:
    """Revisao do conteudo concluida. Com pecas: obrigatorias aprovadas. Sem pecas: fallback ao
    status do Output (retrocompat com conteudos antigos)."""
    pieces = await list_pieces(db, output_id)
    if not pieces:
        output = await db.get(Output, output_id)
        return output is not None and output.status == "approved"
    return required_pieces_approved(pieces)


async def _sync_output_status(db: AsyncSession, output: Output, user: User) -> None:
    """Alinha o status do Output ao estado das pecas (sem passar pelo guardiao — a aprovacao
    humana por peca E a revisao). Aprova quando obrigatorias ok; reverte a review caso contrario."""
    pieces = await list_pieces(db, output.id)
    complete = required_pieces_approved(pieces)
    if complete and output.status != "approved":
        output.status = "approved"
        db.add(OutputDecision(output_id=output.id, user_id=user.id, action="approved",
                              feedback="Todas as peças obrigatórias aprovadas."))
    elif not complete and output.status == "approved":
        output.status = "review"
        db.add(OutputDecision(output_id=output.id, user_id=user.id, action="revised",
                              feedback="Peça obrigatória deixou de estar aprovada."))


# Orientação de refino por tipo de peça (5b) — mantém o formato correto da peça.
_PIECE_REFINE_GUIDE: dict[str, str] = {
    "carousel": "roteiro de carrossel: um bloco por slide (função + texto + texto de arte),"
    " mantendo o arco narrativo e SEM pedir logo/@/# nas descrições visuais",
    "caption_instagram": "legenda de Instagram: próxima, leitura rápida, parágrafos curtos, CTA de"
    " interação/salvamento",
    "caption_linkedin": "legenda de LinkedIn: executiva, tese, análise, implicação de negócio, CTA"
    " profissional",
    "caption_facebook": "legenda de Facebook, tom próximo e direto",
    "caption_tiktok": "legenda curta de TikTok, informal e com gancho",
    "whatsapp": "mensagem CURTA de WhatsApp (2-5 linhas, direta e pessoal, sem hashtag); inclua uma"
    " variação após a linha '--- Alternativa ---'",
    "whatsapp_image_prompt": "prompt visual COMPLETO e independente para imagem de apoio"
    " (proporção, cenário, luz, composição), SEM logo, @, hashtag ou marca d'água",
    "email": "e-mail com as linhas 'Assunto:', 'Preheader:', 'Corpo:' e 'CTA:', nesta ordem",
    "blog": "artigo de blog com ## subtítulos, introdução, desenvolvimento e conclusão",
    "release": "release jornalístico (título, lide, desenvolvimento com aspas de porta-voz"
    " genérico, boilerplate)",
    "pitch": "pitch curto para jornalista (por que a pauta importa agora, ângulo, oferta)",
    "landing_page": "estrutura de landing page (headline, subheadline, blocos de benefício, CTA)",
    "visual_direction": "direção visual (conceito, estilo, cenário, enquadramento, composição, luz,"
    " paleta, tipografia, restrições), sem pedir logo/@/#",
}


async def refine_content_piece(
    db: AsyncSession, piece: ContentPiece, instruction: str, user: User,
    *, model: str | None = None, provider: str | None = None,
) -> ContentPiece:
    """Regenera SÓ o texto desta peça via LLM, conforme a instrução, e volta ao status 'pending'
    (força re-aprovação; se era obrigatória, o Output reverte a 'review'). Não toca no pacote."""
    from app.agent_config import brand_voice_section, read_agent_prompt
    from app.cocreation_service import _resolve, has_forbidden_prompt
    from app.llm import call_llm

    agent, brand, credential, resolved_model = await _resolve(
        db, piece.brand_slug, model, provider
    )
    guide = _PIECE_REFINE_GUIDE.get(piece.kind, "peça de conteúdo, mantendo o formato original")
    system_prompt = "\n".join([
        read_agent_prompt("content_agent"),
        "Você refina UMA peça de conteúdo já existente. Reescreva apenas esta peça conforme a"
        " instrução, preservando o formato dela. Não invente produto/número/case sem fonte."
        " Nunca peça logo, @, hashtag ou marca d'água em prompts de imagem.",
        brand_voice_section(brand.slug),
    ])
    user_prompt = "\n".join([
        f"Tipo da peça: {piece.kind} — {guide}.",
        f"Canal: {piece.channel or '—'}.",
        "",
        "Conteúdo atual da peça:",
        piece.content or "(vazio)",
        "",
        f"Instrução de refino: {instruction.strip()}",
        "",
        "Retorne SOMENTE o novo texto da peça, sem comentários, sem ``` e sem título extra.",
    ])
    result = await call_llm(
        credential=credential, model=resolved_model,
        system_prompt=system_prompt, user_prompt=user_prompt,
        task_type="piece_refine", agent_slug=agent.slug, brand_slug=brand.slug,
    )
    new_content = (result.output or "").strip()
    if piece.kind in ("whatsapp_image_prompt", "visual_direction") and has_forbidden_prompt(
        new_content
    ):
        # segurança: não deixa entrar logo/@/# num prompt visual
        new_content += "\n(Restrições: sem logo, @, hashtag ou marca d'água.)"
    if new_content:
        piece.content = new_content
    piece.status = "pending"
    piece.decided_by = user.id
    output = await db.get(Output, piece.output_id)
    if output is not None:
        await _sync_output_status(db, output, user)
    await db.commit()
    await db.refresh(piece)
    return piece


async def set_piece_status(
    db: AsyncSession, piece: ContentPiece, status: str, user: User, note: str | None = None
) -> ContentPiece:
    if status not in ("approved", "rejected", "pending"):
        raise ValueError("Status de peça inválido.")
    piece.status = status
    piece.decided_by = user.id
    if note is not None:
        piece.notes = note
    output = await db.get(Output, piece.output_id)
    if output is not None:
        await _sync_output_status(db, output, user)
    await db.commit()
    await db.refresh(piece)
    return piece
