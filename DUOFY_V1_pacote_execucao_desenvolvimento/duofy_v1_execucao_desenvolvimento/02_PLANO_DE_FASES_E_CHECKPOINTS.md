# Plano de Fases e Checkpoints — DUOFY V1

## Fase 0 — Preparação do desenvolvimento

Objetivo: garantir que o agente de desenvolvimento entenda escopo, restrições e padrão de execução.

Entregáveis:

- Leitura da Spec Mestre.
- Leitura da documentação complementar.
- Estrutura `/config` no repositório.
- Decisão de arquitetura congelada registrada no README técnico.

Checkpoint:

- Nenhuma codificação pesada deve começar sem esta fase.

## Fase 1 — Fundação técnica

Objetivo: criar monorepo, Docker Compose, backend, frontend, banco, Redis e health checks.

Entregáveis:

- `apps/api` com FastAPI.
- `apps/web` com Next.js.
- `infra/docker-compose.yml` ou `docker-compose.yml` na raiz.
- PostgreSQL + pgvector.
- Redis.
- `.env.example`.
- Scripts básicos.

Checkpoint:

- Docker sobe.
- API responde `/health`.
- Web abre.
- Banco conecta.
- Redis conecta.

## Fase 2 — Auth, layout e seed

Objetivo: login real, papéis simples, layout base e marcas/agentes iniciais.

Entregáveis:

- Tabelas `users`, `brands`, `agents`, `settings`.
- Login JWT.
- Admin e Gestor.
- Layout com menu lateral.
- Seeds iniciais.

Checkpoint:

- Usuário faz login.
- Dashboard protegido abre.
- Marcas aparecem no filtro global.

## Fase 3 — Configuração externa dos agentes

Objetivo: carregar prompts, regras, templates e marcas a partir de Markdown/YAML.

Entregáveis:

- Loader de config.
- Sincronização opcional config → banco.
- Página Admin inicial para visualizar configurações.

Checkpoint:

- Alterar um arquivo Markdown muda o comportamento/configuração carregada sem alterar código do agente.

## Fase 4 — Chat, tarefas e orquestrador base

Objetivo: chat com sessões, mensagens, tarefas e execução assíncrona básica.

Entregáveis:

- `chat_sessions`.
- `chat_messages`.
- `agent_tasks`.
- `agent_logs`.
- SSE para progresso.
- Orquestrador simples.

Checkpoint:

- Usuário envia pedido.
- Orquestrador cria tarefa.
- Progresso aparece.
- Resultado é salvo.

## Fase 5 — Memória, documentos e RAG

Objetivo: upload, extração, chunking, embedding, pgvector e busca contextual.

Entregáveis:

- `documents`.
- `document_chunks`.
- `memory_entries`.
- Upload PDF/DOCX/TXT/MD.
- Busca semântica filtrada.

Checkpoint:

- Upload funciona.
- Documento é indexado.
- RAG retorna contexto correto por marca e categoria.

## Fase 6 — Agente de Co-criação

Objetivo: gerar conteúdos estruturados para canais e enviar para aprovação.

Entregáveis:

- Conteúdos para Instagram, LinkedIn, blog, e-mail, webinar, carrossel e Reels.
- Prompts visuais estruturados.
- Output salvo com versão.
- Envio para aprovação.

Checkpoint:

- Pedido real gera output útil e editável.

## Fase 7 — Agente de Pesquisa

Objetivo: pesquisa sob demanda com fontes, síntese e relatório exportável.

Entregáveis:

- RSS/httpx/trafilatura.
- Apify opcional.
- Playwright quando necessário.
- Relatório estruturado.
- Fontes utilizadas.

Checkpoint:

- Pesquisa gera relatório com resumo executivo, sinais, oportunidades, recomendações e fontes.

## Fase 8 — Aprovações, versões e aprendizado

Objetivo: fila de revisão, editor, aprovação, rejeição e memória.

Entregáveis:

- `outputs`.
- `output_versions`.
- Status: draft, review, approved, rejected, needs_adjustment, archived.
- Aprovação vira memória permanente.
- Rejeição vira aprendizado temporário por 30 dias.

Checkpoint:

- Output aprovado vira memória consultável.
- Rejeição gera aprendizado temporário.

## Fase 9 — Calendário e assessoria

Objetivo: calendário visual e agente de assessoria de imprensa.

Entregáveis:

- `calendar_events`.
- Visual mês/semana/lista.
- Pautas, releases e comunicados.
- Agendamentos básicos.

Checkpoint:

- Evento aparece no calendário.
- Agente gera pauta/release a partir de contexto real.

## Fase 10 — Métricas, custos e PDF

Objetivo: rastrear custos/tokens, métricas internas e exportações.

Entregáveis:

- `model_calls`.
- `reports`.
- Dashboard de custos.
- Exportação PDF simples com branding.

Checkpoint:

- Cada chamada de IA aparece nas métricas.
- Output ou relatório exporta em PDF.

## Fase 11 — Polimento e demo

Objetivo: corrigir bugs, melhorar UX, carregar seeds reais e rodar fluxo ponta a ponta.

Entregáveis:

- Demo local funcional.
- Checklist de pronto da V1.
- README de execução.
- Scripts de teste.

Checkpoint:

- Fluxo ponta a ponta passa sem intervenção técnica.
