from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import feedparser
import httpx
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import brand_voice_section, read_agent_prompt
from app.agent_limits import get_research_depth_limits, get_token_budget
from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    min_sources_for,
)
from app.crypto import decrypt_secret
from app.document_formatting import normalize_document_content
from app.embeddings import embed_text, vector_to_sql
from app.errors import InsufficientSourcesError
from app.llm import LLMConfigurationError, call_llm, provider_for_model
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

REQUEST_TIMEOUT = 14
USER_AGENT = "DuofyResearchBot/1.0 (+http://localhost:3000)"
# DuckDuckGo bloqueia UAs de bot; usa um UA de navegador para a busca web geral.
DDG_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class SourceCandidate:
    title: str
    url: str
    publisher: str | None = None
    published_at: str | None = None
    source_kind: str = "rss"
    summary: str | None = None


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


def _period_days(period: str) -> int:
    match = re.search(r"(\d+)", period or "")
    if match:
        value = int(match.group(1))
        if 1 <= value <= 365:
            return value
    return 30


def _google_news_rss_url(theme: str, brand: Brand, period: str) -> str:
    # Nao injeta o nicho (duplicava/estreitava a busca); a janela vem do operador when:Nd.
    days = _period_days(period)
    query = quote_plus(f"{theme} when:{days}d")
    return f"https://news.google.com/rss/search?q={query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"


def _decode_ddg_url(href: str) -> str:
    """DuckDuckGo HTML entrega links via redirect /l/?uddg=<url>. Devolve a URL real."""
    if "uddg=" in href:
        try:
            values = parse_qs(urlparse(href).query).get("uddg")
            if values:
                return unquote(values[0])
        except Exception:
            return href
    if href.startswith("//"):
        return "https:" + href
    return href


def parse_ddg_html(html: str, sources: int) -> list[SourceCandidate]:
    """Extrai candidatos do HTML do DuckDuckGo (title, url real, snippet)."""
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[SourceCandidate] = []
    for result in soup.select("div.result")[: sources * 2]:
        anchor = result.select_one("a.result__a")
        if anchor is None:
            continue
        url = _decode_ddg_url(str(anchor.get("href", "")).strip())
        if not url.startswith("http"):
            continue
        snippet_el = result.select_one("a.result__snippet") or result.select_one(".result__snippet")
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""
        candidates.append(
            SourceCandidate(
                title=(anchor.get_text(strip=True) or "Resultado DuckDuckGo")[:255],
                url=url,
                publisher=_publisher_from_url(url),
                source_kind="ddg",
                summary=snippet or None,
            )
        )
    return candidates


# Redes sociais e agregadores fracos para pesquisa: mantidos, porem ranqueados por ultimo
# (nao sao excluidos — a busca continua aberta, sem lista fixa de fontes).
_LOW_PRIORITY_DOMAINS = (
    "instagram.com", "facebook.com", "twitter.com", "x.com", "tiktok.com",
    "youtube.com", "pinterest.com", "linkedin.com",
)


def _candidate_priority(candidate: SourceCandidate) -> int:
    host = (_publisher_from_url(candidate.url) or "").lower()
    if any(dom in host for dom in _LOW_PRIORITY_DOMAINS):
        return 1  # redes sociais depois das fontes independentes
    return 0


def _rank_candidates(candidates: list[SourceCandidate]) -> list[SourceCandidate]:
    """Fontes independentes primeiro; redes sociais por ultimo (ordenacao estavel)."""
    return sorted(candidates, key=_candidate_priority)


async def _ddg_search(query: str, sources: int) -> list[SourceCandidate]:
    try:
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": DDG_USER_AGENT},
        ) as client:
            response = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query, "kl": "br-pt"},
            )
            response.raise_for_status()
    except Exception:
        return []
    return parse_ddg_html(response.text, sources)


async def _duckduckgo_candidates(theme: str, brand: Brand, sources: int) -> list[SourceCandidate]:
    """Busca web REAL e dinamica (sem chave, sem lista fixa) via DuckDuckGo HTML.

    Multiplas consultas focadas no TEMA (nao na marca) para amplitude e diversidade
    de fontes independentes.
    """
    queries = [
        theme,
        f"{theme} mercado dados estatisticas Brasil",
        f"{theme} tendencias analise setor",
    ]
    seen: set[str] = set()
    merged: list[SourceCandidate] = []
    for query in queries:
        for candidate in await _ddg_search(query, sources):
            if candidate.url in seen:
                continue
            seen.add(candidate.url)
            merged.append(candidate)
    return _rank_candidates(merged)


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


# Remove NUL e demais caracteres de controle C0 (exceto \t e \n) — o Postgres
# rejeita 0x00 em colunas de texto, e paginas da web as vezes trazem esses bytes.
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _clean_text(value: str) -> str:
    return _CONTROL_RE.sub("", value or "")


