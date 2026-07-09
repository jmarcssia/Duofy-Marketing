# Handoff Técnico — Duofy V1

**Data:** 2026-07-09 · **Branch:** `main` (commit `581c9a3` no momento da escrita) · **Autor:** sessão de engenharia assistida por IA

## Como usar este documento

Este é um documento autossuficiente — cobre o sistema inteiro, não só o que mudou recentemente. Todo fato técnico foi verificado direto no código nesta data (não copiado de documentação anterior sem checar). Onde a documentação existente diverge do código real, isso está marcado explicitamente na seção 17.

Já existe uma quantidade grande de documentação de produto/negócio em `docs_entrega_duofy/` (manuais para cliente/usuário final) e `docs_interno/` (estado técnico interno, de 2026-07-06). Este documento não os substitui — é o ponto de entrada técnico para quem vai mexer no código, e cobre também tudo que mudou depois deles.

---

## 1. Visão geral

Duofy é uma plataforma de marketing com agentes de IA sob supervisão humana, para agências/times de marketing que atendem múltiplas marcas. O fluxo central: um **Orquestrador** conversacional monta um briefing → o **agente de Pesquisa** faz pesquisa de mercado real (coleta de fontes web) → o **agente de Cocriação** gera conteúdo estruturado (legendas por canal, direção visual, CTA, carrossel) a partir da pesquisa aprovada → o **Guardião de Qualidade** revisa automaticamente → um humano aprova/ajusta → o conteúdo é publicado (manual hoje; Meta automática é roadmap).

V1 funcional para operação interna e demonstração a clientes — não é um produto enterprise fechado. Núcleo real e testado; algumas automações (publicação Meta, RAG) ainda em maturação.

## 2. Arquitetura

```
Browser
  │
  ▼
Next.js 14 (apps/web) — App Router, mesma origem
  │  proxy /api/* via next.config.mjs rewrites
  ▼
FastAPI (apps/api) — uvicorn --reload em dev
  │
  ├──▶ PostgreSQL 16 + pgvector (dados relacionais + embeddings)
  ├──▶ Redis (broker/backend do Celery)
  └──▶ Celery worker (apps/api, mesmo código-fonte, processo separado)
         └──▶ chama os LLMs (OpenRouter/OpenAI/Anthropic) de forma assíncrona
```

Em produção, um **Caddy** na frente é o único serviço que expõe portas (80/443, TLS automático); api/web/postgres/redis ficam só na rede interna do Docker. Ver seção 6.

## 3. Stack tecnológica

**Backend** (`apps/api`): FastAPI (`fastapi>=0.115`), SQLAlchemy 2.x assíncrono (`asyncpg`), Alembic para migrações, Celery + Redis para tarefas assíncronas, Pydantic Settings para configuração. LLM: chamadas diretas via `httpx` (sem SDK de provedor) — roteamento próprio para OpenRouter/OpenAI/Anthropic em `app/llm.py`. Extras: `weasyprint` (export PDF), `trafilatura`/`beautifulsoup4`/`playwright` (coleta de pesquisa web), `langgraph`/`langchain-core` (orquestrador conversacional), `PyJWT` + `cryptography` (auth + Fernet para segredos de provedor).

**Frontend** (`apps/web`): Next.js 14.2.35 (App Router), React 18.3, TypeScript, Tailwind. Sem biblioteca de estado/dados (nada de React Query/Redux/Zustand) — `useState`/Context puro. Sem biblioteca de componentes (nada de shadcn/Radix) — kit próprio em `components/ui.tsx`. Testes E2E via Playwright (`@playwright/test`), adicionado nesta sessão.

**Infra**: Docker Compose (dev e prod separados), Postgres com extensão pgvector, Redis, Caddy (prod).

## 4. Estrutura do repositório

```
apps/
  api/            # backend FastAPI
    app/          # código da aplicação (routers, services, models, etc.)
    alembic/      # migrações (27 arquivos, 0001..0027)
    tests/        # suíte pytest (integração, banco real)
    scripts/      # scripts standalone (reindex de embeddings, teste de skill de agente)
  web/            # frontend Next.js
    app/          # rotas (App Router) — grupo (app) = área autenticada
    components/   # componentes compartilhados
    lib/          # clients de API, helpers, taxonomia de briefing
    tests-e2e/    # suíte Playwright (adicionada nesta sessão)
config/           # seeds (marcas, agentes), prompts dos agentes, regras, skills
docs/             # este arquivo + auditorias técnicas anteriores
docs_entrega_duofy/  # manuais voltados a cliente/usuário final
docs_interno/     # estado técnico interno (snapshot de 2026-07-06)
docs/superpowers/ # specs e planos de features implementadas via processo estruturado
infra/            # init scripts do Postgres (pgvector), Caddyfile
storage/          # documentos/mídia enviados (montado em volume)
knowledge/        # base de conhecimento pra RAG (institucional, marcas, canais)
docker-compose.yml       # dev
docker-compose.prod.yml  # produção
DEPLOY.md         # guia de deploy em VPS
```

