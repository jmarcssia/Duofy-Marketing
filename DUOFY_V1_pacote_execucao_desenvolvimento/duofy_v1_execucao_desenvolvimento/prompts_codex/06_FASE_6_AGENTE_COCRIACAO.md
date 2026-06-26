# Prompt Codex — Fase 6: Agente de Co-criação

Implemente o agente de co-criação de conteúdo.

## Objetivo

Gerar outputs de marketing estruturados para Duofy Soluções, Postos e DeathCare, usando memória, documentação e templates.

## Requisitos

1. Criar/usar tabela `outputs` e `output_versions`.
2. Carregar prompt do agente a partir de `/config/agents/content_agent.md`.
3. Carregar templates de `/config/templates`.
4. Recuperar contexto via RAG antes da geração.
5. Suportar formatos:
   - legenda Instagram;
   - arte única;
   - carrossel;
   - Reels;
   - LinkedIn;
   - blog;
   - e-mail;
   - webinar;
   - campanha;
   - prompts visuais.
6. Enviar output para status `review`.
7. Criar página Co-criação com abas por formato.
8. Não gerar imagens dentro do sistema.

## Critérios de pronto

- Pedido real gera conteúdo com marca, persona, dor, solução e CTA.
- Output é salvo.
- Versão 1 é criada.
- Usuário consegue enviar para aprovação.

## Responda no final

- Arquivos criados/alterados.
- Como testar conteúdo DeathCare e Postos.
- Checks executados.
- Pendências.
