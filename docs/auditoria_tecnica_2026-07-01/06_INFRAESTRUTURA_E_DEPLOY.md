# 06 · Infraestrutura e Deploy

**Escopo:** stack Docker (dev + prod), build, migrations, TLS/Caddy, config por ambiente, observabilidade, resiliência e prontidão para VPS.
**Veredito global: PARCIAL.** A topologia, o TLS e o hardening de segredos são REAIS e bem-feitos; mas há **um gap de bootstrap** (seed do admin não roda no boot) e lacunas operacionais (sem backup automatizado, worker single-threaded, sem healthcheck no worker/Caddy, sem limites de recurso) que impedem classificar como pronto.

---

## 1. Topologia

### DEV — `docker-compose.yml`

| Serviço | Imagem/Build | Portas | Healthcheck | Restart |
|---|---|---|---|---|
| postgres | pgvector/pgvector:pg16 | `127.0.0.1:5433→5432` | `pg_isready` | unless-stopped |
| redis | redis:7-alpine | `127.0.0.1:6379` | `redis-cli ping` | unless-stopped |
| migrate | api Dockerfile | — | — | `no` (one-shot) |
| api | api Dockerfile | `8000→8000` | urllib `/health` | unless-stopped |
| web | `apps/web/Dockerfile` (next dev) | `3000→3000` | wget `/login` (IPv4) | unless-stopped |
| worker | api Dockerfile | — | **nenhum** | unless-stopped |

Boot: `postgres/redis healthy` → `migrate completed` → `api`+`worker` → `web` (espera `api healthy`). Postgres/Redis só em loopback.

### PROD — `docker-compose.prod.yml`

| Serviço | Portas | Volumes | Healthcheck |
|---|---|---|---|
| postgres | **nenhuma** | `postgres_data` | `pg_isready` |
| redis | **nenhuma** | `redis_data` (AOF) | `redis-cli ping` |
| migrate | — | — | — (`restart: no`) |
| api | **nenhuma** | `storage_data` | urllib `/health` |
| worker | — | `storage_data` | **nenhum** |
| web | **nenhuma** | — (Dockerfile.prod) | wget `/login` |
| caddy | `80:80`, `443:443` | Caddyfile ro, `caddy_data`, `caddy_config` | **nenhum** |

**Exposição prod (ponto forte):** só o Caddy publica portas. Postgres/Redis/API/worker/web ficam exclusivamente na rede interna do Docker.

---

## 2. Dev vs Prod

| Aspecto | Dev | Prod |
|---|---|---|
| Web | `npm run dev` (hot-reload, bind do código) | Next **standalone** non-root (`node server.js`) |
| Reverse proxy | ausente | Caddy + TLS automático |
| Banco/Redis | loopback do host | rede interna, zero portas |
| `APP_ENV` | `development` | `production` |
| Segredos | defaults tolerados | **obrigatórios** via `${VAR:?}` + validados na API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | vazio → `/api` relativo via Caddy (same-origin, sem CORS) |
| Storage | bind `./storage` | volume `storage_data` |

A stack de prod é **self-contained e coerente** — referencia só arquivos versionados + `.env`. A coerência quebra **só no bootstrap** (§4).

---

## 3. Build

**API (`apps/api/Dockerfile`):**
- Single-stage (`python:3.11-slim`) — imagem grande (carrega toolchain).
- ✅ **Libs WeasyPrint/PDF presentes** (`:9-19`): `libpango`, `libpangocairo`, `libcairo2`, `libgdk-pixbuf`, `libffi8`, `shared-mime-info` + fontes. **O PDF funciona.**
- ⚠️ `playwright install --with-deps chromium` (`:23`) baixa Chromium + libs (centenas de MB). Somado a Pango/Cairo, a imagem api/worker/migrate é pesada → requisito de **≥4 GB RAM** (DEPLOY.md).
- Cache correto: `requirements.txt` antes do código.
- ⚠️ **Sem lock:** `requirements.txt` usa faixas (`>=x,<y`, alguns sem teto) → builds não reprodutíveis entre datas.

