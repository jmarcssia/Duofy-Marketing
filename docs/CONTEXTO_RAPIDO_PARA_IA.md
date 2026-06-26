# Contexto Rápido para IA - DUOFY V1

Este arquivo resume o estado real do projeto para uma nova IA começar a ajudar sem ler todo o repositório. Ele foi derivado de `docs/ESTADO_ATUAL_DO_SISTEMA.md`, `docs/MAPA_TECNICO_E_OPERACIONAL.md` e da inspeção local do código, banco, Docker, migrations e testes. Não inclui segredos reais.

## Objetivo do sistema

O DUOFY V1 é uma aplicação local-first para operação de marketing com IA. O sistema permite configurar marcas e provedores LLM, carregar documentos para memória/RAG, gerar conteúdo, rodar pesquisas de mercado, revisar entregas com um Guardião de Qualidade, aprovar/rejeitar outputs, exportar documentos e acompanhar custos/auditoria operacional.

O produto atual serve para demonstração e uso controlado. Ainda não está pronto para produção multiusuário/multicliente porque faltam isolamento por workspace, hardening de autenticação, deploy produtivo, backups, rate limit, limites reais de custo e cobertura robusta de testes integrados.

## Escopo contratado/implementado até agora

Implementado de forma funcional ou parcial:

- Monorepo local com FastAPI, Next.js, PostgreSQL + pgvector, Redis e Celery.
- `/health` funcional.
- Frontend com rotas internas principais.
- Login JWT básico.
- Admin para provedores/modelos e configurações do Guardião.
- 7 agentes cadastrados via seed e prompts em `config/agents`.
- Upload e indexação de documentos PDF, DOCX, TXT e MD.
- RAG com embeddings em pgvector.
- Geração de conteúdo versionado.
- Pesquisa de mercado com fontes externas e relatório salvo como output.
- Aprovação/rejeição/ajuste de outputs.
- Guardião de Qualidade local/híbrido com LLM opcional.
- Exportação PDF, DOCX, MD e HTML.
- Métricas/custos estimados e auditoria operacional.

Fora do escopo real atual ou não implementado:

- Publicação em redes sociais.
- Geração de imagens.
- Integração real com calendário externo.
- Mailing/PR externo.
- Billing real dos provedores.
- Supabase/n8n.
- WYSIWYG completo.
- Produção com domínio/HTTPS/reverse proxy.

## Arquitetura

Arquitetura atual:

- Frontend Next.js em `apps/web`.
- Backend FastAPI em `apps/api`.
- PostgreSQL 16 + pgvector como banco principal e vetorial.
- Redis como broker/backend Celery e lock do scheduler.
- Worker Celery para tarefas assíncronas do chat.
- Filesystem local `storage/documents` para arquivos enviados.
- Provedores LLM configurados no banco via Admin.

Fluxo geral:

1. Usuário acessa Next.js em `localhost:3000`.
2. Frontend chama FastAPI em `localhost:8000` via REST.
3. FastAPI autentica JWT, consulta Postgres e, quando necessário, chama Redis, worker, RAG ou provider LLM.
4. Outputs, versões, decisões, revisões, documentos, chunks, memórias, chamadas LLM e auditoria são persistidos em Postgres.

Não há GraphQL nem WebSocket. Há SSE para status de tarefas em `GET /api/tasks/{task_id}/stream`.

## Stack validada

- Frontend: Next.js `14.2.35`, React `18.3.1`, TypeScript, Tailwind.
- Backend container: Python `3.11.15`, FastAPI `0.138.0`, SQLAlchemy `2.0.51`, Uvicorn `0.49.0`.
- Banco: PostgreSQL `16.14`.
- Vetorial: pgvector `0.8.2`.
- Redis: `7.4.9`.
- Worker: Celery `5.6.3`.
- Testes backend: pytest.
- Lint Python: ruff.
- Exportação: ReportLab, python-docx, HTML/Markdown próprios.
- Pesquisa externa: httpx, feedparser, BeautifulSoup, trafilatura, Playwright/Chromium, Apify opcional.
- Docker local: Compose com `postgres`, `redis`, `api`, `web`, `worker`.

Observação importante: o container web roda `npm run dev`, não `next start`; isso não é configuração de produção.

## Módulos principais

Frontend:

- `/login`: autenticação.
- `/dashboard`: visão geral simples.
- `/chat`: chat com tarefas assíncronas.
- `/content`: geração, edição, versão, exportação e envio para aprovação.
- `/approvals`: revisão, comentários, Guardião, aprovação/rejeição/ajuste.
- `/memory`: upload de documentos, chunks, busca RAG, download/exportação.
- `/research`: pesquisa de mercado, fontes, salvar como memória e usar em conteúdo.
- `/calendar`: calendário editorial interno parcial.
- `/costs`: métricas de uso/custos estimados.
- `/insights`: relatórios internos.
- `/operations`: auditoria, saúde de agentes, qualidade e eventos.
- `/admin/agents`: execução/listagem de agentes.
- `/admin/config`: provedores, modelos, ferramentas e Guardião.

