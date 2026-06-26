from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from urllib.parse import quote_plus, urlparse

import feedparser
import httpx
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import read_agent_prompt
from app.agent_limits import get_token_budget
from app.content_generation import _provider_for_model
from app.crypto import decrypt_secret
from app.document_formatting import normalize_document_content
from app.embeddings import embed_text, vector_to_sql
from app.llm import LLMConfigurationError, call_llm
from app.models import (
    Agent,
    AgentRun,
    Brand,
    MemoryEntry,
    Output,
    OutputVersion,
    ProviderCredential,
    ResearchSource,
    Source,
)
from app.rag import build_rag_context
from app.schemas import ResearchRunRequest

MAX_SOURCES = 8
REQUEST_TIMEOUT = 14
USER_AGENT = "DuofyResearchBot/1.0 (+http://localhost:3000)"


@dataclass(frozen=True)
class SourceCandidate:
    title: str
    url: str
    publisher: str | None = None
    published_at: str | None = None
    source_kind: str = "rss"


@dataclass(frozen=True)
class CollectedSource:
    title: str
    url: str
    publisher: str | None
    published_at: str | None
    reliability: str
    source_kind: str
    status: str
    evidence: str
    error: str | None = None


def _google_news_rss_url(theme: str, brand: Brand, period: str) -> str:
    query = quote_plus(f"{theme} {brand.niche} {period} Brasil")
    return f"https://news.google.com/rss/search?q={query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"


def _publisher_from_url(url: str) -> str | None:
    host = urlparse(url).netloc.lower().replace("www.", "")
    return host or None


def _reliability(url: str, publisher: str | None, status: str) -> str:
    if status != "collected":
        return "D"
    host = (publisher or _publisher_from_url(url) or "").lower()
    if ".gov.br" in host or host.endswith(".gov") or "anp.gov.br" in host:
        return "A"
    recognized = [
        "valor.globo.com",
        "globo.com",
        "uol.com.br",
        "folha.uol.com.br",
        "estadao.com.br",
        "exame.com",
        "abrafati.com.br",
        "sebrae.com.br",
        "ibge.gov.br",
    ]
    if any(item in host for item in recognized):
        return "B"
    if host:
        return "C"
    return "D"


def _plain_text_from_html(html: str) -> str:
    extracted = trafilatura.extract(html, include_comments=False, include_tables=False)
    if extracted:
        return extracted.strip()
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return " ".join(soup.get_text(" ").split())


def _evidence_excerpt(text: str) -> str:
    return " ".join(text.split())[:1800]


async def _fetch_url_text(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
    return _plain_text_from_html(response.text)


async def _fetch_with_playwright(url: str) -> str:
    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        raise RuntimeError("Playwright nao esta instalado no ambiente da API.") from exc

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page(user_agent=USER_AGENT)
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=REQUEST_TIMEOUT * 1000)
            html = await page.content()
        finally:
            await browser.close()
    return _plain_text_from_html(html)


async def _rss_candidates(theme: str, brand: Brand, period: str) -> list[SourceCandidate]:
    feed_url = _google_news_rss_url(theme, brand, period)
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(feed_url)
        response.raise_for_status()
    feed = feedparser.parse(response.text)
    candidates: list[SourceCandidate] = []
    for entry in feed.entries[: MAX_SOURCES * 2]:
        url = str(entry.get("link", "")).strip()
        if not url:
            continue
        candidates.append(
            SourceCandidate(
                title=str(entry.get("title", "Fonte sem titulo")).strip(),
                url=url,
                publisher=str(entry.get("source", {}).get("title", "") or "") or None,
                published_at=str(entry.get("published", "") or "") or None,
                source_kind="rss",
            )
        )
    return candidates


async def _apify_candidates(
    db: AsyncSession,
    payload: ResearchRunRequest,
    brand: Brand,
) -> list[SourceCandidate]:
    if not payload.use_apify:
        return []
    result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == "apify")
    )
    credential = result.scalar_one_or_none()
    if credential is None or not credential.is_enabled or not credential.api_key_encrypted:
        return []

    api_key = decrypt_secret(credential.api_key_encrypted)
    endpoint = (
        "https://api.apify.com/v2/acts/apify~google-search-scraper/"
        "run-sync-get-dataset-items"
    )
    body = {
        "queries": f"{payload.theme} {brand.niche} Brasil",
        "maxPagesPerQuery": 1,
        "resultsPerPage": 5,
        "languageCode": "pt-br",
        "countryCode": "br",
    }
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                endpoint,
                params={"token": api_key},
                json=body,
            )
            response.raise_for_status()
        items = response.json()
    except Exception:
        return []

    candidates: list[SourceCandidate] = []
    for item in items[:MAX_SOURCES]:
        url = str(item.get("url") or item.get("link") or "").strip()
        if not url:
            continue
        candidates.append(
            SourceCandidate(
                title=str(item.get("title") or "Resultado Apify").strip(),
                url=url,
                publisher=_publisher_from_url(url),
                source_kind="apify",
            )
        )
    return candidates


