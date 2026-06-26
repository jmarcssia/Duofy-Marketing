# Checklist Final DUOFY V1

## Infra

- [ ] `docker compose ps` mostra `api`, `web`, `postgres`, `redis` e `worker`.
- [ ] `GET /health` retorna `ok`.
- [ ] Alembic esta em `0010_chat_tasks`.
- [ ] Seed roda sem erro.

## Funcional

- [ ] Login funciona.
- [ ] Marcas aparecem no filtro global.
- [ ] Admin configura provedores.
- [ ] Upload de documento funciona.
- [ ] RAG retorna contexto.
- [ ] Chat cria sessao, mensagem e tarefa.
- [ ] Worker executa tarefa e grava logs.
- [ ] Conteudo gera output versionado.
- [ ] Aprovacao cria memoria permanente.
- [ ] Rejeicao cria aprendizado temporario.
- [ ] Pesquisa cria relatorio e fontes.
- [ ] Calendario cria eventos.
- [ ] Assessoria cria pauta/release.
- [ ] Custos mostram chamadas/tokens.
- [ ] Insights gera relatorio.
- [ ] PDF de output e relatorio baixa corretamente.

## Checks

- [ ] `python -m ruff check apps/api/app apps/api/alembic`
- [ ] `python -m pytest`
- [ ] `npm --prefix apps/web run lint`
- [ ] `npm --prefix apps/web run build`
- [ ] `docker compose build`
- [ ] `scripts/smoke-demo.ps1`

## Pendencias conhecidas aceitas

- Publicacao externa nao implementada.
- Billing oficial dos provedores nao implementado.
- Deploy Vercel/ngrok opcional, fora do fluxo local-first.
