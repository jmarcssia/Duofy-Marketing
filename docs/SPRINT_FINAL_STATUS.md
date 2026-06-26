# Sprint Final - Controle de Execução

## Baseline

- Commit: `79896e2001d292658737fe8f1a629b0344f868b4`
- Tag: `baseline-pre-final-sprint`
- Data: `2026-06-26 01:59:20 -03:00`
- Backup: `C:\DUOFY_BACKUPS\DUOFY_V1_MARKETING_AI_PRE_GIT_20260626-015251`

## Consolidação de fluxo único

- Pasta oficial única: `C:\DUOFY_V1_MARKETING_AI`.
- Branch atual de trabalho: `sprint/codex-stabilization`.
- Codex e Cloud Code podem alterar qualquer área do projeto.
- Regra operacional: apenas uma ferramenta trabalha por vez.
- Antes de trocar de ferramenta:
  - rodar checks relevantes;
  - commitar a mudança;
  - confirmar `git status --short` limpo;
  - informar último commit e arquivos tocados.
- Commit Cloud incorporado: `c8deb26 chore(web): prepare Cloud Code development environment`.
- Worktree auxiliar anterior: `C:\DUOFY_V1_MARKETING_AI_CLOUD`.
- Script atual de frontend dev: `scripts/start-frontend-dev.ps1`.
- Porta padrão do frontend dev sequencial: `3001`.
- Porta `3000`: reservada ao frontend Docker.
- Branches antigas permanecem temporariamente como backup.

## Checks recentes

- `python -m ruff check apps/api/app apps/api/alembic apps/api/tests`: passou no baseline.
- `$env:PYTHONPATH='apps/api'; python -m pytest`: passou no baseline, `14 passed`.
- `npm.cmd --prefix apps/web run lint`: passou após consolidação.
- `npm.cmd --prefix apps/web run build`: passou no baseline.
- `docker compose ps`: serviços principais em execução no baseline.
- `Invoke-RestMethod http://localhost:8000/health`: `api`, `postgres` e `redis` ok no baseline.

## Arquivos de coordenação

- `docs/WORKFLOW_DESENVOLVIMENTO_PARALELO.md`: regra atual de fluxo sequencial em pasta única.
- `docs/CLOUDCODE_ENVIRONMENT_READY.md`: registro histórico da preparação anterior da worktree Cloud.
- `scripts/start-frontend-dev.ps1`: script atual para iniciar frontend dev local na pasta oficial.

## Segurança

- `.env`, `.env.local`, uploads, dumps, dependências, caches e validações locais permanecem ignorados.
- `apps/web/.env.local` deve existir localmente com `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Nenhum segredo deve ser commitado.
- Nenhum commit de workflow deve alterar funcionalidade, banco, migrations, prompts ou agentes.

