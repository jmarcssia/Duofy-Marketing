# Prompt Codex — Fase 10: Métricas, Custos e PDF

Implemente rastreamento de tokens/custos, relatórios internos e exportação PDF.

## Objetivo

Garantir controle operacional de uso, custo e produtividade.

## Requisitos

1. Criar migrations/modelos:
   - `model_calls`
   - `reports`
2. Registrar por chamada de IA:
   - tarefa;
   - agente;
   - marca;
   - provider;
   - modelo;
   - input_tokens;
   - output_tokens;
   - total_tokens;
   - custo estimado;
   - latência;
   - status;
   - erro.
3. Criar página Custos e Tokens.
4. Criar página Relatórios/Métricas Internas.
5. Criar exportação PDF simples para outputs e relatórios.
6. Usar branding Duofy simples.

## Critérios de pronto

- Chamada de IA gera registro em `model_calls`.
- Dashboard mostra custo/tokens por período.
- Output exporta PDF.
- Relatório exporta PDF.

## Responda no final

- Arquivos criados/alterados.
- Como testar métricas e PDF.
- Checks executados.
- Pendências.
