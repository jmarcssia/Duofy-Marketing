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

## Os 7 agentes

| Agente | Slug | Estado |
|--------|------|--------|
| Orquestrador | `orchestrator` | Prompt em `config/agents`, execução via `/api/agents/run` |
| Pesquisa e Inteligência | `research_agent` | Prompt em `config/agents`, serviço de pesquisa real |
| Cocriação e Conteúdo | `content_agent` | Prompt em `config/agents`, outputs versionados |
| Calendário e Campanhas | `calendar_agent` | Prompt em `config/agents`, eventos e scheduler |
| Assessoria de Imprensa | `press_agent` | Prompt em `config/agents`, outputs de imprensa |
| Métricas e Análise Interna | `metrics_agent` | Prompt em `config/agents`, relatórios internos |
| Guardião de Qualidade | `quality_guardian` | Gate real com tabela `quality_reviews` |

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
