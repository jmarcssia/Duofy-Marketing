# Prompt Codex — Fase 8: Aprovações, Versões e Aprendizado

Implemente a fila de revisão, editor simples, versionamento e memória por aprovação/rejeição.

## Objetivo

Permitir revisar outputs, editar, aprovar, rejeitar, pedir ajuste ou arquivar.

## Requisitos

1. Criar endpoints:
   - `GET /api/outputs`
   - `GET /api/outputs/{id}`
   - `PATCH /api/outputs/{id}`
   - `GET /api/outputs/{id}/versions`
   - `POST /api/outputs/{id}/approve`
   - `POST /api/outputs/{id}/reject`
   - `POST /api/outputs/{id}/request-adjustment`
   - `POST /api/outputs/{id}/archive`
2. Criar página Aprovações.
3. Criar editor simples.
4. Salvar cada edição como nova versão.
5. Ao aprovar, criar `memory_entries` permanente.
6. Ao rejeitar, criar aprendizado temporário por 30 dias.

## Critérios de pronto

- Output pode ser editado.
- Versões aparecem.
- Aprovação vira memória permanente.
- Rejeição vira aprendizado temporário.

## Responda no final

- Arquivos criados/alterados.
- Como testar aprovação/rejeição.
- Checks executados.
- Pendências.