**Web prod (`Dockerfile.prod`):**
- ✅ Multi-stage (`deps`→`builder`→`runner`), imagem enxuta, **non-root** (`USER nextjs`), `output: "standalone"` casado com `next.config.mjs:12`.
- ⚠️ Sem lockfile próprio (`npm install`, não `npm ci`) → build não 100% reprodutível.

---

## 4. ⚠️ Bootstrap do admin — GAP OPERACIONAL (Alta)

**Migrations em si: corretas e idempotentes.** O serviço `migrate` roda `alembic upgrade head` e sai; api/worker só sobem após `service_completed_successfully`. 15 revisions lineares; pgvector habilitado no init SQL e na `0001`.

**O problema — o seed do admin não roda automaticamente:**
- `DEPLOY.md:52-54` afirma que *"o primeiro boot semeia o admin, marcas e agentes"*.
- Na realidade, `seed.py:152-153` só executa via `if __name__ == "__main__"`. Grep confirma: `seed_*` **não é chamado no runtime** — nem no `migrate` (comando é só `alembic upgrade head`), nem no lifespan da API (`main.py:41-54` só chama `reformat_legacy_outputs`), nem em entrypoint/CMD.
- **Consequência:** num deploy limpo seguindo o DEPLOY.md, **não existe usuário admin** — o login inicial falha, mesmo com a stack "saudável".

> **Reconciliação:** o `seed.py` **não é código morto** — é um script de CLI válido e o `README.md` documenta `docker compose exec api python -m app.seed`. O gap é a **contradição**: o `DEPLOY.md` promete automático, mas é manual. Ambas as leituras (uma auditoria disse "seed nunca roda no boot", outra disse "seed é CLI válido") estão corretas e compõem o mesmo achado.

**Correção recomendada (idempotente, o seed já suporta):**
```yaml
# serviço migrate
command: ["sh","-c","alembic upgrade head && python -m app.seed"]
```
Alternativas: chamar `seed.main()` no lifespan da API, ou no mínimo corrigir o `DEPLOY.md` com o passo manual explícito.

---

## 5. TLS / Caddy (prod)