## 5. Como rodar localmente

```bash
cp .env.example .env   # ajuste se necessário — defaults já funcionam pra dev local
docker compose up -d --build
docker compose exec api python -m app.seed   # cria admin + marcas + agentes (NÃO é automático — ver seção 17)
```

- Web: http://localhost:3000 · API: http://localhost:8000 · Postgres: `127.0.0.1:5433` · Redis: `127.0.0.1:6379`
- Login padrão: `admin@duofy.com.br` / `admin123456` (do `.env.example`)
- `api`, `web` e `worker` têm bind-mount do código-fonte: `api`/`web` recarregam sozinhos (hot-reload); **`worker` não** — depois de mudar código do worker, rode `docker compose restart worker` (não precisa rebuild).
- Migração nova: crie o arquivo em `apps/api/alembic/versions/`, depois `docker compose run --rm migrate` (ou reinicie o serviço `migrate`).

## 6. Como fazer deploy em produção

Guia completo em `DEPLOY.md` (8 seções: pré-requisitos de VPS, instalação limpa, migração entre VPS, backup, operação do dia a dia, notas de segurança, troubleshooting, dívida de `npm audit`). Resumo:

```bash
cp .env.production.example .env
# gerar segredos fortes: JWT_SECRET_KEY (secrets.token_urlsafe(48)), POSTGRES_PASSWORD, ADMIN_PASSWORD
# definir DUOFY_SITE_ADDRESS (domínio com DNS já apontando pro VPS)
docker compose -f docker-compose.prod.yml up -d --build
```

Diferenças da produção vs dev: só o Caddy expõe portas; Postgres/Redis sem porta exposta; sem bind-mount de código (build assado na imagem); `APP_ENV=production` é fixo, e nesse modo `app/settings.py` **recusa subir** se `JWT_SECRET_KEY`/`ADMIN_PASSWORD` ainda forem os defaults, ou se `DATABASE_URL` contiver a senha padrão `duofy:duofy@` — trava de segurança validada no boot.

**Atenção ao migrar de um VPS pra outro**: reusar o **mesmo** `JWT_SECRET_KEY` é obrigatório — as chaves de provedor LLM são cifradas com Fernet derivado desse segredo; trocar o segredo torna as chaves de provedor já salvas indecifráveis (todos os agentes param de funcionar até reconfigurar os provedores).

## 7. Variáveis de ambiente e segredos

Templates em `.env.example` (dev) e `.env.production.example` (prod), na raiz do repo. Segredos reais (nunca commitar): `DATABASE_URL` (embute senha do Postgres), `JWT_SECRET_KEY`, `FERNET_SECRET_KEY` (opcional — se ausente, deriva de `JWT_SECRET_KEY`), `ADMIN_PASSWORD`. O resto é configuração normal (pool de conexão, CORS, RAG, embeddings).

`app/settings.py` valida no boot (fora de dev/test): rejeita segredo JWT padrão, senha admin padrão, ou senha de banco padrão — falha alto e cedo em vez de subir inseguro silenciosamente.

## 8. Modelo de dados

29 tabelas em `apps/api/app/models.py`, agrupadas por domínio:

- **Auth/config**: `User` (com `brand_scope` JSON pra controle de acesso por marca), `Brand`, `Setting`, `ProviderCredential` (chave de LLM cifrada)
- **Agentes/tarefas**: `Agent`, `AgentRun`, `AgentTask` (job assíncrono via Celery), `AgentLog`, `ChatSession`, `ChatMessage`, `Briefing` (plano proposto pelo Orquestrador antes de executar)
- **Conteúdo**: `Output`, `OutputVersion`, `OutputDecision`, `ContentPiece` (peça aprovável individualmente — slide, legenda, e-mail), `OutputComment`, `QualityReview` (resultado do Guardião), `ContentTheme`, `ResearchTheme`, `ResearchSource`
- **Calendário**: `CalendarEvent` (unidade de workflow: briefing → aprovação → cocriação → publicação)
- **Publicações**: `PublicationChannel`, `Publication`
- **Memória/RAG**: `Source`, `Document`, `DocumentChunk` (com embedding pgvector), `MemoryEntry` (idem)
- **Auditoria/métricas**: `AuditEvent`, `ModelCall` (telemetria por chamada de LLM — tokens, custo, latência), `Report`

