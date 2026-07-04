# Estado do Sistema — Duofy V1 Marketing Intelligence Hub

> Análise senior de estado atual. Data: 2026-07-02. Branch: `sprint/nucleo-agentes`.
> Baseada em auditoria de três frentes (segurança, código morto/uso, stack/arquitetura)
> cruzada com verificação direta no código. Este documento descreve o que **é**, não o que
> deveria ser: lógica real, débitos reais, vulnerabilidades reais.

---

## 1. Resumo executivo

O Duofy V1 é uma plataforma multi-marca de marketing assistido por LLM, estruturada em três
camadas limpas (Next.js → FastAPI → Postgres+pgvector) com orquestração de agentes, RAG e um
Guardião de Qualidade híbrido. **O núcleo é real e funcional**: pesquisa com busca web de
verdade, cocriação estruturada de conteúdo, RAG institucional, versionamento de outputs,
rastreamento de custo por chamada de modelo. Não há mocks no caminho principal — a única tela
100% mock (`/redes`, Instagram/Meta Ads) foi conscientemente desligada por redirect.

**Maturidade por dimensão:**

| Dimensão | Estado | Nota |
|---|---|---|
| Arquitetura | Sólida, em camadas, config-as-code | 8.5/10 |
| Funcionalidade do núcleo | Agentes reais, sem alucinação de fontes | 8/10 |
| Segurança | Débitos sérios em AuthZ e SSRF | 4.5/10 |
| Testes | ~138 passando, cobertura desigual (~20–30% em utils) | 6/10 |
| Código morto | Mínimo (~150–200 linhas), higiene alta | 9/10 |
| Prontidão de produção | Deploy self-contained pronto; bloqueado por segurança | 6/10 |

**Veredito senior:** pronto para uso interno controlado; **não** pronto para exposição
multi-tenant pública até fechar os 5 riscos críticos de segurança (seção 5).

---

## 2. Stack completa

### Backend (`apps/api`)
- **Framework:** FastAPI 0.115+ (ASGI async nativo), Uvicorn 0.34+.
- **Banco:** PostgreSQL 16 + extensão **pgvector** (embeddings 1536d).
- **ORM:** SQLAlchemy 2.0 async (asyncpg 0.30+, `Mapped`/`mapped_column` tipado).
- **Validação:** Pydantic v2.7+.
- **Migrações:** Alembic (revisões `0001`→`0019`).
- **Fila/cache:** Redis 7 + Celery 5.4+ (worker executa tarefas de chat/orquestração).
- **LLM/agentes:** langchain-core 0.3+, langgraph 0.2+ (state machine, máx. 5 passos),
  langgraph-checkpoint-postgres (presente, **não ativado** — usa `MemorySaver`),
  langchain-openai.
- **Coleta web:** trafilatura (extração), feedparser (RSS), Playwright/Chromium (JS pesado),
  httpx (cliente async com retry/backoff).
- **Documentos:** WeasyPrint 63+ (HTML→PDF via Pango/Cairo), pypdf, python-docx.
- **Cripto:** `cryptography` 44+ (Fernet para chaves de provedor).
- **Qualidade:** ruff 0.8+ (line-length 100, target py311), pytest 8.3+.
- **Runtime:** Python 3.11-slim.

### Frontend (`apps/web`)
- Next.js 14.2.35 (App Router), React 18.3.1, TypeScript 5, Tailwind 3.4.
- Padrões próprios: `apiFetch` + token via cookie, `useBrand`, renderizador Markdown custom.
- Hot-reload por polling (Windows).

### Infraestrutura
- **Dev:** `docker-compose.yml` — postgres (127.0.0.1:5433), redis (6379), api (:8000
  `--reload`, código montado por volume), web (:3000 hot-reload), worker, migrate one-shot.
- **Prod:** `docker-compose.prod.yml` + **Caddy** (TLS automático, `/api/*`→api, resto→web),
  imagens buildadas sem volumes de código, guia em `DEPLOY.md`.
