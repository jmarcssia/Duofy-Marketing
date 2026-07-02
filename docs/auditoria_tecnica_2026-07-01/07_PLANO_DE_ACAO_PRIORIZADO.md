# 07 · Plano de Ação Priorizado

Backlog consolidado a partir das 6 auditorias, ordenado por prioridade. Esforço em escala relativa: **P** (pequeno, < 0,5 dia) · **M** (médio, 0,5–2 dias) · **G** (grande, 2–5 dias).

Legenda de origem: [02] Funcionalidades · [03] Segurança · [04] Dados · [05] Qualidade · [06] Infra.

---

## Fase 0 — Bloqueadores (antes de qualquer produção)

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 0.1 | **Migrar JWT para cookie `HttpOnly; Secure; SameSite=Strict`** emitido pelo backend; ler server-side; ajustar `getTokenFromCookie` nas telas | **G** | [03] C-1 |
| 0.2 | **Rate limiting + lockout no `/login`** (slowapi ou no Caddy) + remover credenciais default do form | **M** | [03] C-2 |
| 0.3 | **Automatizar o seed no boot** (`alembic upgrade head && python -m app.seed` no serviço `migrate`) e corrigir o DEPLOY.md | **P** | [06] §4 |
| 0.4 | **Atualizar Next.js** (14.2.x/15.x patcheado) em branch isolada com regressão | **M** | [03] A-4 |

**Resultado da Fase 0:** fecha os dois vetores exploráveis remotamente (C-1, C-2), torna o deploy funcional (0.3) e elimina o bypass de middleware (0.4).

---

## Fase 1 — Segurança estrutural

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 1.1 | **Separar `JWT_SECRET_KEY` da chave de criptografia** (`SECRETS_ENCRYPTION_KEY` via `Fernet.generate_key()`); suportar rotação com re-cifragem. **Fazer antes de qualquer rotação.** | **M** | [03] C-3 |
| 1.2 | **Escopar documentos por marca/usuário** (download/export/chunks/list) — fechar IDOR/BOLA | **M** | [03] A-2 |
| 1.3 | **Revogação de token:** reduzir expiração (30–60 min) + refresh token + `jti`/denylist em Redis | **G** | [03] A-1 |
| 1.4 | **Conter SSRF no research:** validar esquema/host, bloquear IPs privados/loopback/link-local/metadata, limitar redirects | **M** | [03] M-1 |
| 1.5 | **Non-root no container da API** + `cap_drop`; rodar Chromium **com** sandbox | **M** | [03] M-4/M-5 |
| 1.6 | Allowlist de host para `base_url` de provedor (evitar roubo de API key) | **P** | [03] M-2 |
| 1.7 | HSTS + CSP + `frame-ancestors` no Caddy | **P** | [03] B-4 |

---

## Fase 2 — Prontidão operacional

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 2.1 | **Backup automatizado do Postgres** (cron/systemd: `pg_dump` custom + tar do storage + retenção) | **M** | [06] §8 |
| 2.2 | **Limites de recurso** (`mem_limit`/`cpus`) para `worker` e `api` — evitar OOM | **P** | [06] §8 |
| 2.3 | **Healthcheck no worker** (`celery inspect ping`) | **P** | [06] §7 |
| 2.4 | Rotação/limite de logs (`json-file max-size/max-file`) | **P** | [06] §7 |
| 2.5 | Mover o **scheduler de calendário** para Celery beat (sair do processo web) | **M** | [02] §1.10 |
| 2.6 | Pin/lock de dependências (`requirements` com teto; web `npm ci` com lockfile) | **M** | [06] §3 |

---

## Fase 3 — Verificação (testes & CI)

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 3.1 | **CI mínima** (GitHub Actions): `ruff check` + `pytest` + `next lint` + `next build` em push/PR | **M** | [05] §3 |
| 3.2 | `conftest.py` com **DB de teste** (Postgres efêmero/testcontainers) | **M** | [05] §3 |
| 3.3 | Testes E2E do **login JWT** (login → token → rota protegida → 401) | **M** | [05] §3 |
| 3.4 | Testes E2E do **fluxo de aprovação** (gerar → submit-review → Guardião → approve/reject) | **G** | [05] §3 |
| 3.5 | Testes de **RAG** (upload → chunk → embed → busca) e **worker/orquestrador** | **G** | [05] §3 |
| 3.6 | Smoke test de frontend (Playwright) das 7 telas reais | **M** | [05] §3 |

---