def _dedupe_candidates(candidates: list[SourceCandidate]) -> list[SourceCandidate]:
    seen: set[str] = set()
    unique: list[SourceCandidate] = []
    for candidate in candidates:
        if candidate.url in seen:
            continue
        seen.add(candidate.url)
        unique.append(candidate)
        if len(unique) >= MAX_SOURCES:
            break
    return unique


async def _collect_candidate(
    candidate: SourceCandidate,
    use_playwright: bool,
) -> CollectedSource:
    publisher = candidate.publisher or _publisher_from_url(candidate.url)
    try:
        text = await _fetch_url_text(candidate.url)
        source_kind = "http" if candidate.source_kind == "rss" else candidate.source_kind
        if len(text) < 450 and use_playwright:
            text = await _fetch_with_playwright(candidate.url)
            source_kind = "playwright"
        evidence = _evidence_excerpt(text)
        status = "collected" if evidence else "failed"
        error = None if evidence else "Fonte sem texto extraivel."
    except Exception as exc:
        evidence = ""
        status = "failed"
        error = str(exc)[:800]
        source_kind = candidate.source_kind

    return CollectedSource(
        title=candidate.title[:500],
        url=candidate.url,
        publisher=publisher,
        published_at=candidate.published_at,
        reliability=_reliability(candidate.url, publisher, status),
        source_kind=source_kind,
        status=status,
        evidence=evidence,
        error=error,
    )


async def collect_research_sources(
    db: AsyncSession,
    payload: ResearchRunRequest,
    brand: Brand,
) -> list[CollectedSource]:
    candidates = [
        SourceCandidate(
            title=f"Fonte informada: {_publisher_from_url(url) or url}",
            url=url,
            publisher=_publisher_from_url(url),
            source_kind="manual",
        )
        for url in payload.source_urls
    ]
    try:
        candidates.extend(await _rss_candidates(payload.theme, brand, payload.period))
    except Exception as exc:
        candidates.append(
            SourceCandidate(
                title=f"Google News RSS indisponivel: {exc}",
                url=_google_news_rss_url(payload.theme, brand, payload.period),
                publisher="Google News RSS",
                source_kind="rss",
            )
        )
    candidates.extend(await _apify_candidates(db, payload, brand))

    unique = _dedupe_candidates(candidates)
    use_playwright = payload.depth == "deep"
    return [await _collect_candidate(candidate, use_playwright) for candidate in unique]


def _sources_block(sources: list[CollectedSource]) -> str:
    if not sources:
        return "Nenhuma fonte externa foi coletada."
    blocks = []
    for index, source in enumerate(sources, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[Fonte {index}] {source.title}",
                    f"URL: {source.url}",
                    f"Publisher: {source.publisher or 'desconhecido'}",
                    f"Publicado em: {source.published_at or 'nao informado'}",
                    f"Confiabilidade: {source.reliability}",
                    f"Status: {source.status}",
                    f"Evidencia: {source.evidence or source.error or 'sem evidencia'}",
                ]
            )
        )
    return "\n\n".join(blocks)


def _system_prompt(agent_prompt: str) -> str:
    return "\n".join(
        [
            agent_prompt,
            "",
            "Contexto operacional:",
            f"- Data atual do sistema: {date.today().isoformat()}.",
            "- Sintetize apenas a partir das fontes, memoria e limitacoes informadas.",
            "- Nao invente URLs, datas, fontes ou numeros.",
        ]
    )


