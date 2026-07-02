# 00 · Sumário Executivo

**Projeto:** Duofy V1 Marketing AI — plataforma interna de marketing assistido por IA (orquestrador multiagente, cocriação de conteúdo, pesquisa de mercado, calendário editorial, memória/RAG, métricas de custo e assessoria de imprensa).
**Data da auditoria:** 2026-07-01 · **Branch:** `main` · **HEAD:** `9dfa586`.
**Escopo:** backend (FastAPI, ~10.446 linhas Python), frontend (Next.js 14, ~10.195 linhas TS/TSX), banco (PostgreSQL + pgvector, 24 tabelas, 15 migrations), infraestrutura (Docker dev + prod com Caddy/TLS), segurança e qualidade.

---

## 1. Veredito geral

O Duofy V1 é um **MVP maduro e majoritariamente real**, não um protótipo de fachada. O núcleo funcional está implementado de verdade e conectado ponta a ponta (UI → API → banco → agentes de IA). A distância até "pronto para produção séria" é composta por três eixos claros e tratáveis:

1. **Segurança de autenticação** — o maior débito. JWT em cookie legível por JavaScript, sem rate limiting no login, e um acoplamento de segredos que impede rotação de chave.
2. **Higiene de código** — ~2.850 linhas de código morto no frontend (restos do último redesign) e helpers duplicados no backend, que inflam o repositório e confundem a leitura do estado real.
3. **Verificação** — a suíte de testes cobre bem lógica isolada, mas **não valida nenhum fluxo de negócio ponta a ponta**, não usa banco real, não testa auth/aprovação/worker/RAG, não tem testes de frontend e **não há CI**.

Nenhum desses eixos exige reescrita. São hardening, limpeza e cobertura — trabalho de acabamento, não de fundação.

### O que está genuinamente bom (pontos fortes confirmados)

- **Orquestração de IA real**: grafo LangGraph multiagente (chat) + serviços de geração diretos, com 5 ferramentas (research, content, press, calendar, memory). Sem chave de provedor, o sistema **levanta erro amigável — não devolve dado falso**.
- **Guardião de Qualidade** sofisticado: rubrica determinística local + avaliação híbrida por LLM, com gate real antes da aprovação humana.
- **RAG com pgvector** e índices HNSW (`vector_cosine_ops`), dimensão 1536 consistente em todo o sistema.
- **Hardening de segredos fail-fast**: a API se recusa a subir em produção com segredo/senha default (`settings.py:44-65`), reforçado no `docker-compose.prod.yml` com `${VAR:?}`.
- **Stack de produção sólida na borda**: só o Caddy expõe 80/443; banco, Redis, API e worker ficam na rede interna; TLS automático via Let's Encrypt; same-origin sem CORS.
- **Frontend com tipagem forte** (zero `any` em todo `apps/web`) e 7 telas realmente integradas à API.

---

## 2. Scorecard por dimensão

| Dimensão | Nota | Leitura |
|---|:---:|---|
| Arquitetura & design | **8,0 / 10** | Camadas serviço/router limpas; dois "cérebros" de IA bem definidos; algumas duplicações. |
| Funcionalidades (maturidade) | **7,5 / 10** | Maioria REAL; poucas PARCIAL/FRÁGIL; 1 tela MOCK (`/redes`). |
| Modelo de dados | **8,0 / 10** | Esquema coeso e consistente; dívidas de integridade (sem cascades, `brand_slug` sem FK). |
| Alinhamento front ↔ back | **8,0 / 10** | Nenhuma chamada quebrada; poucas rotas órfãs no back. |
| Segurança | **4,5 / 10** | 3 críticas + 4 altas; base ok (sem SQLi, sem path traversal), mas auth é o calcanhar. |
| Infraestrutura & deploy | **6,5 / 10** | Borda sólida; bootstrap do admin não automatizado; sem backup/limites de recurso. |
| Qualidade de código | **7,0 / 10** | Limpo (zero TODO/FIXME reais), mas com código morto e duplicação. |
| Testes & CI | **2,0 / 10** | ~20% de confiança; nenhum teste E2E, nenhum de frontend, **nenhuma CI**. |
| Documentação | **6,0 / 10** | Um doc de estado é excelente; vários outros desatualizados vs. a UI atual. |
| **Global (ponderado)** | **≈ 6,3 / 10** | Núcleo forte; segurança e testes puxam para baixo. |

---

## 3. Top 10 riscos (priorizados)

