# Agentes reais: coleta de fontes, regras de máquina e saída estruturada

**Data:** 2026-07-02
**Branch base:** `sprint/nucleo-agentes`
**Contexto:** o `research_agent` produz relatórios **hipotéticos** ("Ausência Total de Fontes / Confiança Nula") porque coleta **0 fontes**. O usuário quer que os agentes funcionem de verdade (fontes reais + RAG + regras), sem nada hipotético, e que a saída apareça **estruturada e organizada na interface** (não markdown cru), com estrutura padrão.

## Diagnóstico (causa raiz, já verificada)

1. **Query poluída** — `research_service._google_news_rss_url` monta a busca como `f"{theme} {brand.niche} {period} Brasil"`, jogando a string do período (ex.: `"ultimos 30 dias"`) **dentro** da busca do Google News → resultados zerados. Teste com `"deathcare pet"` limpo retornou 2 notícias reais na hora.
2. **Links-redirect do Google News** — `entry.link` é `https://news.google.com/rss/articles/CBM...`, um redirect; baixá-lo rende página de consentimento/JS, não o artigo → candidatos descartados por "sem texto extraível".
3. **Sem porta de "sem fonte"** — quando a coleta falha, o fluxo mesmo assim chama o LLM, que gera relatório hipotético e salva.

## O que já existe (reusar, não reconstruir)

- **Regras dos agentes** em `config/agents/{research_agent,content_agent,quality_guardian}.md` (método, estrutura de saída, "nunca inventar").
- **Vozes de marca** em `config/brands/*.md` (injetadas via `brand_voice_section`).
- **RAG** já consultado em pesquisa e conteúdo (`build_rag_context`).
- **Guardião de Qualidade** (`quality_guardian.py`) já pune "pesquisa sem fontes" (-30 crítico), placeholders, mistura de marcas, % sem fonte.
- **Renderização** via `apps/web/components/markdown.tsx` (parser próprio, seguro, já converte `##` em títulos).
- **Fontes estruturadas**: `ResearchSource` (título, url, publisher, reliability A/B/C/D, evidence, status) ligadas ao `Output`.

## Decisões fixadas (brainstorming)

- **Saída estruturada = seções renderizadas em blocos/cards.** O **markdown continua o formato canônico** (preserva PDF/WeasyPrint, Guardião, versões). Força-se o **conjunto padrão de seções** por tipo de documento e a UI renderiza **cada seção como um bloco/card separado e organizado**. As fontes da pesquisa viram uma **lista estruturada** (confiabilidade + link + trecho), lidas de `ResearchSource`.
- **Sem fonte real suficiente → recusa honesta.** A pesquisa **não gera relatório hipotético**: devolve mensagem clara ("não encontrei fontes suficientes sobre X — refine o tema ou informe URLs"), sem criar Output. Toda afirmação no relatório cita `[n]`.
- **Regras de máquina** ficam em `config/rules/agent_rules.yaml`, injetadas no prompt E validadas após a geração.
- **Não reescrever para JSON.** Nada de migrar armazenamento para JSON (risco alto em PDF/Guardião/versões).

---

## Arquitetura

### Parte A — Coleta de fontes real (`research_service.py`)

**A1. Query correta.** `_google_news_rss_url(theme, brand, period)` passa a montar:
```python
days = _period_days(period)  # "ultimos 30 dias" -> 30; default 30
query = quote_plus(f"{theme} {brand.niche} when:{days}d")
```
- Remove a string de período de dentro da busca; usa o operador nativo `when:{N}d` do Google News.
- `_period_days` extrai o número de dias do texto do período (regex; fallback 30).

**A2. Resolver o link real + evidência com piso.** Em `_collect_candidate`:
- Seguir redirects (já faz). Se a URL final ainda for `news.google.com` **ou** o texto extraído for curto, usar o **snippet do RSS** (`entry.summary`/`description`) como evidência-piso, e (Profunda) tentar Playwright.
- Portanto `_rss_candidates` passa a capturar `summary = entry.get("summary")` no `SourceCandidate` (novo campo opcional), e `_collect_candidate` usa `summary` como evidência quando a extração da página falha. Assim uma fonte do Google News **sempre** tem evidência mínima (o snippet), em vez de ser descartada.
- `status = "collected"` quando há evidência (da página **ou** do snippet); `"failed"` só quando não há nem snippet.

**A3. Diversidade (Profunda).** Após dedupe por URL, aplicar dedupe **por domínio** priorizando publishers distintos até o alvo de fontes (Profunda=30). Fontes do mesmo domínio além de 2 são descartadas para maximizar diversidade.

**A4. Porta de fontes mínimas.** Nova função `count_usable_sources(sources) -> int` (status == "collected"). Em `run_market_research`, após `collect_research_sources`:
```python
usable = count_usable_sources(collected_sources)
min_sources = _min_sources_for_depth(payload.depth)  # quick=3, deep=5 (de agent_rules.yaml)
if usable < min_sources:
    raise InsufficientSourcesError(theme=payload.theme, found=usable, needed=min_sources, tried=<query/urls>)
```
- Nova exceção `InsufficientSourcesError` (em `app/llm.py` ou um novo `app/errors.py`).
- Nenhum Output é criado nesse caminho.

### Parte B — Regras de máquina (`config/rules/agent_rules.yaml` + loader)

