"""Cria e aprova briefings. Fase 2 (execucao) reusa run_market_research / run_agent."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Briefing, ResearchTheme, User
from app.orchestrator import run_agent
from app.orchestrator_planning import plan_task
from app.research_service import run_market_research
from app.schemas import ResearchRunRequest

# tipo do plano -> agent_slug executor (calendario cai no orquestrador single-shot em V1)
_AGENT_FOR_TIPO = {
    "conteudo": "content_agent",
    "imprensa": "press_agent",
    "calendario": "orchestrator",
}


async def _direct_answer(db: AsyncSession, prompt: str, brand_slug: str | None) -> str:
    run = await run_agent(db=db, agent_slug="orchestrator", prompt=prompt, brand_slug=brand_slug)
    return run.output or run.error or "(sem resposta)"


async def create_briefing(
    db: AsyncSession, *, user: User, prompt: str, brand_slug: str | None
) -> Briefing:
    plan = await plan_task(db, prompt=prompt, brand_slug=brand_slug)
    tipo = plan["tipo"]
    briefing = Briefing(
        user_id=user.id,
        brand_slug=brand_slug,
        request_text=prompt,
        tipo=tipo,
        objetivo=plan["objetivo"],
        resumo_plano=plan["resumo_do_plano"],
        agente_alvo=plan["agente_alvo"],
        tema_sugerido=plan["tema_sugerido"],
        status="pending",
    )
    if tipo == "conversa":
        answer = await _direct_answer(db, prompt, brand_slug)
        briefing.status = "answered"
        briefing.result_kind = "direct"
        # guardamos a resposta direta fora da tabela (retornada no schema); nao persistimos
        # texto longo aqui
        db.add(briefing)
        await db.commit()
        await db.refresh(briefing)
        briefing._direct_answer = answer  # type: ignore[attr-defined]  (campo efemero p/ o router)
        return briefing
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing


async def create_briefing_from_theme(
    db: AsyncSession, *, user: User, theme: ResearchTheme, brand_slug: str | None
) -> Briefing:
    briefing = Briefing(
        user_id=user.id,
        brand_slug=brand_slug or theme.brand_slug,
        request_text=f"Pesquisa a partir do tema: {theme.title}",
        tipo="pesquisa",
        objetivo=f"Pesquisar o tema '{theme.title}'.",
        resumo_plano=(theme.notes or f"Rodar pesquisa de mercado sobre {theme.title}."),
        agente_alvo="research",
        tema_sugerido=theme.title,
        status="pending",
        research_theme_id=theme.id,
    )
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing


async def create_blank_research_briefing(
    db: AsyncSession, *, user: User, brand_slug: str | None, theme: str | None = None
) -> Briefing:
    """Briefing de pesquisa em branco (entrada 'Nova pesquisa'): o usuario define o
    tema, o modelo e a profundidade no painel antes de aprovar."""
    title = (theme or "").strip() or None
    briefing = Briefing(
        user_id=user.id,
        brand_slug=brand_slug,
        request_text=f"Nova pesquisa de mercado: {title}" if title else "Nova pesquisa de mercado.",
        tipo="pesquisa",
        objetivo=(f"Pesquisar o tema '{title}'." if title else "Definir o tema da pesquisa."),
        resumo_plano="Escolha o tema (digite ou selecione do banco), o modelo e a profundidade.",
        agente_alvo="research",
        tema_sugerido=title,
        status="pending",
    )
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing


async def approve_briefing(
    db: AsyncSession,
    *,
    briefing: Briefing,
    model_override: str | None,
    research_theme_id: int | None,
    theme_override: str | None = None,
    depth: str | None = None,
) -> tuple[str, str | None, int | None]:
    """Executa a tarefa aprovada. model_override/theme_override/depth so valem para pesquisa.

    Retorna (answer, kind, id).
    """
    if briefing.tipo == "pesquisa":
        # Precedencia do tema: texto digitado no painel > tema do banco > tema sugerido.
        theme_id = research_theme_id or briefing.research_theme_id
        theme_title = (theme_override or "").strip() or briefing.tema_sugerido or ""
        if theme_id is not None:
            theme = await db.get(ResearchTheme, theme_id)
            if theme is not None:
                briefing.research_theme_id = theme.id
                if not theme_title:
                    theme_title = theme.title
        theme_title = theme_title or briefing.request_text
        briefing.tema_sugerido = theme_title[:255]
        briefing.model_override = model_override  # ja validado no router
        output = await run_market_research(
            db,
            ResearchRunRequest(
                brand_slug=briefing.brand_slug or "duofy_solucoes",
                theme=theme_title[:255],
                model=model_override,
                depth=depth or "quick",
            ),
        )
        answer = f"Pesquisa concluida. Relatorio #{output.id} salvo em Pesquisas."
        briefing.status = "executed"
        briefing.result_kind = "research_output"
        briefing.result_id = output.id
        await db.commit()
        await db.refresh(briefing)
        return answer, briefing.result_kind, briefing.result_id

    # nao-pesquisa: sem override de modelo
    agent_slug = _AGENT_FOR_TIPO.get(briefing.tipo, "orchestrator")
    prompt = briefing.request_text
    if briefing.objetivo:
        prompt = (
            f"{briefing.request_text}\n\n"
            f"Objetivo: {briefing.objetivo}\n"
            f"Plano: {briefing.resumo_plano}"
        )
    run = await run_agent(
        db=db, agent_slug=agent_slug, prompt=prompt, brand_slug=briefing.brand_slug
    )
    answer = run.output or run.error or "(sem resposta)"
    briefing.status = "executed" if run.status == "completed" else "failed"
    briefing.result_kind = "agent_run"
    briefing.result_id = run.id
    await db.commit()
    await db.refresh(briefing)
    return answer, briefing.result_kind, briefing.result_id
