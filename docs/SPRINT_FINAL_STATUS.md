# Status do Projeto — DUOFY V1

Atualizado em 2026-06-26.

## Fluxo de trabalho atual

- Pasta oficial única: `C:\DUOFY_V1_MARKETING_AI`.
- **Branch única de trabalho: `main`.** As branches de sprint/worktree paralelas foram consolidadas e removidas.
- Não há mais modelo de "duas ferramentas em paralelo": o trabalho acontece direto na `main`, na pasta oficial.
- Antes de mudanças relevantes: rodar os checks pertinentes, commitar pequeno e descritivo, confirmar `git status --short` limpo.

## Baseline e backup

- Commit baseline: `79896e2` (tag `baseline-pre-final-sprint`).
- Backup completo pré-Git: `C:\DUOFY_BACKUPS\DUOFY_V1_MARKETING_AI_PRE_GIT_20260626-015251`.

## Checks de referência

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest        # 14 passed no baseline
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build                  # 17 rotas
docker compose ps
Invoke-RestMethod http://localhost:8000/health       # api, postgres, redis ok
```

- Script de frontend dev local: `scripts/start-frontend-dev.ps1` (porta `3001`; porta `3000` é do frontend Docker).

## Correções de estabilização aplicadas

- **Persistência de uploads**: adicionado bind mount `./storage:/app/storage` em `api` e `worker` no `docker-compose.yml`, para os documentos enviados sobreviverem a rebuild/recreate. Aplicar com `docker compose up -d --force-recreate api worker`.

## Dívidas técnicas conhecidas

- **Cookie JWT sem HttpOnly**: o token é legível por JavaScript (`apps/web/lib/auth.ts`). Corrigir "de verdade" exige refactor de auth (server-side/proxy); adiado conscientemente. Risco XSS baixo no contexto local-first.
- **Vulnerabilidades npm (BLOQUEADOR PARA PRODUÇÃO)**: `npm audit` na época apontou `next` (alta — DoS/SSRF/cache poisoning/XSS), `postcss` (moderada) e `glob` (alta, em devDependencies). A correção automática puxa Next.js 16 (breaking). Deve ser tratada em **tarefa isolada com testes de regressão** (lint, build, smoke, validação visual), não em conserto pontual.

## Segurança operacional

- `.env`, `.env.local`, uploads, dumps, dependências, caches e validações locais permanecem ignorados pelo Git.
- `apps/web/.env.local` deve existir localmente com `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Nenhum segredo deve ser commitado.