**B1. Arquivo** `config/rules/agent_rules.yaml`:
```yaml
research_agent:
  min_sources: { quick: 3, deep: 5 }
  required_sections:
    - "Resumo executivo"
    - "Sinais de mercado"
    - "Oportunidades"
    - "Concorrentes"
    - "Riscos"
    - "Recomendações"
    - "Sugestões de pauta"
    - "Fontes"
  citation_required: true          # toda afirmação factual cita [n]
  forbidden: ["confiança nula", "ausência total de fontes", "vácuo de informação", "hipotético"]
content_agent:
  required_sections:               # por família de canal; "*" = padrão
    "*": ["Objetivo editorial", "Conteúdo final", "CTA"]
  citation_required: false
  forbidden: ["[preencher]", "lorem ipsum"]
```

**B2. Loader** `app/agent_rules.py`: `get_agent_rules(agent_slug) -> dict` (lê o YAML via `read_config_text`, fallback `{}`), `required_sections_for(agent_slug, channel=None)`, `min_sources_for(agent_slug, depth)`.

**B3. Injeção no prompt.** `agent_system_prompt` (ou os `_system_prompt` de research/content) passa a anexar um bloco "Regras obrigatórias desta execução" com as seções obrigatórias, a exigência de citação e os termos proibidos — para o LLM seguir a estrutura padrão.

**B4. Validação pós-geração.** Nova `app/rules_validation.py`: `validate_document(content, agent_slug, channel=None) -> list[str]` (violações: seção obrigatória ausente, termo proibido presente, e — pesquisa — ausência de qualquer citação `[n]`). O Guardião de Qualidade passa a incorporar essas violações como `required_fixes`/`critical_failures` (reusa a infra existente). Para pesquisa, "termo proibido presente" (ex.: "confiança nula") é **crítico**.

### Parte C — Saída estruturada renderizada (frontend)

**C1. Renderer de documento em seções.** Novo `apps/web/components/SectionedDocument.tsx`: recebe o markdown canônico, separa por `## ` em seções `{title, body}` e renderiza **cada seção como um card** (título + corpo via `<Markdown>`), com o bloco "Metadados editoriais" recolhido/discreto no topo. Substitui o `<Markdown content=... />` cru na visão de detalhe (`operations/page.tsx`, foco do item).

**C2. Fontes estruturadas.** O endpoint de detalhe do Output de pesquisa passa a incluir `sources: ResearchSourceRead[]` (de `ResearchSource`). Novo componente `apps/web/components/SourceList.tsx`: lista com selo de confiabilidade (A/B/C/D), publisher, link externo e trecho (evidence). Renderizada na seção "Fontes" quando `channel == "Pesquisa"`.
- Schema `ResearchSourceRead` (id, title, url, publisher, reliability, source_kind, published_at, evidence) + inclusão no `ContentOutputDetail` (campo `sources`, default `[]`).

**C3. Recusa honesta na UI.** Quando o approve devolver o erro de fontes insuficientes (422 com mensagem), o painel/chat mostra a mensagem clara (já há tratamento de erro legível — Parte do commit anterior).

### Parte D — Conteúdo com excelência (`content_generation.py`)

- Já usa RAG + template + voz de marca. Adições: injeção das regras de máquina (B3) no prompt de conteúdo e validação (B4) alimentando o Guardião. Sem citação obrigatória para conteúdo (opcional por regra), mas fatos/percentuais continuam exigindo fonte (regra já existente no Guardião).
- Mesma renderização em seções (C1) para o detalhe de conteúdo.

---

## Erros

- `InsufficientSourcesError` → o endpoint de approve devolve **422** com mensagem amigável ("Não encontrei fontes suficientes sobre '<tema>' (achei N, preciso de M). Refine o tema ou informe URLs."). Não cria Output. Briefing continua `pending` (retryável).
- Falha de provedor LLM → **502** legível (já implementado).
- YAML de regras ausente/ilegível → `get_agent_rules` cai para `{}` (sistema segue sem travar).

## Testes

- **A (coleta):** unit de `_google_news_rss_url` (query correta, sem período embutido, com `when:Nd`); unit de `_period_days`; unit de `count_usable_sources`; unit do dedupe por domínio. Smoke ao vivo: pesquisa "deathcare pet" na marca deathcare → ≥3 fontes coletadas, Output criado.
- **B (regras):** unit de `get_agent_rules`/`min_sources_for`/`required_sections_for`; unit de `validate_document` (seção ausente, termo proibido, sem citação).
- **Porta de fontes:** teste que, com coleta forçada a 0 (monkeypatch), o approve de pesquisa devolve 422 e **não** cria Output.
- **Guardião:** teste que "confiança nula" no conteúdo de pesquisa vira falha crítica.
- **C (frontend):** `tsc` + `lint` + `build`; render de `SectionedDocument` (seções viram cards) e `SourceList`.
- Padrão S0 (`duofy_v1_test`, `patch_ai`), venv da raiz.

## Fora de escopo

- Migrar armazenamento para JSON (mantém markdown canônico).
- Reescrever o pipeline de PDF/versões/Guardião.
- Novas integrações de coleta além de Google News RSS + Apify (Apify fica opcional como hoje).
- Edição por seção na UI (render em cards agora; edição por seção fica para depois).

## Faseamento (implementação em uma trilha, entregando incremental)

1. **A** coleta real + porta de fontes (o que destrava "pesquisa de verdade").
2. **B** regras de máquina + validação + Guardião.
3. **C** renderização em seções + lista de fontes.
4. **D** conteúdo (reusa B e C).
