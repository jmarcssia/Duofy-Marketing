# Prompt para primeira execução no Codex

Leia cuidadosamente os documentos do projeto Duofy V1 e implemente apenas a Fase 1: Fundação Técnica.

Use como regra fixa o arquivo `handoff/CODEX_PROMPT_MESTRE.md`.

Escopo desta execução:

- Criar monorepo.
- Criar backend FastAPI com `/health`.
- Criar frontend Next.js 14 com página inicial temporária.
- Criar Docker Compose com API, Web, PostgreSQL + pgvector e Redis.
- Criar `.env.example`.
- Criar README com comandos.

Não implemente ainda:

- agentes;
- RAG;
- autenticação;
- telas finais;
- pesquisa externa;
- PDF;
- calendário.

Critérios de pronto:

- Docker sobe.
- API responde `/health`.
- Front abre.
- Postgres conecta.
- Redis conecta.
- README explica como rodar.

No final, reporte:

1. Arquivos criados.
2. Como rodar.
3. Checks executados.
4. Qualquer erro encontrado.
5. Próximo passo recomendado.