def _evidence_excerpt(text: str, limit: int) -> str:
    return " ".join(_clean_text(text).split())[:limit]


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


async def _rss_candidates(
    theme: str, brand: Brand, period: str, sources: int
) -> list[SourceCandidate]:
    feed_url = _google_news_rss_url(theme, brand, period)
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(feed_url)
        response.raise_for_status()
    feed = feedparser.parse(response.text)
    candidates: list[SourceCandidate] = []
    for entry in feed.entries[: sources * 2]:
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
                summary=(str(entry.get("summary", "") or "").strip() or None),
            )
        )
    return candidates


async def _apify_candidates(
    db: AsyncSession,
    payload: ResearchRunRequest,
    brand: Brand,
    sources: int,
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
    for item in items[:sources]:
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


def _dedupe_candidates(candidates: list[SourceCandidate], sources: int) -> list[SourceCandidate]:
    seen: set[str] = set()
    unique: list[SourceCandidate] = []
    for candidate in candidates:
        if candidate.url in seen:
            continue
        seen.add(candidate.url)
        unique.append(candidate)
        if len(unique) >= sources:
            break
    return unique


def _dedupe_by_domain(
    candidates: list[SourceCandidate], sources: int, per_domain: int = 2
) -> list[SourceCandidate]:
    """Prioriza diversidade: no maximo `per_domain` fontes por dominio, ate `sources`."""
    seen_urls: set[str] = set()
    per_host: dict[str, int] = {}
    unique: list[SourceCandidate] = []
    for candidate in candidates:
        if candidate.url in seen_urls:
            continue
        host = _publisher_from_url(candidate.url) or candidate.url
        if per_host.get(host, 0) >= per_domain:
            continue
        seen_urls.add(candidate.url)
        per_host[host] = per_host.get(host, 0) + 1
        unique.append(candidate)
        if len(unique) >= sources:
            break
    return unique


def count_usable_sources(sources: list[CollectedSource]) -> int:
    return sum(1 for s in sources if s.status == "collected")


async def _collect_candidate(
    candidate: SourceCandidate,
    use_playwright: bool,
    excerpt_limit: int,
) -> CollectedSource:
    publisher = candidate.publisher or _publisher_from_url(candidate.url)
    snippet = _plain_text_from_html(candidate.summary) if candidate.summary else ""
    # Fontes da busca web (OpenRouter) ja vem com evidencia citada: usa direto, sem
    # fetch lento da pagina (evita gargalo/erros ao coletar dezenas de fontes na Profunda).
    if candidate.source_kind == "web" and snippet:
        evidence = _evidence_excerpt(snippet, excerpt_limit)
        return CollectedSource(
            title=_clean_text(candidate.title)[:500],
            url=candidate.url,
            publisher=_clean_text(publisher) if publisher else publisher,
            published_at=candidate.published_at,
            reliability=_reliability(candidate.url, publisher, "collected"),
            source_kind="web",
            status="collected",
            evidence=evidence,
            error=None,
        )
    try:
        text = await _fetch_url_text(candidate.url)
        source_kind = "http" if candidate.source_kind == "rss" else candidate.source_kind
        if len(text) < 450 and use_playwright:
            try:
                text = await _fetch_with_playwright(candidate.url)
                source_kind = "playwright"
            except Exception:
                text = text  # mantem o que tiver; snippet abaixo cobre o piso
        if len(text) < 200 and snippet:
            text = snippet
            source_kind = "rss_snippet"
        evidence = _evidence_excerpt(text, excerpt_limit)
        status = "collected" if evidence else "failed"
        error = None if evidence else "Fonte sem texto extraivel."
    except Exception as exc:
        # falha ao buscar a pagina: usa o snippet do RSS como piso
        if snippet:
            evidence = _evidence_excerpt(snippet, excerpt_limit)
            status = "collected"
            error = None
            source_kind = "rss_snippet"
        else:
            evidence = ""
            status = "failed"
            error = str(exc)[:800]
            source_kind = candidate.source_kind

    return CollectedSource(
        title=_clean_text(candidate.title)[:500],
        url=candidate.url,
        publisher=_clean_text(publisher) if publisher else publisher,
        published_at=candidate.published_at,
        reliability=_reliability(candidate.url, publisher, status),
        source_kind=source_kind,
        status=status,
        evidence=evidence,
        error=error,
    )


def _research_angles(theme: str, depth: str) -> list[str]:
    """Consultas por angulo. Profunda busca o MAXIMO de fontes (varios angulos);
    rapida usa poucos angulos (o suficiente para o minimo)."""
    if depth == "deep":
        return [
            theme,
            f"{theme} dados estatisticas mercado Brasil",
            f"{theme} tendencias analise setor 2026",
            f"{theme} concorrentes players principais",
            f"{theme} regulacao normas legislacao Brasil",
            f"{theme} noticias recentes",
        ]
    return [theme, f"{theme} dados mercado Brasil"]


async def _openrouter_web_search(
    client: httpx.AsyncClient, base_url: str, api_key: str, model: str, query: str
) -> list[dict]:
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": (
                    f"Pesquise na web fontes atuais e confiaveis sobre: {query} "
                    "(foco no Brasil). Traga os principais dados e cite as fontes."
                ),
            }
        ],
        "plugins": [{"id": "web", "max_results": 10}],
        "max_tokens": 400,
    }
    try:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
        )
        response.raise_for_status()
        return response.json().get("choices", [{}])[0].get("message", {}).get("annotations") or []
    except Exception:
        return []