## Fase 4 — Higiene de código (baixo risco, alto ganho)

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 4.1 | Deletar `lib/mock.ts` (489 linhas) | **P** | [05] §2.2 |
| 4.2 | Deletar cluster órfão (`chat-panel`, `kanban-board`, `card-popup`, `inspector-bar`, `logout-button`; reduzir `document-workspace` ao tipo `ExportFormat` ou movê-lo) | **M** | [05] §2.1 |
| 4.3 | Decidir sobre `/admin/agents` e `/admin/config` (remover ou re-linkar) | **P** | [05] §2.4 |
| 4.4 | Remover funções sombreadas de `routers/outputs.py`; deletar `pdf_service.py` | **P** | [05] §2.5/2.6 |
| 4.5 | Consolidar `_provider_for_model` (5×, com a divergência `~anthropic/`) e `_plain_text` (4×) | **M** | [05] §2.7 |
| 4.6 | Corrigir a classe Tailwind **`surface`** inexistente (17 usos) | **P** | [05] §2.10 |
| 4.7 | Enxugar `middleware.ts`/`matcher` das 9 rotas mortas; centralizar `API_URL`; importar tipos de `lib/api.ts` no admin | **P** | [05] §4 |
| 4.8 | Tratamento **centralizado de 401** no `apiFetch` (logout automático) + padronizar `Promise.allSettled` | **M** | [02] §2 |

---

## Fase 5 — Robustez de dados e RAG

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 5.1 | Confirmar com `EXPLAIN ANALYZE` se a query RAG usa o índice HNSW; se não, reescrever para `ORDER BY embedding <=> :q LIMIT k` por tabela | **M** | [04] §3 |
| 5.2 | Adicionar `ON DELETE CASCADE` (ou lógica explícita de limpeza) nas FKs de `outputs`/filhos | **M** | [04] §5 |
| 5.3 | Criar índice faltante `ix_calendar_events_category` + índices nas FKs mais quentes | **P** | [04] §2/§4 |
| 5.4 | Avisar/validar quando o embedding do provider não for 1536-D (em vez de truncar em silêncio); `embed_text` com try/retry | **P** | [04] §3 / [02] §1.12 |
| 5.5 | Decidir sobre `brand_slug`: FK real ou documentar o modelo desacoplado | **M** | [04] §5 |

---

## Fase 6 — Funcionalidades e produto

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 6.1 | **Upload de documentos na `/memory`** (o backend já existe) | **M** | [02] §1.13 |
| 6.2 | Decidir sobre **assessoria de imprensa**: expor UI para `/api/press` ou remover o router | **M** | [05] §1 |
| 6.3 | Documentar/expor o **override de modelo** (`default_model` sobrepõe a escolha do usuário) — é bug ou feature? | **P** | [02] §1.17 |
| 6.4 | Migrar o checkpointer do orquestrador de `MemorySaver` para `AsyncPostgresSaver` (estado durável) | **G** | [01] §3 |
| 6.5 | Substituir mock de `/redes` por backend real (Meta Ads/Instagram) — ou marcar como "roadmap" na UI | **G** | [02] §2 |
| 6.6 | Concluir integrações "Em breve" do admin (Permissões, Sheets, Tavily, SendGrid) conforme roadmap | **G** | [02] §2 |

---

## Fase 7 — Documentação

| # | Ação | Esforço | Origem |
|---|---|:---:|---|
| 7.1 | Corrigir seção de rotas do `README.md` (dashboard/costs/insights são redirects) e o passo de seed do `DEPLOY.md` | **P** | [05] §6 |
| 7.2 | Arquivar docs estale (`ESTADO_ATUAL_DO_SISTEMA.md`, `SPRINT_FINAL_STATUS.md`); eleger `ESTADO_PROJETO_2026-06-26.md` como fonte de verdade | **P** | [05] §6 |
| 7.3 | Atualizar `IMPLEMENTATION_STATUS.md` para refletir o `/operations` unificado | **P** | [05] §6 |

---

## Roadmap sugerido (visão de sprints)

- **Sprint 1 — "Deploy seguro":** Fase 0 completa + 1.1, 1.2 + 2.1, 2.2, 2.3. → sistema instalável e sem os vetores críticos.
- **Sprint 2 — "Confiança":** Fase 3 (CI + testes E2E de login e aprovação) + Fase 4 (limpeza de código morto). → regressões passam a ser detectáveis; repositório enxuto.
- **Sprint 3 — "Robustez":** restante da Fase 1, Fase 2 (2.4–2.6), Fase 5. → segurança em profundidade + RAG/dados sólidos.
- **Sprint 4+ — "Produto":** Fase 6 conforme prioridade de negócio + Fase 7.

### Definição de "pronto para produção" (Definition of Done)
1. Fase 0 e Fase 2 (2.1–2.3) concluídas.
2. C-3 (separação de segredos) e A-2 (IDOR) fechados.
3. CI verde com ao menos os testes E2E de login e aprovação.
4. Backup automatizado verificado (restore testado).
5. Documentação de deploy corrigida e validada num deploy limpo real.

---

> Índice completo: **[README](README.md)** · Comece pelo **[Sumário Executivo](00_SUMARIO_EXECUTIVO.md)**.