Backend:

- Auth: `apps/api/app/routers/auth.py`.
- Admin: `apps/api/app/routers/admin.py`.
- Agents: `apps/api/app/routers/agents.py`.
- Chat/tasks: `chat.py`, `tasks.py`, `task_service.py`, `worker.py`.
- Content: `content.py`, `content_generation.py`.
- Outputs/workflow: `outputs.py`, `output_workflow.py`.
- Documents/RAG: `documents.py`, `document_processing.py`, `embeddings.py`, `rag.py`, `memory.py`.
- Research: `research.py`, `research_service.py`.
- Calendar: `calendar.py`, `calendar_service.py`, `calendar_scheduler.py`.
- Press: `press.py`.
- Metrics/reports: `metrics.py`, `metrics_service.py`, `reports.py`.
- Operations/audit: `operations.py`, `operations_service.py`, `audit_service.py`.
- Export: `export_service.py`.
- Quality Guardian: `quality_guardian.py`.

## Agentes

Existem 7 agentes ativos no banco e em `config/agents`:

| Agente | Responsabilidade | Status real |
|---|---|---|
| `orchestrator` | Roteamento/execução geral via LLM e RAG quando chamado genericamente. | PARCIAL: não há orquestração multiagente complexa. |
| `research_agent` | Síntese de pesquisa de mercado com fontes externas. | FUNCIONAL. |
| `content_agent` | Geração de conteúdo estruturado com templates e RAG. | FUNCIONAL. |
| `calendar_agent` | Geração/execução de calendário interno. | PARCIAL. |
| `press_agent` | Geração textual de assessoria/release. | PARCIAL; não envia mailing. |
| `metrics_agent` | Diretriz para métricas; relatórios atuais são agregações locais. | PARCIAL. |
| `quality_guardian` | Revisão local/híbrida de outputs com score e bloqueios. | FUNCIONAL. |

Modelo padrão atual no banco:

- Maioria dos agentes: `~anthropic/claude-sonnet-latest` via OpenRouter.
- `metrics_agent`: `openai/gpt-4o-mini`.

Provider observado:

- OpenRouter habilitado e com chave presente no banco.
- OpenAI, Anthropic, OpenAI embeddings e Apify desabilitados/sem chave no estado observado.

Nunca expor chaves reais. Providers são armazenados em `provider_credentials`, com segredo criptografado.

## Estado atual real

Estado observado no ambiente local:

- Docker: API, Web, Worker, Postgres e Redis rodando.
- API `/health`: ok.
- Alembic: `0014_audit_events`.
- Agentes: 7 ativos.
- Outputs: 13.
- Documentos: 4 indexados.
- Chunks: 110.
- Memórias: 6.
- Model calls: 13, OpenRouter, concluídas.
- Eventos de calendário: 0.
- Auditoria: 6 eventos.

Checks reportados como passados:

- `python -m ruff check apps/api/app apps/api/alembic apps/api/tests`
- `$env:PYTHONPATH='apps/api'; python -m pytest` com 14 testes.
- `npm.cmd --prefix apps/web run lint`
- `npm.cmd --prefix apps/web run build`
- `docker compose exec api alembic upgrade head`
- `docker compose exec api python -m app.seed`

## Decisões técnicas importantes

- Local-first: tudo roda via Docker Compose.
- PostgreSQL é fonte principal de verdade.
- pgvector é usado no próprio Postgres, não há vector DB externo.
- Embeddings usam OpenAI se configurado, senão fallback local determinístico.
- Outputs são versionados em `outputs` e `output_versions`.
- Aprovação final depende da última revisão válida do Guardião.
- Pesquisa salva relatório como output `channel="Pesquisa"` e `format="research_report"`.
- Custos são estimados por tabela local, não billing oficial.
- Prompts ativos ficam em `config/agents`; templates em `config/templates`.
- Seed é idempotente e usa `config/seeds`.

## Principais pendências

Pendências críticas antes de produção:

- Implementar workspaces/tenants e isolamento por usuário/marca/recurso.
- Migrar autenticação para cookie HttpOnly/Secure ou sessão server-side.
- Proteger todas as rotas internas no middleware.
- Configurar deploy web de produção, não `next dev`.
- Adicionar reverse proxy, HTTPS, domínio e secrets management.
- Persistir `storage/documents` em volume/storage externo.
- Implementar backup/restore de Postgres e arquivos.
- Implementar rate limit e budgets reais.
- Criar testes integrados dos fluxos principais.
- Criar testes E2E frontend.
- Completar Admin de usuários, marcas, regras, limites e prompts.

## Bugs e débitos conhecidos