async def _openrouter_web_candidates(
    db: AsyncSession, theme: str, depth: str
) -> list[SourceCandidate]:
    """Busca web ROBUSTA e AGRESSIVA via OpenRouter (plugin 'web').

    Acumula fontes de multiplos angulos de consulta (sem scraping, sem bloqueio, sem lista
    fixa). Profunda acumula o maximo; rapida o suficiente. E o coletor primario.
    """
    result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == "openrouter")
    )
    credential = result.scalar_one_or_none()
    if credential is None or not credential.is_enabled or not credential.api_key_encrypted:
        return []
    try:
        api_key = decrypt_secret(credential.api_key_encrypted)
    except Exception:
        return []
    base_url = (credential.base_url or "https://openrouter.ai/api/v1").rstrip("/")
    model = credential.default_model or "google/gemini-2.5-pro"

    candidates: list[SourceCandidate] = []
    seen: set[str] = set()
    async with httpx.AsyncClient(timeout=90) as client:
        for angle in _research_angles(theme, depth):
            for annotation in await _openrouter_web_search(client, base_url, api_key, model, angle):
                citation = annotation.get("url_citation") or {}
                url = str(citation.get("url") or "").strip()
                if not url.startswith("http") or url in seen:
                    continue
                seen.add(url)
                title = citation.get("title") or _publisher_from_url(url) or "Fonte web"
                candidates.append(
                    SourceCandidate(
                        title=title[:255],
                        url=url,
                        publisher=_publisher_from_url(url),
                        source_kind="web",
                        summary=(citation.get("content") or citation.get("title") or None),
                    )
                )
    return candidates


async def collect_research_sources(
    db: AsyncSession,
    payload: ResearchRunRequest,
    brand: Brand,
) -> list[CollectedSource]:
    limits = await get_research_depth_limits(db, payload.depth)
    sources = limits["sources"]
    excerpt_limit = limits["excerpt"]

    candidates = [
        SourceCandidate(
            title=f"Fonte informada: {_publisher_from_url(url) or url}",
            url=url,
            publisher=_publisher_from_url(url),
            source_kind="manual",
        )
        for url in payload.source_urls
    ]
    # Coletor primario robusto: busca web agressiva via OpenRouter (multi-angulo).
    candidates.extend(await _openrouter_web_candidates(db, payload.theme, payload.depth))
    # Best-effort: DuckDuckGo (amplitude extra quando disponivel; [] se bloquear).
    candidates.extend(await _duckduckgo_candidates(payload.theme, brand, sources))
    try:
        candidates.extend(await _rss_candidates(payload.theme, brand, payload.period, sources))
    except Exception as exc:
        candidates.append(
            SourceCandidate(
                title=f"Google News RSS indisponivel: {exc}",
                url=_google_news_rss_url(payload.theme, brand, payload.period),
                publisher="Google News RSS",
                source_kind="rss",
            )
        )
    candidates.extend(await _apify_candidates(db, payload, brand, sources))

    if payload.depth == "deep":
        unique = _dedupe_by_domain(candidates, sources, per_domain=3)
    else:
        unique = _dedupe_candidates(candidates, sources)
    use_playwright = payload.depth == "deep"
    return [
        await _collect_candidate(candidate, use_playwright, excerpt_limit)
        for candidate in unique
    ]


