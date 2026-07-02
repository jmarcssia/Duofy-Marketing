# IMPLEMENTATION_STATUS — DUOFY V1

Atualizado em 2026-06-22.

## Resumo

A V1 está implementada como stack local-first: FastAPI, Next.js 14, PostgreSQL + pgvector, Redis/Celery e configurações em Markdown/YAML. A Fase 16 conclui a implementação das skills V1 dos 7 agentes, centraliza prompts em `/config/agents` e adiciona o Guardião de Qualidade como gate real antes da aprovação humana.

## Mapa por fase

| Fase | Tema | Estado |
|------|------|--------|
| 1 | Fundação técnica | Concluída |
| 2 | Auth JWT, layout, seed | Concluída |
| 3 | Config externa | Concluída |
| 4 | Chat, tarefas e orquestrador | Concluída |
| 5 | Memória, documentos e RAG | Concluída |
| 6 | Cocriação de conteúdo | Concluída |
| 7 | Pesquisa de mercado | Concluída |
| 8 | Aprovações, versões e aprendizado | Concluída |
| 9 | Calendário e assessoria | Concluída |
| 10 | Métricas, custos e exportação | Concluída |
| 11-15 | Workspace, documentos e polimento | Concluídas com validação visual |
| 16 | Skills dos 7 agentes e Guardião | Implementada nesta rodada |

## Núcleo consolidado — 5 agentes + 2 módulos (Sprint 2026-07-01)

O roster foi consolidado em **5 agentes**. Calendário e Métricas passaram a **módulos**
(o Calendário é módulo do usuário + ferramenta do Orquestrador; Métricas alimenta Admin ›
Custos/Relatórios). Detalhes por etapa em `docs/auditoria_tecnica_2026-07-01/SPRINT_S*`.

| Agente | Slug | Estado |
|--------|------|--------|
| Orquestrador | `orchestrator` | Grafo LangGraph (chat) + `/api/agents/run`; dono do módulo Calendário |
| Pesquisa e Inteligência | `research_agent` | Serviço de pesquisa real; nº de fontes configurável |
| Cocriação e Conteúdo | `content_agent` | Outputs versionados |
| Assessoria de Imprensa | `press_agent` | Outputs de imprensa |
| Guardião de Qualidade | `quality_guardian` | Gate real com tabela `quality_reviews` |

| Módulo | Config | Estado |
|--------|--------|--------|
| Calendário | prompt/limite `calendar_agent` | CRUD do usuário + tool `create_calendar`; geração via Orquestrador |
| Métricas | prompt `metrics_agent` | Relatórios determinísticos (sem LLM); custos/uso via `ModelCall` |

Destaques do sprint: modelo escolhido = modelo executado (`provider_for_model` único);
RAG isolado por marca; embeddings resilientes; `/redes` oculto; ~2.900 linhas de código
morto removidas; **rede de segurança de testes de integração (Postgres real) + CI**.

## Fase 16

- Prompts V1 normalizados e instalados em `config/agents`.
- Seed de agentes atualizado com 7 agentes.
- Loader central de configuração criado em `app.agent_config`.
- Guardião de Qualidade implementado com rubrica local, score mínimo 80 e falhas críticas bloqueantes.
- Envio para revisão roda o Guardião; aprovação final exige revisão aprovada da versão atual.
- `/approvals` exibe score, status, correções obrigatórias e melhorias opcionais.

## Validação esperada

- `python -m ruff check apps/api/app apps/api/alembic`
- `$env:PYTHONPATH='apps/api'; python -m pytest`
- `npm.cmd --prefix apps/web run lint`
- `npm.cmd --prefix apps/web run build`
- `docker compose build api web worker`
- `docker compose up -d --force-recreate api web worker`
- `alembic upgrade head`