- **CI:** `.github/workflows/ci.yml` — `ruff check app alembic` + pytest + `next build`
  (testes **não** são lintados).

---

## 3. Arquitetura e lógica dos fluxos

### 3.1 Caminho canônico de uma chamada LLM
Router → Service → injeta config (`config/agents/<slug>.md` + voz de marca
`config/brands/<slug>.md`) → RAG (`rag.py:search_memory` sobre pgvector) → `llm.py:call_llm`
(resolve provedor por `provider_for_model`, decripta credencial Fernet, POST com retry/backoff
3× em 429/5xx, parseia OpenAI-compat ou Anthropic, estima tokens/custo) → **grava `ModelCall`**
(tokens, custo USD, latência, status) → salva `Output`/`OutputVersion` (versionado) → Guardião
de Qualidade → aprovação humana em `/approvals`.

### 3.2 Agentes (5 consolidados + orquestrador)
- **Orquestrador** (`orchestrator_*`, LangGraph): monta um **briefing** e pede aprovação
  **síncrona** no chat antes de executar; expõe ferramentas `research_market`, `create_content`,
  `create_press`, `create_calendar`, `search_memory`. Máx. 5 passos.
- **Pesquisa** (`research_service.py`): coleta multi-ângulo **real**. Primário robusto =
  busca web via OpenRouter (`plugins:[web]`, extrai `annotations[].url_citation`); best-effort
  = Google News RSS + DuckDuckGo scraping. Dedupe por domínio, porta de fontes mínimas
  (`InsufficientSourcesError`→422 sem criar Output), sanitização de NUL/controle. Saída em
  padrão DOCX de consultoria (≈18 seções, matriz de evidências, referências `[n]`, tabelas).
- **Cocriação** (`cocreation_service.py`): consome pesquisa por ID (**nunca** re-pesquisa),
  gera `ContentPackage` estruturado em **modo JSON** (`response_format: json_object`); legendas
  IG≠LinkedIn, carrossel com `image_prompt` independente por slide sem logo/@/#; valida
  (`validate_package`, `has_forbidden_prompt`); refino parcial preserva o resto.
- **Guardião de Qualidade** (`quality_guardian.py`): híbrido — regras de máquina (seções
  obrigatórias, termos proibidos, placeholders, citação, mojibake) + LLM (score 0–100, pesos
  por marca). Passa automático se score ≥ 80 e sem falha crítica; senão vai para revisão humana.
- **Métricas** (`metrics_service.py`): **rebaixado a módulo** — só gera relatórios via
  `/api/reports`, não é agente ativo.
- **Calendário** (`calendar_service.py`): **módulo + tool**, não agente; scheduler no lifespan.

### 3.3 RAG
Upload (PDF/DOCX/TXT/MD) → chunk → embedding (**fallback local determinístico SHA256**;
OpenAI desabilitado) → `document_chunks.embedding` (pgvector). Busca por distância cosseno com
filtro `(brand_slug = :brand OR brand_slug = 'institucional')` — a sentinela institucional torna
os 2 PDIs base (Brand Kit, Documento Mestre) visíveis a todas as marcas. Pesquisa aprovada é
auto-indexada no RAG ao aprovar o output.

---

## 4. Modelo de dados

26 tabelas versionadas em 19 migrações, todas com `TimestampMixin`. Principais grupos:
- **Identidade/config:** `users`, `brands`, `agents`, `settings`, `provider_credentials`
  (chave API cifrada em Fernet).
- **Produção de conteúdo:** `outputs`, `output_versions` (com `structured_json` = ContentPackage,
  migração 0019), `output_decisions`, `output_comments`.
- **Pesquisa/RAG:** `research_sources`, `memory_entries` (embedding), `documents`,
  `document_chunks` (embedding).
- **Orquestração/chat:** `chat_sessions`, `agent_tasks`, `chat_messages`, `agent_logs`,
  `briefings`, `research_themes`, `content_themes`.