| # | Risco | Sev. | Onde | Doc |
|---|-------|:----:|------|-----|
| 1 | JWT em cookie **sem HttpOnly/Secure** → roubo de sessão por XSS | 🔴 Crítica | `apps/web/lib/auth.ts:15-19` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 2 | **Sem rate limiting no login** + form pré-preenchido com senha default → brute-force imediato | 🔴 Crítica | `apps/api/app/routers/auth.py:21-37` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 3 | **`JWT_SECRET_KEY` deriva a chave Fernet** → rotacionar o segredo inutiliza todas as API keys cifradas | 🔴 Crítica | `apps/api/app/crypto.py:11-14` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 4 | **Seed do admin não roda no boot** → deploy limpo fica sem login (contradiz o DEPLOY.md) | 🟠 Alta (op.) | `apps/api/app/seed.py:152` / `main.py:41-54` | [06](06_INFRAESTRUTURA_E_DEPLOY.md) |
| 5 | **IDOR/BOLA em documentos** → qualquer usuário baixa/exporta documento de qualquer marca | 🟠 Alta | `apps/api/app/routers/documents.py:51-59,221-253` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 6 | **Next.js 14.2.35 com CVEs** (inclui bypass de middleware) enquanto a proteção de rotas depende do middleware | 🟠 Alta | `apps/web/package.json:12` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 7 | **Nenhum teste E2E/integração/CI** → regressão silenciosa no caminho crítico | 🟠 Alta | `apps/api/tests/*`, ausência de `.github/workflows` | [05](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md) |
| 8 | **SSRF no research** (fetch de URLs arbitrárias + Chromium `--no-sandbox`, container root) | 🟡 Média | `apps/api/app/research_service.py:109-137` | [03](03_SEGURANCA_E_VULNERABILIDADES.md) |
| 9 | **Sem backup automatizado do Postgres** + sem limites de recurso (risco de OOM na VPS) | 🟡 Média | `DEPLOY.md §4`, `docker-compose.prod.yml` | [06](06_INFRAESTRUTURA_E_DEPLOY.md) |
| 10 | **Fallback de embeddings local** (hash SHA-256) degrada o RAG silenciosamente sem chave | 🟡 Média | `apps/api/app/embeddings.py:29-41` | [02](02_FUNCIONALIDADES_E_NIVEIS_DE_CONFIANCA.md) |

---

## 4. O código está alinhado? Tem código desnecessário?

**Alinhado:** sim, no contrato front↔back — **nenhuma chamada do frontend aponta para rota inexistente**, e a tipagem em `lib/api.ts` casa com os `response_model` do backend. Nota de alinhamento: **8,0/10**.

**Código desnecessário:** sim, e é significativo — mas concentrado e de baixo risco para remover:

- **Frontend (~2.850 linhas mortas):** `lib/mock.ts` (489 linhas, zero importadores) + cluster de 5 componentes órfãos do redesign anterior (`chat-panel`, `kanban-board`, `card-popup`, `inspector-bar`, `document-workspace` — este último só exporta um tipo ainda usado). Mais 7 páginas que viraram `redirect` e 2 páginas admin funcionais porém **sem link na navegação** (`/admin/agents`, `/admin/config`).
- **Backend:** `pdf_service.py` (wrapper órfão), funções redefinidas/sombreadas em `routers/outputs.py`, e `_provider_for_model` duplicado em 5 arquivos (com uma divergência de comportamento).
- **Rotas de API sem consumidor:** router `press` inteiro, `PATCH /api/agents/runs/{id}/status`, endpoints `/pdf` dedicados e os de manutenção `reformat-legacy`/`repair-formatting`.
- **Bug de estilo:** a classe Tailwind `surface` é usada 17× em 5 arquivos mas **não existe** — silenciosamente ignorada.

Detalhe importante: **`lib/mock.ts` não está mais ligado a nenhuma tela**. A única tela mock (`/redes`) define seus próprios dados hardcoded localmente. Ou seja, "o sistema usa mock" é hoje **falso**, exceto por `/redes`.

---

## 5. Recomendação de sequência (resumo)

1. **Sprint de segurança (bloqueadores):** cookie HttpOnly/Secure, rate limiting no login, separar `JWT_SECRET_KEY` da chave de criptografia, escopar documentos por marca, atualizar Next.js. → [03](03_SEGURANCA_E_VULNERABILIDADES.md)
2. **Sprint de bootstrap/produção:** automatizar o seed no `migrate`, backup em cron, limites de memória, healthcheck do worker, non-root no container da API. → [06](06_INFRAESTRUTURA_E_DEPLOY.md)
3. **Sprint de higiene:** deletar as ~2.850 linhas mortas, consolidar helpers duplicados, corrigir a classe `surface`, decidir sobre páginas órfãs. → [05](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md)
4. **Sprint de verificação:** CI mínima (ruff + pytest + next lint/build) + `conftest.py` com banco de teste + testes E2E de login e do fluxo de aprovação. → [05](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md)

O plano detalhado, com esforço estimado por item, está em **[07 · Plano de Ação Priorizado](07_PLANO_DE_ACAO_PRIORIZADO.md)**.