27 migrações Alembic (`0001_enable_pgvector.py` → `0027_calendar_event_dates.py`), sem gaps.

## 9. Agentes de IA e roteamento de LLM

5 agentes ativos (`config/seeds/agents.yaml`), todos com modelo default `openai/gpt-4o-mini`:

| Agente | Slug | Função |
|---|---|---|
| Orquestrador | `orchestrator` | Conversa, monta briefings, dispara outros agentes |
| Pesquisa de Mercado | `research_agent` | Coleta fontes reais e sintetiza relatório |
| Cocriação de Conteúdo | `content_agent` | Gera pacote estruturado (legendas, direção visual, slides) |
| Assessoria de Imprensa | `press_agent` | Releases, pautas, pitches |
| Guardião de Qualidade | `quality_guardian` | Revisão automática (score, falhas críticas) |

Existem prompts órfãos em `config/agents/` (`calendar_agent.md`, `metrics_agent.md`) que **não** estão no roster ativo — "Métricas Internas" foi rebaixado de agente conversacional pra módulo interno (alimenta Admin/Relatórios via `ModelCall`), documentado no próprio `agents.yaml`.

Roteamento (`app/llm.py`, `provider_for_model`): modelo com `/` no nome (ex.: `openai/gpt-4o-mini`, o default seeded) → **OpenRouter**; prefixo `gpt-`/`o1`/`o3` → OpenAI direto; prefixo `claude-` → Anthropic direto. Retry/backoff em 429/5xx; toda chamada é registrada em `ModelCall` (inclusive falhas).

## 10. Fluxo de negócio principal

```
Orquestrador (chat) ──▶ monta Briefing
                              │
                              ▼
                    Pesquisa de Mercado (research_agent)
                    coleta fontes reais, gera relatório
                              │
                    aprovação humana da pesquisa
                              │
                              ▼
                    Cocriação (content_agent)
                    gera pacote: legendas/canal, direção visual, CTA, slides
                              │
                    Guardião de Qualidade revisa automaticamente
                              │
                    aprovação/ajuste humano (com ou sem feedback do Guardião)
                              │
                              ▼
                    Publicação (manual hoje; Meta automática = roadmap)
```

Tudo isso pode acontecer solto (telas `/research` e `/content` direto) ou amarrado a um evento do **Calendário** (`/calendar`), que é o "hub" operacional do fluxo completo — ver `duofy-calendario-workflow-v1` na memória do projeto pra mais detalhe sobre F1-F4 desse workflow.

## 11. Autenticação e controle de acesso

JWT entregue via **cookie HttpOnly** (`duofy_token`, `httponly=True`, `samesite=lax`, `secure` em produção) — não fica visível a JS, imune a roubo por XSS. Um segundo cookie não-secreto e legível por JS (`duofy_auth`) só sinaliza "há sessão" pro frontend decidir UI, sem carregar o token de verdade. `get_current_user` aceita tanto esse cookie quanto um header `Authorization: Bearer` (compat com ferramentas/CLI).

Controle de acesso por marca: `assert_brand_access(user, brand_slug)` (em `app/access.py`) é chamado em **19 routers, 69 pontos** — checa `User.brand_scope` e retorna 404 (não 403, pra não vazar existência) se o usuário não tem acesso àquela marca. É o gate pervasivo de isolamento multi-tenant do sistema.

## 12. Infraestrutura assíncrona (Celery)

`AgentTask.task_type` despacha pra um handler (`app/task_service.py`, dict `_TASK_HANDLERS`): `orchestrate`, `research`, `cocreation`, `refine` — tipo desconhecido cai no orquestrador (compat com tarefas legadas). `enqueue_agent_task()` persiste a tarefa como `queued` e despacha via `execute_agent_task_celery.delay(task_id)`; o worker roda `asyncio.run()` **uma vez por tarefa**.

**Bug corrigido nesta sessão** (commit `dcc7e98`): o worker reusava o mesmo engine/pool de conexões da API, que foi desenhado para um único event loop persistente (uvicorn). Cada `asyncio.run()` do worker cria um event loop novo; uma conexão devolvida ao pool por uma tarefa ficava presa ao loop já fechado dela, e a tarefa seguinte que a reusava quebrava com `RuntimeError: ... attached to a different loop` — a `AgentTask` ficava travada em `queued` pra sempre, silenciosamente. Fix: `app/db.py` ganhou `build_engine(null_pool=True)`, e o worker agora usa seu próprio engine com `NullPool` (abre/fecha conexão a cada uso, sem reciclar entre loops) — o mesmo padrão que já existia pro ambiente de teste (`TestClient`/fixtures do pytest têm o mesmo problema de múltiplos loops). Regressão coberta por `apps/api/tests/test_worker_db_pool.py`, que reproduz o bug de verdade contra Postgres real.

