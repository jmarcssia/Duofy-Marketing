# Deploy da Duofy V1 em VPS

Guia completo para colocar a Duofy em produção numa VPS (Ubuntu/Debian) e para
**migrar de uma VPS para outra** sem perder dados.

A stack de produção é **self-contained** em `docker-compose.prod.yml`: Postgres +
pgvector, Redis, API (FastAPI), Worker (Celery), Web (Next.js standalone) e um
reverse proxy **Caddy** com HTTPS automático. Só o Caddy expõe portas (80/443);
todo o resto fica na rede interna do Docker.

---

## 1. Pré-requisitos na VPS

- Ubuntu 22.04+ / Debian 12+ com 2 vCPU e **≥ 4 GB RAM** (Chromium + WeasyPrint pesam).
- Docker Engine + plugin Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Portas **80** e **443** liberadas no firewall/cloud.
- (Para HTTPS) um domínio com registro **A** apontando para o IP da VPS.

---

## 2. Instalação nova (do zero)

```bash
git clone <URL_DO_REPO> duofy && cd duofy
cp .env.production.example .env
```

Edite o `.env` e defina **segredos fortes** (o compose e a própria API se recusam
a subir com defaults quando `APP_ENV=production`):

```bash
# JWT (48+ bytes)
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# Senhas
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 18   # ADMIN_PASSWORD
```

Preencha ainda `DUOFY_SITE_ADDRESS` (domínio, ou `:80` para testar por IP).

Suba a stack (build + migrate + start):

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

O serviço `migrate` roda o `alembic upgrade head` e o primeiro boot **semeia** o
admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), marcas e agentes. Acesse
`https://SEU_DOMINIO` e faça login.

### Configurar provedores LLM
Sem uma chave de provedor, os agentes não executam. Em **Administração → Modelos →
Configurar**, informe a chave (ex.: OpenRouter) e habilite. A chave é cifrada no
banco (Fernet derivada do `JWT_SECRET_KEY`).

---

## 3. Migração de uma VPS para outra (com dados)

> **Regra de ouro:** use **o mesmo `JWT_SECRET_KEY`** do servidor antigo no `.env`
> do novo. As chaves de API dos provedores são cifradas com ele — trocar o segredo
> as torna indecifráveis e **derruba todos os agentes**. (Copie o valor do `.env`
> antigo.)

### 3.1 No servidor ANTIGO — gerar os artefatos
```bash
# Dump do banco (formato custom, compactado)
docker compose exec -T postgres pg_dump -U duofy -d duofy_v1 -Fc > duofy_db.dump

# Arquivos enviados (documentos/exports) — ajuste conforme seu volume/pasta
docker run --rm -v $(pwd)/storage:/s -v $(pwd):/out alpine \
  sh -c "cd /s && tar czf /out/duofy_storage.tgz ."
```
Copie `duofy_db.dump`, `duofy_storage.tgz` e o **valor do `JWT_SECRET_KEY`** para a VPS nova (`scp`/`rsync`).

### 3.2 No servidor NOVO — restaurar
```bash
git clone <URL_DO_REPO> duofy && cd duofy
cp .env.production.example .env
# edite .env: MESMO JWT_SECRET_KEY do antigo + POSTGRES_PASSWORD + ADMIN_* + DUOFY_SITE_ADDRESS

# sobe só o banco primeiro (aplica o schema via migrate)
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm migrate

# restaura os dados por cima do schema
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U duofy -d duofy_v1 --clean --if-exists --no-owner < duofy_db.dump

# restaura os arquivos no volume nomeado storage_data
docker run --rm -v duofy_storage_data:/s -v $(pwd):/in alpine \
  sh -c "cd /s && tar xzf /in/duofy_storage.tgz"

# sobe o resto
docker compose -f docker-compose.prod.yml up -d --build
```

> O nome do volume é `<projeto>_storage_data` (o projeto vem do nome da pasta;
> confira com `docker volume ls | grep storage`).

Aponte o DNS do domínio para o novo IP; o Caddy emite o certificado no primeiro acesso.

---

## 4. Backups (recomendado, via cron)

```bash
# /etc/cron.daily/duofy-backup  (chmod +x)
cd /caminho/para/duofy
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U duofy -d duofy_v1 -Fc > /backups/duofy_$(date +%F).dump
docker run --rm -v duofy_storage_data:/s -v /backups:/out alpine \
  sh -c "cd /s && tar czf /out/storage_$(date +%F).tgz ."
find /backups -type f -mtime +14 -delete
```

---

## 5. Operação do dia a dia

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy

# Atualizar para a versão mais recente do código
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Reiniciar um serviço
docker compose -f docker-compose.prod.yml restart api

# Rodar migrations manualmente (normalmente automático no boot)
docker compose -f docker-compose.prod.yml run --rm migrate
```

**Rollback:** volte o código (`git checkout <tag/commit>`) e rode
`up -d --build`. O banco preserva os dados; migrations são aditivas (para reverter
schema, use `alembic downgrade` com cautela).

---

## 6. Segurança em produção (aplicado)

- `APP_ENV=production` faz a API **recusar** subir com JWT/senha default (`app/settings.py`).
- Segredos são **obrigatórios** no `.env` (o compose falha se faltarem).
- Postgres/Redis **não expõem portas**; só o Caddy publica 80/443.
- HTTPS automático (Let's Encrypt) pelo Caddy + headers de segurança na borda e no Next.
- Frontend chama `/api` na **mesma origem** (sem CORS, sem domínio fixo no bundle).
- Web roda como usuário **não-root** (imagem standalone).
- JWT cookie ainda não é HttpOnly (dívida consciente — ver `MEMORY`); mitigado por
  same-origin + headers. Planejar refactor de auth para HttpOnly.

---

## 7. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| API reinicia / não sobe | segredo default com `APP_ENV=production` | defina `JWT_SECRET_KEY`/`ADMIN_PASSWORD` fortes no `.env` |
| `compose` erro "defina X no .env" | variável obrigatória ausente | preencha a variável citada |
| HTTPS não emite | DNS não aponta / portas 80,443 fechadas | corrija A record e firewall; `docker compose ... logs caddy` |
| Agentes falham após migração | `JWT_SECRET_KEY` diferente do antigo | use o mesmo segredo, ou re-cadastre as chaves de provedor em /admin |
| PDF falha | libs de sistema ausentes | rebuild da imagem `api` (o Dockerfile já instala Pango/Cairo) |
| Upload de documento falha | volume `storage_data` sem permissão | `docker volume inspect duofy_storage_data` |

---

## 8. Nota sobre dependências

`npm audit` reporta CVEs do Next.js 14 cujo fix é o Next 16 (breaking). O uso do
app **não aciona** os vetores afetados (não usa o otimizador de imagens — já
desligado —, i18n, nem WebSocket em middleware). O upgrade para o Next 15/16 deve
ser feito como **tarefa isolada com regressão** (ver `MEMORY`).
