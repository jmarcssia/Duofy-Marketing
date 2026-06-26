# Cloud Code — Ambiente de Desenvolvimento do Frontend

Documento gerado pela preparação do ambiente Cloud Code em **2026-06-26**.
Objetivo: preparar e validar o ambiente da worktree Cloud para desenvolvimento
do frontend, sem implementar melhorias, redesenhar telas ou alterar
funcionalidades.

## Contexto

| Item | Valor |
|---|---|
| Worktree Cloud | `C:\DUOFY_V1_MARKETING_AI_CLOUD` |
| Branch | `sprint/cloudcode-interface` |
| Backend/stack compartilhada | `C:\DUOFY_V1_MARKETING_AI` (Docker) |
| Node | `v22.18.0` |
| npm | `10.9.3` |
| Next.js | `14.2.35` |
| API | `http://localhost:8000` |
| Frontend original | `http://localhost:3000` |
| Frontend Cloud | `http://localhost:3001` |

## Dependências

- `node_modules` presente e funcional na raiz da worktree (npm workspaces,
  dependências hoisted; `apps/web` consome a partir da raiz).
- `next@14.2.35` presente em `node_modules/next`; binário em
  `node_modules/.bin/next.cmd`.
- `npm ls --depth=0` limpo, sem erros bloqueadores.
- **`npm ci` não foi reexecutado**, pois o `node_modules` já estava completo.

## Porta do frontend Cloud

- Porta escolhida: **3001** (primeira porta livre na faixa 3001–3010).
- A porta **3000 é proibida** para o Cloud (pertence ao frontend original).
- Verificação: 3001–3010 estavam todas livres no momento da preparação.

## Saúde do backend

- `GET http://localhost:8000/health` → `status: ok`
  (`api`, `postgres`, `redis` todos `ok`).
- Containers ativos da pasta original (todos em execução):
  `duofy-api` (healthy), `duofy-postgres` (healthy), `duofy-redis` (healthy),
  `duofy-web`, `duofy-worker`.

## CORS

- O backend define CORS via `BACKEND_CORS_ORIGINS`
  (default do compose: `http://localhost:3000`).
- Estado inicial: a origem `http://localhost:3001` era **bloqueada**
  (preflight `OPTIONS` retornava `400`).
- Ajuste aplicado (autorizado para a porta escolhida): foi criado o arquivo
  `C:\DUOFY_V1_MARKETING_AI\.env` (inexistente até então, e ignorado pelo Git)
  contendo **apenas** `BACKEND_CORS_ORIGINS`, preservando `http://localhost:3000`
  e adicionando `http://localhost:3001`. Nenhuma senha, chave, token ou outra
  variável foi alterada (todas continuam usando os defaults do compose).
- Apenas o serviço **api** foi recriado (`docker compose up -d api`).
  PostgreSQL, Redis, Worker e Web **não** foram reiniciados.
- Estado final: CORS aceita `http://localhost:3000` **e**
  `http://localhost:3001` (GET e preflight `OPTIONS` → `200`, com
  `Access-Control-Allow-Origin` ecoando a origem).
- Reversão: como o `.env` não existia antes, basta **apagar**
  `C:\DUOFY_V1_MARKETING_AI\.env` e recriar o serviço `api` para voltar ao
  default `http://localhost:3000`.

## Smoke test HTTP (porta 3001)

Todas as rotas respondem; redirecionamentos de autenticação são comportamento
esperado. Nenhum `500`, página em branco, falha de compilação, loop de redirect
ou erro de conexão com a API.

| Rota | Resultado |
|---|---|
| `/` | 307 → `/dashboard` |
| `/login` | 200 |
| `/dashboard` | 307 → `/login?next=/dashboard` |
| `/research` | 307 → `/login?next=/research` |
| `/content` | 307 → `/login?next=/content` |
| `/approvals` | 307 → `/login?next=/approvals` |
| `/memory` | 307 → `/login?next=/memory` |
| `/calendar` | 200 |
| `/chat` | 200 |
| `/costs` | 200 |
| `/insights` | 200 |
| `/operations` | 200 |
| `/admin/agents` | 307 → `/login?next=/admin/agents` |
| `/admin/config` | 307 → `/login?next=/admin/config` |

Observação: rotas com 307 → `/login` são protegidas pelo middleware
(`/dashboard`, `/research`, `/content`, `/approvals`, `/memory`, `/admin/*`).
As rotas com 200 não estão no middleware e fazem checagem de auth client-side
(comportamento já documentado em `ESTADO_ATUAL_DO_SISTEMA.md`).

Login via navegador automatizado não foi executado nesta preparação para não
utilizar credenciais não fornecidas explicitamente; o smoke test HTTP cobriu
todas as rotas públicas/protegidas.

## Qualidade técnica

| Check | Resultado | Duração |
|---|---|---|
| `npm.cmd --prefix apps/web run lint` | ✔ sem warnings/erros (exit 0) | ~13 s |
| `npm.cmd --prefix apps/web run build` | ✔ sucesso, 17 rotas (exit 0) | ~40 s |

Observação operacional: rodar `next build` enquanto o `next dev` está ativo
compartilha o mesmo diretório `.next` e quebra temporariamente o dev server
(passa a retornar 500). Após o build, o `.next` foi limpo e o dev server foi
reiniciado; o smoke test foi repetido com sucesso.

## Vulnerabilidades (npm audit) — BLOQUEADOR PARA PRODUÇÃO

Registro do estado atual. **Nenhuma correção automática foi aplicada.**

### Produção (`npm audit --omit=dev`)

- **2 vulnerabilidades: 1 alta + 1 moderada.**
  - `next` (alta): múltiplos advisories (DoS, SSRF, cache poisoning, XSS, etc.).
  - `postcss` (moderada): XSS via `</style>` não escapado no CSS stringify
    (dependência transitiva de `next`).

### Auditoria completa (`npm audit`)

- **5 vulnerabilidades: 4 altas + 1 moderada.**
  - `next` (alta) + `postcss` (moderada), como acima.
  - `glob` 10.2.0–10.4.5 (alta): command injection via `-c/--cmd`
    (transitiva de `@next/eslint-plugin-next` → `eslint-config-next`,
    cadeia de devDependencies).

### Bloqueador e plano

- A correção automática (`npm audit fix --force`) instala **Next.js 16**, que é
  **breaking change**. Por isso **não foi aplicada** nesta tarefa.
- A atualização do Next.js (e da cadeia `eslint-config-next`/`glob`/`postcss`)
  deve ser feita **posteriormente, em tarefa isolada e com testes de
  regressão** (lint, build, smoke das rotas e validação visual), fora do escopo
  desta preparação de ambiente.
- **Status:** registrado como **BLOQUEADOR PARA PRODUÇÃO**.

## Arquivos criados/alterados nesta preparação

Versionados (worktree Cloud):

- `scripts/start-cloud-frontend.ps1` (novo)
- `docs/CLOUDCODE_ENVIRONMENT_READY.md` (novo)
- `docs/SPRINT_FINAL_STATUS.md` (atualizado)

Locais não versionados (ignorados pelo Git):

- `apps/web/.env.local` (worktree Cloud) — `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `C:\DUOFY_V1_MARKETING_AI\.env` (pasta original) — apenas `BACKEND_CORS_ORIGINS`

## Conclusão

**AMBIENTE PRONTO PARA DESENVOLVIMENTO.**
