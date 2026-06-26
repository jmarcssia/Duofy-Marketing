# Prompt Codex — Fase 9: Calendário e Assessoria de Imprensa

Implemente calendário editorial e agente de assessoria de imprensa.

## Objetivo

Organizar tarefas editoriais, campanhas, eventos, pesquisas e gerar pautas/releases.

## Requisitos

1. Criar migration/modelo `calendar_events`.
2. Criar endpoints:
   - `GET /api/calendar`
   - `POST /api/calendar`
   - `PATCH /api/calendar/{id}`
   - `DELETE /api/calendar/{id}`
3. Criar visual mês/semana/lista.
4. Criar painel lateral do evento.
5. Implementar agente de calendário com prompt externo.
6. Implementar agente de assessoria com prompt externo.
7. Gerar:
   - press release;
   - pauta;
   - comunicado;
   - ângulo editorial;
   - sugestão de abordagem.

## Critérios de pronto

- Evento é criado e exibido.
- Evento pode acionar tarefa futura básica.
- Agente de assessoria gera pauta/release com contexto real.

## Responda no final

- Arquivos criados/alterados.
- Como testar calendário e assessoria.
- Checks executados.
- Pendências.
