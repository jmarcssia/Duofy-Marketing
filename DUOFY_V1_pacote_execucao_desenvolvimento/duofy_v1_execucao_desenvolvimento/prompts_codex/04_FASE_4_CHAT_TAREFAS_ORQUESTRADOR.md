# Prompt Codex — Fase 4: Chat, Tarefas e Orquestrador Base

Implemente chat com sessões, mensagens, tarefas, logs e orquestrador inicial.

## Objetivo

Permitir que o usuário converse com o orquestrador, que interpreta a solicitação, cria uma tarefa e salva resultado inicial.

## Requisitos

1. Criar migrations/modelos:
   - `chat_sessions`
   - `chat_messages`
   - `agent_tasks`
   - `agent_logs`
2. Criar endpoints:
   - `GET /api/chat/sessions`
   - `POST /api/chat/sessions`
   - `GET /api/chat/sessions/{id}`
   - `POST /api/chat/sessions/{id}/messages`
   - `GET /api/tasks`
   - `GET /api/tasks/{id}`
3. Criar SSE para progresso básico:
   - `GET /api/tasks/{id}/stream`
4. Implementar Celery worker simples.
5. Implementar orquestrador base com classificação inicial:
   - pesquisa;
   - conteúdo;
   - calendário;
   - assessoria;
   - métricas;
   - geral.
6. Criar página de chat com lista de sessões, mensagens e status da tarefa.

## Critérios de pronto

- Usuário cria sessão.
- Mensagem é salva.
- Orquestrador cria tarefa.
- Progresso aparece via SSE ou polling.
- Resultado simples é salvo.

## Responda no final

- Arquivos criados/alterados.
- Como testar fluxo.
- Checks executados.
- Pendências.