def _user_prompt(
    brand: Brand,
    payload: ResearchRunRequest,
    sources: list[CollectedSource],
    rag_context: str,
) -> str:
    return "\n".join(
        [
            "Gere um relatorio de pesquisa de mercado estruturado.",
            "",
            "Dados da marca:",
            f"- Nome: {brand.name}",
            f"- Slug: {brand.slug}",
            f"- Nicho: {brand.niche}",
            f"- Descricao: {brand.description}",
            "",
            "Escopo da pesquisa:",
            f"- Tema: {payload.theme}",
            f"- Periodo: {payload.period}",
            f"- Profundidade: {payload.depth}",
            "",
            "Memoria RAG relevante:",
            rag_context or "Nenhuma memoria relevante encontrada.",
            "",
            "Fontes externas analisadas:",
            _sources_block(sources),
            "",
            "Formato obrigatorio:",
            "- Titulo",
            "- Marca, nicho, tema e periodo",
            "- Resumo executivo",
            "- Fontes analisadas",
            "- Sinais de mercado",
            "- Oportunidades",
            "- Concorrentes observados",
            "- Riscos",
            "- Recomendacoes",
            "- Sugestoes de pauta",
            "- Proximas acoes",
            "- Limitacoes da pesquisa",
        ]
    )


def _derive_title(theme: str, content: str) -> str:
    for line in content.splitlines():
        cleaned = line.strip().strip("#").strip()
        if cleaned:
            return cleaned[:255]
    return f"Pesquisa de mercado - {theme}"[:255]


async def run_market_research(
    db: AsyncSession,
    payload: ResearchRunRequest,
) -> Output:
    agent_result = await db.execute(select(Agent).where(Agent.slug == "research_agent"))
    agent = agent_result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente research_agent nao encontrado ou inativo.")

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

    collected_sources = await collect_research_sources(db, payload, brand)
    agent_prompt = read_agent_prompt("research_agent")
    rag_context = await build_rag_context(
        db=db,
        query=payload.theme,
        brand_slug=payload.brand_slug,
        category="research",
        limit=5,
    )
    user_prompt = _user_prompt(brand, payload, collected_sources, rag_context)

    budget = await get_token_budget(db, "research_agent")
    try:
        llm_result = await call_llm(
            credential=credential,
            model=credential.default_model or model,
            system_prompt=_system_prompt(agent_prompt),
            user_prompt=user_prompt,
            task_type="research_generation",
            agent_slug=agent.slug,
            brand_slug=brand.slug,
            max_tokens=budget,
        )
        title = _derive_title(payload.theme, llm_result.output)
        normalized_output = normalize_document_content(
            title=title,
            brand_slug=brand.slug,
            category="research",
            channel="Pesquisa",
            content_format="research_report",
            briefing=(
                f"Tema: {payload.theme}\n"
                f"Periodo: {payload.period}\n"
                f"Profundidade: {payload.depth}"
            ),
            content=llm_result.output,
            source_label="research_agent",
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
            category="research",
            channel="Pesquisa",
            format="research_report",
            title=_derive_title(payload.theme, normalized_output),
            briefing=(
                f"Tema: {payload.theme}\n"
                f"Periodo: {payload.period}\n"
                f"Profundidade: {payload.depth}"
            ),
            status="draft",
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
            editor_note="Relatório inicial do research_agent.",
        )
        db.add(version)
        await db.flush()
        output.current_version_id = version.id

        for source in collected_sources:
            db.add(
                ResearchSource(
                    output_id=output.id,
                    title=source.title,
                    url=source.url,
                    publisher=source.publisher,
                    published_at=source.published_at,
                    reliability=source.reliability,
                    source_kind=source.source_kind,
                    status=source.status,
                    evidence=source.evidence,
                    error=source.error,
                )
            )

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


async def save_research_as_memory(
    db: AsyncSession,
    output: Output,
    content: str,
) -> MemoryEntry:
    source = Source(
        name=f"Pesquisa: {output.title}",
        source_type="research_report",
        url=None,
    )
    db.add(source)
    await db.flush()
    memory_text = "\n\n".join(
        [
            f"Relatorio de pesquisa: {output.title}",
            output.briefing,
            content,
        ]
    )
    embedding = vector_to_sql(await embed_text(db, memory_text))
    memory = MemoryEntry(
        brand_slug=output.brand_slug,
        category="research",
        source_type="research_report",
        title=output.title,
        content=memory_text,
        source_id=source.id,
        embedding=embedding,
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory


def research_to_content_briefing(output: Output, content: str) -> str:
    return "\n".join(
        [
            f"Use a pesquisa '{output.title}' como base para uma entrega de conteudo.",
            "",
            "Resumo da pesquisa:",
            content[:4000],
            "",
            "Crie um conteudo com gancho claro, dor, solucao, CTA e observacoes de fonte.",
        ]
    )
