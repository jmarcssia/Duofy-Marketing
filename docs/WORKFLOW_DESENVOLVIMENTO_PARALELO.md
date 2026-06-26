# Workflow de Desenvolvimento Sequencial - Sprint Final DUOFY V1

Este documento substitui a regra anterior de trabalho paralelo por worktrees. A partir desta consolidação, a pasta oficial única do projeto é:

```text
C:\DUOFY_V1_MARKETING_AI
```

Codex e Cloud Code podem alterar qualquer área do projeto, mas nunca devem ser usados simultaneamente.

## Regra principal

- Uma única ferramenta trabalha por vez.
- A pasta oficial é sempre `C:\DUOFY_V1_MARKETING_AI`.
- Não trabalhar diretamente na `main`.
- A branch ativa para estabilização continua sendo `sprint/codex-stabilization`.
- As branches antigas são mantidas temporariamente como backup.
- A worktree auxiliar `C:\DUOFY_V1_MARKETING_AI_CLOUD` foi usada apenas para preparação e deve ser removida após consolidação limpa.

## Antes de trocar de ferramenta

Antes de sair de Codex para Cloud Code, ou de Cloud Code para Codex:

1. Rodar os checks relevantes da mudança.
2. Fazer commit pequeno e descritivo.
3. Confirmar:

```powershell
git status --short
```

4. O resultado deve estar limpo.
5. Informar no handoff o último commit e os arquivos tocados.

## Responsabilidades

Como não há mais paralelismo, ambas as ferramentas podem trabalhar em:

- backend;
- frontend;
- UX;
- segurança;
- persistência;
- infraestrutura;
- testes;
- documentação;
- integração técnica.

Mesmo assim, mudanças de contrato de API, migrations, autenticação, storage, prompts e agentes exigem descrição explícita no commit e no handoff.

## Regras obrigatórias

- Commits pequenos e descritivos.
- Uma responsabilidade por commit.
- Nunca editar diretamente a `main`.
- Não usar `git reset --hard`.
- Não usar `git clean -fd`.
- Não rebasear ou apagar trabalho anterior sem autorização.
- Antes de handoff, rodar lint/testes/build compatíveis com a mudança.
- Conflitos devem ser analisados manualmente.
- Nenhum segredo pode ser commitado.
- `.env`, `.env.local`, uploads, dumps, dependências, caches e validações locais devem permanecer ignorados.
- Migrations devem ser criadas por Alembic quando houver mudança de banco.
- Não alterar prompt/agente sem registrar o motivo.
- Não alterar comportamento funcional em commits rotulados apenas como chore de workflow.

## Script de frontend dev

Para rodar o frontend de desenvolvimento na pasta oficial, use:

```powershell
.\scripts\start-frontend-dev.ps1
```

Padrões:

- API: `http://localhost:8000`
- Frontend dev: `http://localhost:3001`
- Porta 3000 fica reservada ao frontend Docker.

## Checks recomendados

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
docker compose ps
Invoke-RestMethod http://localhost:8000/health
```

