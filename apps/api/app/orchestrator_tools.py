from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar_service import generate_calendar_events, generate_press_output
from app.content_generation import generate_content_output
from app.quality_guardian import review_output_quality
from app.rag import build_rag_context
from app.research_service import run_market_research
from app.schemas import (
    CalendarGenerateRequest,
    ContentGenerateRequest,
    PressGenerateRequest,
    ResearchRunRequest,
)

LogFn = Callable[[str], Awaitable[None]]


async def _submit_to_guardian(db: AsyncSession, output) -> str:
    review = await review_output_quality(db, output, force=True)
    output.status = "review" if review.passed else "needs_adjustment"
    return f"score {review.score}/100, status {output.status}"


def build_tools(
    db: AsyncSession,
    *,
    brand_slug: str,
    task_id: int,
    log: LogFn,
) -> list[StructuredTool]:
    async def research_market(
        theme: str,
        period: str = "ultimos 30 dias",
        depth: str = "quick",
    ) -> str:
        await log(f"Pesquisando: {theme}")
        output = await run_market_research(
            db,
            ResearchRunRequest(
                brand_slug=brand_slug,
                theme=theme[:255],
                period=period,
                depth=depth,  # type: ignore[arg-type]
            ),
        )
        return f"Pesquisa concluida. Output #{output.id} (relatorio de mercado salvo)."

    async def create_content(
        channel: str,
        format: str,
        briefing: str,
        category: str = "general",
    ) -> str:
        await log(f"Gerando conteudo: {format} / {channel}")
        output = await generate_content_output(
            db,
            ContentGenerateRequest(
                brand_slug=brand_slug,
                category=category,
                channel=channel,
                format=format,
                briefing=briefing.ljust(10),
                status="draft",
            ),
        )
        guardian = await _submit_to_guardian(db, output)
        return f"Conteudo criado. Output #{output.id} ({guardian})."

    async def create_press(
        format: str,
        briefing: str,
        category: str = "general",
    ) -> str:
        await log(f"Gerando assessoria: {format}")
        output = await generate_press_output(
            db,
            PressGenerateRequest(
                brand_slug=brand_slug,
                category=category,
                format=format,  # type: ignore[arg-type]
                briefing=briefing,
                status="draft",  # type: ignore[call-arg]
            ),
        )
        guardian = await _submit_to_guardian(db, output)
        return f"Press criado. Output #{output.id} ({guardian})."

    async def create_calendar(
        objective: str,
        period_days: int = 14,
        channels: list[str] | None = None,
        category: str = "general",
    ) -> str:
        await log(f"Gerando calendario: {objective}")
        now = datetime.now(UTC)
        events = await generate_calendar_events(
            db,
            CalendarGenerateRequest(
                brand_slug=brand_slug,
                category=category,
                objective=objective,
                period_start=now,
                period_end=now + timedelta(days=period_days),
                channels=channels or ["LinkedIn", "Instagram", "Assessoria"],
            ),
        )
        linhas = "; ".join(f"#{e.id} {e.title}" for e in events)
        return f"Calendario criado com {len(events)} eventos: {linhas}"

    async def search_memory(query: str) -> str:
        await log(f"Consultando memoria: {query}")
        context = await build_rag_context(db=db, query=query, brand_slug=brand_slug)
        return context or "Nenhum trecho relevante encontrado na memoria."

    return [
        StructuredTool.from_function(
            coroutine=research_market,
            name="research_market",
            description=(
                "Pesquisa de mercado: coleta fontes externas e gera um relatorio."
                " Use quando o pedido envolver mercado, concorrencia, tendencias ou noticias."
            ),
        ),
        StructuredTool.from_function(
            coroutine=create_content,
            name="create_content",
            description=(
                "Gera conteudo (post, carrossel, artigo) como rascunho e envia ao Guardiao."
                " 'channel' ex: LinkedIn, Instagram. 'format' ex: 'Post LinkedIn', 'Carrossel'."
            ),
        ),
        StructuredTool.from_function(
            coroutine=create_press,
            name="create_press",
            description=(
                "Gera material de assessoria de imprensa (release/pauta/comunicado)"
                " como rascunho e envia ao Guardiao."
            ),
        ),
        StructuredTool.from_function(
            coroutine=create_calendar,
            name="create_calendar",
            description=(
                "Gera um calendario editorial com eventos para um periodo (period_days)."
                " Use quando o pedido for sobre agenda/cronograma/calendario."
            ),
        ),
        StructuredTool.from_function(
            coroutine=search_memory,
            name="search_memory",
            description=(
                "Consulta a memoria/documentos da marca (RAG)."
                " Use para se contextualizar antes de criar algo. Nao cria nada."
            ),
        ),
    ]