- Alguns arquivos antigos/documentações podem mostrar mojibake quando lidos em console Windows. O sistema tem `text_repair.py`, mas a fonte deve ser revisada se aparecerem sequências corrompidas típicas de UTF-8 interpretado como Windows-1252 em UI/outputs.
- Middleware protege apenas alguns prefixos: `/dashboard`, `/admin`, `/approvals`, `/content`, `/memory`, `/research`. Rotas como `/chat`, `/calendar`, `/costs`, `/insights`, `/operations` dependem mais de checagem client-side.
- Sem workspace isolation.
- Sem CRUD completo de usuários/perfis.
- Sem reindexação dedicada pela UI.
- Sem limpeza/retention jobs.
- Sem retries/backoff robusto para LLM e coleta externa.
- Sem CI/CD e sem Git detectado no diretório atual durante auditoria.

## Riscos principais

- Vazamento entre usuários se o sistema for usado por mais de uma organização.
- Perda de arquivos enviados por falta de volume explícito para `storage/documents`.
- Abuso/custo alto de LLM sem rate limit/budget.
- Falha de segurança por token em cookie acessível por JavaScript.
- Diferença entre expectativa de “orquestrador multiagente” e implementação real parcial.
- Pesquisa externa instável por bloqueios, timeout ou páginas dinâmicas.
- Auditoria não é retroativa e não cobre todos os eventos possíveis.
- Poucos testes automatizados para fluxos críticos.

## Comandos úteis

Subir local:

```powershell
cd C:\DUOFY_V1_MARKETING_AI
Copy-Item .env.example .env
docker compose build api web worker
docker compose up -d postgres redis api web worker
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
Invoke-RestMethod http://localhost:8000/health
```

Checks:

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
```

Inspeção:

```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose exec postgres psql -U duofy -d duofy_v1
docker compose exec api alembic current
```

## Infraestrutura

Serviços atuais no Compose:

- `postgres`: `pgvector/pgvector:pg16`, porta host padrão `5433`.
- `redis`: `redis:7-alpine`, porta `6379`.
- `api`: FastAPI/Uvicorn, porta `8000`.
- `web`: Next dev server, porta `3000`.
- `worker`: Celery.

Volumes:

- `postgres_data`.
- `redis_data`.

Não há volume explícito para documentos. Isso precisa ser corrigido antes de produção.

Não há:

- Nginx/Caddy/Traefik.
- HTTPS.
- Domínio.
- Restart policies.
- Backup automatizado.
- Observabilidade externa.
- Pipeline CI/CD.

## Prioridades imediatas recomendadas

1. Corrigir segurança base: auth, middleware, cookies e roles.
2. Implementar workspaces/tenant isolation.
3. Ajustar Docker/infra para produção: `next build/start`, proxy, HTTPS, volumes, restart.
4. Criar backup/restore testado.
5. Criar testes integrados de auth, providers, content, RAG, research, approvals, export e operations.
6. Criar E2E com Playwright para login, upload, geração, aprovação e exportação.
7. Implementar rate limits e budgets reais.
8. Completar Admin de usuários, marcas, regras, limites e prompts.
9. Fortalecer orquestrador real se isso for requisito de produto.
10. Atualizar README operacional para refletir o estado atual.

## Regras que não podem ser quebradas

- Não expor segredos reais, chaves API ou senhas.
- Não tratar README, prompts ou planos como implementação se não houver código/schema/endpoint real.
- Não implementar publicação externa, geração de imagens, Supabase ou n8n sem pedido explícito.
- Não quebrar compatibilidade dos endpoints existentes sem migração clara.
- Não apagar versões antigas de outputs.
- Não pular o Guardião no fluxo de aprovação.
- Não usar dados mockados onde já existem dados reais no backend.
- Não reverter mudanças do usuário sem autorização explícita.
- Não usar comandos destrutivos como `git reset --hard` ou remoção recursiva sem aprovação.
- Manter a aplicação local-first até decisão explícita de produção/cloud.
- Qualquer mudança em banco deve vir por Alembic.
- Qualquer nova tela deve consumir API real ou declarar explicitamente empty state real.

## Leia primeiro estes arquivos

1. `docs/ESTADO_ATUAL_DO_SISTEMA.md`
2. `docs/MAPA_TECNICO_E_OPERACIONAL.md`
3. `handoff/CODEX_PROMPT_MESTRE.md`
4. `docker-compose.yml`
5. `.env.example`
6. `apps/api/app/main.py`
7. `apps/api/app/models.py`
8. `apps/api/app/schemas.py`
9. `apps/api/app/settings.py`
10. `apps/api/app/routers/outputs.py`
11. `apps/api/app/content_generation.py`
12. `apps/api/app/research_service.py`
13. `apps/api/app/quality_guardian.py`
14. `apps/web/lib/api.ts`
15. `apps/web/components/document-workspace.tsx`