`infra/caddy/Caddyfile`:
- **Endereço dinâmico:** `{$DUOFY_SITE_ADDRESS::80}` — domínio → HTTPS automático (Let's Encrypt); `:80` → HTTP puro (teste por IP). Idiomático.
- **Roteamento:** `/api/* /health` → `api:8000`; resto → `web:3000` (same-origin, sem CORS).
- `encode gzip zstd`; remove header `Server`; adiciona `X-Content-Type-Options` e `Referrer-Policy`.
- Certificados persistidos em `caddy_data` (sobrevivem a restart).
- ⚠️ **Faltam HSTS e CSP** (ver [03](03_SEGURANCA_E_VULNERABILIDADES.md) B-4) e healthcheck no container Caddy.

---

## 6. Config por ambiente

**Hardening de segredos: REAL e bem-feito (defesa em profundidade):**
- `settings.py:44-65` — com `APP_ENV` fora de dev, a API **recusa subir** se `JWT_SECRET_KEY` for default/`change-me`, tiver <32 chars, ou `ADMIN_PASSWORD` for default.
- `docker-compose.prod.yml` reforça com `${VAR:?}` para `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `ADMIN_EMAIL/PASSWORD`, `DUOFY_SITE_ADDRESS`.
- `.env.production.example` alerta corretamente sobre o acoplamento `JWT_SECRET_KEY`↔Fernet na migração.

**Defaults que só afetam dev:** `JWT_SECRET_KEY=change-me...`, `ADMIN_PASSWORD=admin123456` — bloqueados em prod pelo guard. `ACCESS_TOKEN_EXPIRE_MINUTES=720` (12h) em ambos — combinado com o JWT não-HttpOnly, é janela longa de exposição.

---

## 7. Observabilidade

- **Logs:** stdout via `logging.basicConfig` — capturados pelo Docker. **Sem log estruturado, sem rotação/limite** (`json-file` sem `max-size` cresce sem limite no disco da VPS).
- **Healthchecks:** postgres, redis, api (`/health` valida pg+redis), web (`/login`). **Faltam no `worker` e no `caddy`.** Worker sem healthcheck = Celery travado não é detectado (fica "running" mas morto).
- **Métricas:** existe `/api/metrics/summary` (negócio), mas **sem métricas de infra** (CPU/mem/latência/fila Celery).
- **Restart policies:** `unless-stopped` (longa duração) e `no` (migrate) — corretas.

---

## 8. Resiliência e escala

- ⚠️ **Worker `--pool=solo`:** processa **uma task por vez, sem paralelismo** (escolhido por causa de `asyncio.run` na task e Playwright/Chromium que não gostam de fork). Aceitável para equipe única, mas é gargalo — geração (LLM + scraping + PDF) serializa. Escalar exige réplicas do worker (não há `deploy.replicas`) ou trocar o pool com cuidado.
- ⚠️ **SPOFs:** postgres, redis, caddy são instâncias únicas — esperado em VPS single-node, sem HA.
- ⚠️ **Backup do Postgres NÃO automatizado:** o `DEPLOY.md §4` dá um script de cron de exemplo (`pg_dump` + tar + retenção 14d), mas ele **não é instalado por nada**. Seguir o guia à risca deixa o sistema sem backup até alguém configurar o cron. **Risco alto.**
- ✅ **Persistência de volumes correta:** `postgres_data`, `redis_data` (AOF), `storage_data`, `caddy_data/config` são volumes nomeados. Procedimento de migração VPS→VPS do DEPLOY.md é detalhado e sólido (dump custom + restore + tar do storage + alerta Fernet↔JWT).
- ⚠️ **Sem limites de CPU/memória** em nenhum serviço. Com Chromium + WeasyPrint + LLM, um pico no worker pode consumir toda a RAM e derrubar o Postgres por OOM numa VPS de 4 GB.

---

## 9. Checklist de prontidão para produção

### 🔴 Bloqueadores
1. **Seed não roda no boot** → sem admin, sistema inacessível. Adicionar `python -m app.seed` ao `migrate` (idempotente) ou corrigir o DEPLOY.md com o passo manual.

### 🟠 Alta prioridade
2. **Backup automatizado do Postgres** — instalar de fato o cron/systemd timer (hoje só exemplo no doc).
3. **Limites de recurso** (`mem_limit`/`cpus` ou `deploy.resources`) ao menos para `worker` e `api` — evitar OOM.
4. **Healthcheck no worker** (`celery inspect ping`).

### 🟡 Média prioridade
5. **Rotação/limite de logs** (`logging: driver json-file, options max-size/max-file`).
6. **HSTS no Caddy** (produção com domínio).
7. **Escala do worker** — avaliar réplicas se o volume crescer.
8. **Reprodutibilidade de build** — pin/lock (`requirements.txt` com faixas; web via `npm install`).
9. **Non-root no container da API** (ver [03](03_SEGURANCA_E_VULNERABILIDADES.md) M-4).

### Dívidas conscientes (aceitas)
10. JWT cookie não-HttpOnly (mitigado por same-origin) — mas continua sendo o risco top de segurança.
11. `npm audit` Next.js 14 — upgrade em tarefa isolada.

### ✅ Pontos fortes confirmados
- Exposição mínima em prod (só Caddy 80/443).
- Hardening de segredos fail-fast em dois níveis.
- TLS automático Let's Encrypt, same-origin sem CORS.
- Libs WeasyPrint/Pango/Cairo presentes → PDF funciona.
- Web prod standalone non-root, imagem enxuta.
- Boot determinístico (`service_completed_successfully`/`service_healthy`).
- Procedimento de migração VPS→VPS correto (incluindo alerta Fernet↔JWT).

**Veredito:** com o fix do seed + backup em cron + limites de memória + healthcheck do worker, a stack passa de **PARCIAL** para **REAL** para uma VPS single-node de equipe interna.

> Continue por **[07 · Plano de Ação Priorizado](07_PLANO_DE_ACAO_PRIORIZADO.md)**.