def _sources_block(sources: list[CollectedSource]) -> str:
    if not sources:
        return "Nenhuma fonte externa foi coletada."
    blocks = []
    for index, source in enumerate(sources, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[{index}] {source.title}",
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


def _system_prompt(agent_prompt: str, brand_slug: str | None = None) -> str:
    return "\n".join(
        [
            agent_prompt,
            "",
            "Contexto operacional:",
            f"- Data atual do sistema: {date.today().isoformat()}.",
            "- Sintetize apenas a partir das fontes, memoria e limitacoes informadas.",
            "- Nao invente URLs, datas, fontes ou numeros.",
            brand_voice_section(brand_slug),
        ]
    )


_DEEP_STRUCTURE = """## Resumo executivo
## Escopo, metodo e criterios de evidencia
## Definicao do mercado
## Dimensao potencial e sinais de crescimento
## Fatores que sustentam a demanda
## Cadeia de valor e fluxo operacional
## Modelos de servico e receita
## Panorama competitivo
## Ambiente regulatorio
## Principais desafios operacionais
## Tecnologia e sistemas de gestao
## Benchmark internacional
## Oportunidades economicas e operacionais
## Riscos do mercado
## Matriz de evidencias
## Lacunas prioritarias de informacao
## Conclusao
## Referencias"""

_QUICK_STRUCTURE = """## Resumo executivo
## Sinais de mercado
## Panorama competitivo
## Oportunidades
## Riscos
## Recomendacoes
## Referencias"""


def _structure_for(depth: str) -> str:
    return _DEEP_STRUCTURE if depth == "deep" else _QUICK_STRUCTURE


def _user_prompt(
    brand: Brand,
    payload: ResearchRunRequest,
    sources: list[CollectedSource],
    rag_context: str,
) -> str:
    _forb = forbidden_terms_for("research_agent")
    _cite = (
        "- Cite a fonte [n] em TODA afirmacao factual (numeros, dados, fatos, datas, nomes); "
        "sem fonte na lista, NAO afirme o dado.\n"
        if citation_required_for("research_agent") else ""
    )
    is_deep = payload.depth == "deep"
    regras = (
        "\n\nREGRAS OBRIGATORIAS DESTA EXECUCAO:\n"
        "- Comece com um titulo (#) e use EXATAMENTE as secoes de nivel 2 (##) abaixo, "
        "nesta ordem:\n"
        f"{_structure_for(payload.depth)}\n"
        "- Cada secao deve ser SUBSTANCIAL (varios paragrafos e/ou listas), nunca uma linha. "
        "Escreva um relatorio LONGO e denso, no padrao de uma consultoria de mercado.\n"
        + (
            "- Use subsecoes de nivel 3 (###) onde ajudar (ex.: regra federal, por estado, "
            "por etapa da cadeia).\n"
            "- Na secao 'Ambiente regulatorio', separe regra federal e recortes "
            "estaduais/municipais relevantes, citando as normas.\n"
            "- Na secao 'Matriz de evidencias', inclua uma TABELA markdown "
            "(afirmacao | evidencia/fonte [n] | forca da evidencia).\n"
            "- Na secao 'Lacunas prioritarias de informacao', liste o que NAO foi "
            "possivel confirmar com as fontes (dados faltantes), sem inventar.\n"
            if is_deep else ""
        )
        + "- Na secao 'Panorama competitivo', inclua uma TABELA markdown "
        "(player | proposta | diferencial | fonte [n]).\n"
        "- Use formatacao rica: subtitulos, listas, **negrito** em termos-chave e "
        "TABELAS markdown para dados, comparativos e numeros.\n"
        + _cite
        + "- Na secao 'Referencias', liste cada fonte usada como '[n] Titulo — URL'.\n"
        + f"- NUNCA use estes termos: {', '.join(_forb)}.\n"
        + "- Baseie-se nas fontes coletadas (e no contexto RAG). Se um dado nao estiver "
          "nas fontes, diga que nao foi encontrado — nunca invente numeros, datas ou nomes.\n"
    )
    return "\n".join(
        [
            "Gere um relatorio de pesquisa de mercado APROFUNDADO, longo e bem formatado, "
            "no padrao de uma consultoria (profundidade, tabelas, criterio de evidencia).",
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
            f"Fontes externas analisadas ({len(sources)} fontes; use os numeros [n] para citar):",
            _sources_block(sources),
        ]
    ) + regras


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
    agent_slug = agent.slug  # captura local: db.rollback() no except expira o ORM

    brand_result = await db.execute(select(Brand).where(Brand.slug == payload.brand_slug))
    brand = brand_result.scalar_one_or_none()
    if brand is None or not brand.is_active:
        raise LLMConfigurationError("Marca nao encontrada ou inativa.")

    model = payload.model or agent.default_model
    provider = payload.provider or provider_for_model(model)
    credential_result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = credential_result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )

    collected_sources = await collect_research_sources(db, payload, brand)
    _min = min_sources_for("research_agent", payload.depth)
    _usable = count_usable_sources(collected_sources)
    if _usable < _min:
        raise InsufficientSourcesError(theme=payload.theme, found=_usable, needed=_min)
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
            model=model,
            system_prompt=_system_prompt(agent_prompt, brand.slug),
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
            agent_slug=agent_slug,
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
