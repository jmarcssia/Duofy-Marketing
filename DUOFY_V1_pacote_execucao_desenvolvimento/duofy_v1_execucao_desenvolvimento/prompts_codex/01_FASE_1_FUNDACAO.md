# Prompt Codex — Fase 1: Fundação Técnica

Implemente a fundação técnica da DUOFY V1.

## Objetivo

Criar a base do monorepo com backend FastAPI, frontend Next.js 14, PostgreSQL com pgvector, Redis, Docker Compose e health checks.

## Requisitos

1. Criar estrutura de monorepo:
   - `apps/api`
   - `apps/web`
   - `config`
   - `infra` ou docker na raiz
   - `docs`
2. Criar backend FastAPI com endpoint `GET /health`.
3. Criar frontend Next.js com página inicial temporária.
4. Criar Docker Compose com:
   - api
   - web
   - postgres
   - redis
5. Habilitar extensão pgvector no PostgreSQL.
6. Criar `.env.example`.
7. Criar README com comandos de execução.
8. Não implementar agentes ainda.
9. Não implementar telas finais ainda.

## Critérios de pronto

- `docker compose up` sobe os serviços.
- API responde `/health`.
- Frontend abre no navegador.
- Postgres aceita conexão.
- Redis aceita conexão.
- `.env.example` documenta variáveis.

## Responda no final

- Arquivos criados.
- Como rodar.
- Checks executados.
- Pendências.
