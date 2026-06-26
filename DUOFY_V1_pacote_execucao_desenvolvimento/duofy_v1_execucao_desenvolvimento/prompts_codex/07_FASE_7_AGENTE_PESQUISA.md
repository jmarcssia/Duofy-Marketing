# Prompt Codex — Fase 7: Agente de Pesquisa de Mercado

Implemente o agente de pesquisa de mercado.

## Objetivo

Gerar relatórios com fontes, sinais, oportunidades, concorrentes observados e recomendações.

## Requisitos

1. Carregar prompt de `/config/agents/research_agent.md`.
2. Criar fluxo de pesquisa com:
   - RSS;
   - httpx;
   - trafilatura/BeautifulSoup;
   - Apify opcional;
   - Playwright quando necessário.
3. Criar output estruturado:
   - título;
   - marca;
   - nicho;
   - tema;
   - resumo executivo;
   - fontes analisadas;
   - sinais de mercado;
   - oportunidades;
   - concorrentes observados;
   - recomendações;
   - sugestões de pauta;
   - próximas ações.
4. Salvar relatório como output.
5. Permitir salvar como memória.
6. Criar página Pesquisa de Mercado.

## Critérios de pronto

- Pesquisa sob demanda roda.
- Relatório possui fontes.
- Relatório pode ir para co-criação ou assessoria.
- Pesquisa relevante pode virar memória.

## Responda no final

- Arquivos criados/alterados.
- Como testar pesquisa.
- Checks executados.
- Pendências.