## 13. Testes

**Backend**: `345 passed, 2 skipped` (os 2 skips são de PDF — precisam de GTK/Pango/Cairo nativos, ausentes fora do container). Rodar:
```bash
cd apps/api
$env:PYTHONPATH='apps/api'; $env:APP_ENV='test'; $env:JWT_SECRET_KEY='...'; $env:DATABASE_URL='postgresql+asyncpg://duofy:duofy@127.0.0.1:5433/duofy_v1_test'; $env:REDIS_URL='redis://127.0.0.1:6379/1'
python -m pytest apps/api/tests -q
```
CI (`.github/workflows/ci.yml`) roda isso automaticamente em push/PR pra `main`, com Postgres+Redis como service containers, mais `ruff check app alembic` e `alembic upgrade head`.

**Frontend**: `next lint` + `tsc --noEmit` + `next build` (limpos), mais **23 testes E2E via Playwright** (adicionado nesta sessão — `apps/web/tests-e2e/`), cobrindo autenticação, navegação pelas páginas principais, os fluxos assíncronos de pesquisa/cocriação (mockados, sem custo de LLM), e o deep-linking. Rodar:
```bash
cd apps/web && npx playwright test
```
CI roda `next lint` + `next build` no push/PR, mas **não roda o Playwright** — é só local por enquanto.

## 14. Estado por módulo

| Rota | Nav | Status | Observação |
|---|---|---|---|
| `/operations` | Operar | Funcional | Dashboard central + Orquestrador (chat) |
| `/calendar` | Operar | Funcional | Hub do workflow completo (F1-F4) |
| `/research` | Produzir | Funcional | Deep-link `?id=` (item desta sessão) |
| `/content` | Produzir | Funcional | Deep-link `?id=` + abas Visão geral/Editar (item desta sessão) |
| `/approvals` | Governar | Funcional | Fila consolidada de aprovação, com deep-link corrigido |
| `/publicacoes` | Governar | Parcial | Publicação manual funciona; Meta automática é stub (`MetaPublisher` lança exceção de indisponibilidade) |
| `/relatorios` | Governar | Funcional | — |
| `/admin` | Governar | Funcional | Config de qualidade, provedores, agentes, acessos |
| `/memory` | secundário | Parcial | RAG funcional; fallback de embedding local (SHA256) quando provedor externo ausente/falha |
| `/redes` | — | Stub | Fora de escopo do V1; redirect pra `/operations` |
| `/chat`, `/dashboard`, `/costs`, `/insights`, `/workspace` | — | Stub | Redirects — telas antigas descontinuadas em favor de `/operations`/`/relatorios` |

## 15. O que mudou nesta sessão

Trabalho feito numa única sessão longa, do estado em `07eab81` até `581c9a3` (17 commits na `main`):

1. **Endpoints assíncronos de pesquisa/cocriação/refino** — `POST /api/research/run-async`, `/api/cocreation/generate-async`, `/api/cocreation/{id}/refine-async`. Generalizou `task_service.py` (que só o chat usava) pra despachar por `task_type`. Elimina o teto de timeout do proxy Next (~30s) em cargas de LLM longas — o cliente agora enfileira e faz polling via `AgentTask`, em vez de depender de uma única requisição HTTP longa.
2. **Sincronização do ambiente de dev** com `requirements.txt` + gate de teste de PDF endurecido (checa capacidade real de renderizar, não só presença do pacote `weasyprint`).
3. **Suíte Playwright E2E** criada do zero (`apps/web/tests-e2e/`, `playwright.config.ts`) — 14 testes iniciais (auth, navegação, fluxos assíncronos mockados).
4. **Deep-linking de resultados** (feature completa, com spec + plano formais em `docs/superpowers/`): `/research?id=` e `/content?id=` abrem o item direto (sem precisar procurar na lista); a tela de conteúdo ganhou abas "Visão geral" (pacote rico da cocriação, ou markdown renderizado como fallback) e "Editar" (editor de markdown, inalterado); todos os pontos de entrada do sistema (Operações, busca global, Aprovações, Calendário) corrigidos pra linkar com `?id=`. Implementado via 6 tarefas com revisão de spec+qualidade independente por tarefa, mais revisão final whole-branch — todas aprovadas. +9 testes E2E (total 23).
5. **Fix do bug de pool de conexão do worker** (seção 12) — tarefas de agente paravam de travar silenciosamente em `queued`.
6. **Limpeza de código morto** — 615 linhas removidas (2 funções + 23 tipos/constantes em `lib/`, 25 componentes não usados em `icons.tsx`/`ui.tsx`, 4 constantes/função sem uso no backend). Nova varredura independente da auditoria de 2026-07-01 (aquela já tinha sido limpa no Sprint S7); encontrou código morto **novo**, deixado pelo redesign de UI e pelo refactor do `CocreationPanel`.