- **Qualidade/observabilidade:** `quality_reviews` (local+LLM, score, modo, provider),
  `model_calls` (tokens/custo/latência), `audit_events`, `reports`, `calendar_events`.

---

## 5. Vulnerabilidades (priorizadas)

Auditoria de segurança dedicada: **5 críticas, 7 altas, 10 médias, 4 baixas**.

> **Atualização 2026-07-03 — os 5 críticos foram mitigados** (sprint de hardening):
> C1 IDOR → `brand_scope` por usuário + enforcement (dormente até atribuir escopos);
> C2 Fernet↔JWT → `FERNET_SECRET_KEY` dedicado com fallback; C3 segredos → guarda de startup
> (JWT/admin/DB default barrados em produção); C4 SSRF → bloqueio de IP não-público + teto de
> resposta; C5 JWT → cookie **HttpOnly** (token imune a XSS) + proxy mesma-origem. Todos com testes.

As críticas (descrição original + mitigação aplicada):

### 🔴 C1 — IDOR: endpoints de detalhe/deleção sem verificação de propriedade
`routers/outputs.py`, `routers/documents.py` (GET/DELETE/download/export por ID) não filtram por
`brand_slug`/owner. Qualquer usuário autenticado lê/deleta/baixa outputs e documentos de outras
marcas. **Mitigação:** filtrar por marca do usuário em todo endpoint por-ID e nas listagens
(hoje `brand_slug` é opcional → enumeração cross-brand). **Prioridade máxima.**

### 🔴 C2 — Chaves de provedor acopladas ao `JWT_SECRET_KEY`
`crypto.py`: a chave Fernet é `SHA256(JWT_SECRET_KEY)`. Rotacionar o segredo JWT (operação
normal) torna **todas** as chaves de provedor indecifráveis e derruba todos os agentes.
Já registrado em memória ([[jwt-secret-fernet-coupling]]). **Mitigação:** segredo Fernet
separado + versionamento de chave.

### 🔴 C3 — Segredos inseguros versionados
`docker-compose.yml`/`.env.example`: `JWT_SECRET_KEY=change-me...`, `ADMIN_PASSWORD=admin123456`,
`POSTGRES_PASSWORD=duofy`, `DATABASE_URL` com senha embutida. Ok para dev; **fatal se copiado
para prod**. `DEPLOY.md` já exige `.env` próprio, mas os defaults precisam ser claramente
marcados como dev-only e nunca reaproveitados.

### 🔴 C4 — SSRF na coleta de URLs
`research_service.py`: `_fetch_url_text` e Playwright buscam **qualquer** URL vinda de RSS/DDG
sem validar IP privado. Uma URL maliciosa em feed (`http://169.254.169.254/`, `127.0.0.1:6379`)
permite varrer rede interna / metadata cloud. **Mitigação:** bloquear IPs privados via
`ipaddress`, limitar tamanho de resposta, timeout por chunk.

### 🔴 C5 — JWT sem HttpOnly (XSS rouba sessão)
`apps/web/lib/auth.ts`: token em `document.cookie` legível por JS (`SameSite=Lax`, sem
`HttpOnly`/`Secure`). Débito já **consciente** e adiado ([[jwt-cookie-httponly-deferred]]) —
exige refactor de auth.

**Altas relevantes:** ausência de auditoria em ações admin (troca de chave/limites);
`GET /api/admin/providers` decripta e retorna todas as chaves (deveria só mascarar); risco de
`Authorization: Bearer <chave>` vazar se headers forem logados; prompt injection sem sanitização;
listagens sem `brand_slug` obrigatório. **Frontend:** `npm audit` com vulns altas em Next.js já
mapeado como bloqueador de produção ([[npm-audit-next-bloqueador-producao]]).

---

## 6. Código morto e uso

Higiene **alta**. O débito histórico de "~2.850 linhas mortas" citado na auditoria de julho
[[duofy-auditoria-2026-07]] foi majoritariamente eliminado; o estado atual é **~150–200 linhas**:

