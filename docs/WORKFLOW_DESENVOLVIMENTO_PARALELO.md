# Workflow de Desenvolvimento Paralelo - Sprint Final DUOFY V1

Este documento define as regras operacionais para trabalho paralelo no sprint final. O baseline seguro foi criado antes da abertura das branches de sprint.

## Baseline

- Commit base: `79896e2001d292658737fe8f1a629b0344f868b4`
- Tag local: `baseline-pre-final-sprint`
- Data: `2026-06-26 01:59:20 -03:00`
- Repositório raiz: `C:\DUOFY_V1_MARKETING_AI`

## Codex

- Branch: `sprint/codex-stabilization`
- Pasta: `C:\DUOFY_V1_MARKETING_AI`
- Responsabilidade inicial:
  - backend;
  - segurança;
  - persistência;
  - infraestrutura;
  - testes;
  - integração técnica.

Codex não deve redesenhar componentes de frontend durante o trabalho paralelo sem acordo explícito, para evitar conflito com Cloud Code.

## Cloud Code

- Branch: `sprint/cloudcode-interface`
- Pasta: `C:\DUOFY_V1_MARKETING_AI_CLOUD`
- Responsabilidade inicial:
  - frontend;
  - UX;
  - correções visuais;
  - encoding visível;
  - componentes;
  - estados de interface.

Cloud Code não deve alterar migrations, banco, contratos de API ou comportamento de backend sem autorização explícita.

## Integração

- Branch: `integration/final-demo`
- Worktree dedicada: não criada nesta etapa.
- Uso: integrar mudanças revisadas de Codex e Cloud Code para demonstração final.

## Regras obrigatórias

- Fazer commits pequenos e descritivos.
- Manter uma responsabilidade por commit.
- Nunca editar diretamente a `main`.
- Não usar `git reset --hard`.
- Não usar `git clean -fd`.
- Não rebasear ou apagar trabalho alheio.
- Antes de integrar, rodar lint, testes e build.
- Conflitos devem ser analisados manualmente.
- Mudanças de contrato de API precisam ser comunicadas antes.
- Migrations devem ser criadas somente pelo trabalho de backend.
- Nenhum segredo pode ser commitado.
- `.env`, `.env.local`, uploads, dumps, dependências, caches e validações locais devem permanecer ignorados.
- O branch `integration/final-demo` deve receber somente código validado.

## Procedimento recomendado de integração

1. Confirmar que a branch de origem está limpa com `git status --short`.
2. Rodar checks relevantes na branch de origem.
3. Trocar para `integration/final-demo` em uma worktree ou na pasta principal quando nenhuma outra atividade estiver em andamento.
4. Fazer merge de uma branch por vez.
5. Resolver conflitos manualmente.
6. Rodar os checks completos:

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
docker compose ps
Invoke-RestMethod http://localhost:8000/health
```

7. Registrar resultado em `docs/SPRINT_FINAL_STATUS.md`.

## Como abrir o worktree Cloud Code

```powershell
code C:\DUOFY_V1_MARKETING_AI_CLOUD
```