Suíte final: backend 345 passed/2 skipped (era 319 no início da sessão), frontend 23/23 E2E (não existia no início da sessão).

## 16. Débito técnico e pendências conhecidas

- **`npm audit` em Next.js**: vulnerabilidades altas cujo fix exige subir pra Next 15/16 — adiado como tarefa isolada com plano de regressão (documentado em `DEPLOY.md`).
- **Publicação automática no Meta**: `MetaPublisher` é stub que lança exceção; só publicação manual funciona hoje.
- **RAG/embeddings**: fallback determinístico local (SHA256, não-semântico) quando não há provedor de embeddings configurado ou ele falha — funcional mas não é busca semântica de verdade nesse modo.
- **Testes E2E não rodam em CI**: só localmente por enquanto — CI cobre lint/build do frontend e pytest do backend, mas não o Playwright.
- **Rotação de `JWT_SECRET_KEY`**: acoplada às chaves de provedor cifradas via Fernet — rotacionar sem plano quebra a decriptação de todas as chaves de LLM já salvas (ver seção 6).
- **Seed não é automático** (ver seção 17 — inclusive diverge do que `DEPLOY.md` afirma).
- **`chat.py` router e endpoint de comparação de versões**: ainda funcionam no backend, mas o frontend parou de usá-los (UI de chat foi descontinuada, tipos correspondentes já removidos do frontend nesta sessão). Remover o suporte de backend também é decisão de produto, não foi feito.
- **Import cross-rota**: `apps/web/app/(app)/content/page.tsx` importa `ContentPackageView` de dentro de `app/(app)/operations/` via caminho relativo — funciona, mas é uma dependência entre rotas que idealmente viveria num `components/` compartilhado se crescer mais.

## 17. Discrepâncias entre documentação e código (achadas nesta pesquisa)

- **`DEPLOY.md` diz que o JWT cookie "ainda não é HttpOnly"** — isso está **desatualizado**. O código atual (`app/routers/auth.py`, `_set_auth_cookies`) já usa `httponly=True`. Esse hardening foi feito em sessão anterior (ver memória `duofy-seguranca-hardening`); `DEPLOY.md` não foi atualizado depois.
- **`DEPLOY.md` diz que "o primeiro boot semeia" admin/marcas/agentes automaticamente** — isso **não corresponde** ao código: nem `docker-compose.yml`, nem `docker-compose.prod.yml`, nem o `Dockerfile` da API chamam `app.seed` em lugar nenhum. É sempre um passo manual (`docker compose exec api python -m app.seed`), como o próprio `README.md` documenta corretamente em outro lugar. Vale corrigir o `DEPLOY.md` pra não confundir quem for fazer deploy pela primeira vez.

## 18. Acessos e credenciais (dev)

- Login: `admin@duofy.com.br` / `admin123456` (via `docker compose exec api python -m app.seed`, usa os defaults de `.env.example`)
- Marcas seedadas: `duofy_solucoes`, `postos_combustiveis`, `deathcare`
- Nenhum provedor de LLM vem habilitado por padrão — configurar em `/admin` (chave cifrada com Fernet, derivado de `JWT_SECRET_KEY` se `FERNET_SECRET_KEY` não for setado)

## 19. Onde encontrar mais informação

- **Specs e planos de features** implementadas via processo estruturado (brainstorm → spec → plano → execução): `docs/superpowers/specs/` e `docs/superpowers/plans/`
- **Manuais de produto/negócio**: `docs_entrega_duofy/` (executivo, usuário, admin, agentes, calendário, publicações/roadmap, suporte)
- **Estado técnico interno anterior** (2026-07-06, parcialmente defasado por este documento): `docs_interno/00_ESTADO_REAL_CONSOLIDADO_INTERNO.md`
- **Auditoria técnica completa** (2026-07-01): `docs/auditoria_tecnica_2026-07-01/` — arquitetura, funcionalidades, segurança, modelo de dados, qualidade/código morto, infra/deploy
- **Guia de deploy**: `DEPLOY.md` (raiz do repo) — ver seção 17 pra 2 pontos desatualizados