| Item | Caminho | Tipo | Ação |
|---|---|---|---|
| `/redes` (mock Instagram/Ads) | `apps/web/app/(app)/redes/page.tsx` | redirect | remover quando integração entrar |
| `/costs`, `/insights`, `/workspace` | idem | aliases redirect p/ `/relatorios`\|`/operations` | inofensivos; podem sair do nav |
| Apify | `research_service._apify_candidates` | opt-in `is_enabled=False` | manter (futuro) |
| Embeddings OpenAI | `embeddings.py` | fallback local ativo | manter (resiliente) |
| `langgraph-checkpoint-postgres` | dep instalada | usa `MemorySaver` | ativar quando escalar |

**Nenhuma função órfã, import morto ou modelo ORM sem uso detectado.** Todos os 20 routers estão
registrados; todas as páginas do frontend têm backend correspondente (as 4 acima são só redirects).

**Oportunidades de refactor (não urgentes):** consolidar leitores de config duplicados
(`agent_config`, `agent_limits`, `research_models`) num `config_loader`; unificar `_dedupe_*`.

---

## 7. Testes

~138 passando / 2 skipped, ruff limpo. Suíte de integração S0 madura (banco `duofy_v1_test`,
`patch_ai`, conftest, venv da raiz — [[duofy-testes-integracao]]). Boa cobertura em
orquestração (~85%), pesquisa/conteúdo (~75%), guardião (~80%). **Lacunas:** `crypto.py`,
`embeddings.py`, `rag.py`, `audit_service.py`, `metrics_service.py`, `document_formatting.py`
praticamente sem teste (~20–30%). CI não linta nem cobre `tests/`.

---

## 8. Débitos conscientes (transparência)

1. **Tracking do web-search:** a chamada de busca web da pesquisa usa httpx cru e **não** passa
   por `ModelCall` — esse custo/uso não aparece no rastreamento. As chamadas via `call_llm`
   (cocriação, guardião, geração) são rastreadas normalmente.
2. **Créditos OpenRouter:** durante os testes ao vivo os créditos se esgotaram (HTTP 402). É
   **externo** — não é bug; exige recarga na conta. O fluxo foi comprovado funcional antes disso.
3. **Auth/HttpOnly, npm audit, Fernet↔JWT:** ver seção 5; todos já mapeados em memória.
4. **Seed não automático:** admin **não** é criado no boot; rodar `python -m app.seed`.
   `DEPLOY.md` erra ao dizer que é automático ([[duofy-seed-nao-automatico]]).

---

## 9. Recomendações priorizadas

**Antes de qualquer produção pública (bloqueadores):**
1. Fechar IDOR (C1) — filtro de propriedade em todos os endpoints por-ID e listagens.
2. Desacoplar Fernet do JWT (C2) e versionar chaves.
3. Guardar SSRF (C4) — bloqueio de IP privado + limites.
4. Rotina de segredos de prod (C3) — `.env` fora do git, defaults marcados dev-only.
5. `npm audit fix` do Next.js em tarefa isolada com regressão.

**Curto prazo:** auditoria de ações admin; mascarar chaves em `GET /providers`; redação de
headers em logs; tornar `brand_slug` obrigatório nas listagens; migrar JWT para cookie HttpOnly.

**Manutenção:** cobrir utils críticos (crypto, rag, embeddings) com testes; incluir `ModelCall`
no web-search; corrigir `DEPLOY.md` (seed). Refactors de config são opcionais.

---

## 10. Conclusão

Sistema **coeso, real e bem organizado** — arquitetura em camadas clara, agentes que produzem
saída verificável (sem alucinar fontes), RAG institucional funcional, rastreabilidade de custo e
qualidade. O gap dominante não é funcional, é de **segurança/autorização multi-tenant**: cinco
riscos críticos concentrados em IDOR, criptografia de segredos e SSRF. Fechados esses, o produto
está pronto para produção com o deploy self-contained (Caddy + docker-compose.prod) já existente.
