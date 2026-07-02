# 03 · Segurança e Vulnerabilidades

Auditoria AppSec do projeto (FastAPI + Next.js + Postgres + Redis/Celery + Docker). Todo achado tem evidência `arquivo:linha`.

**Contexto atenuante:** a aplicação é **single-tenant, para uma equipe interna única**, e em produção Postgres/Redis/API/worker ficam só na rede interna do Docker (apenas o Caddy expõe 80/443). Isso reduz — mas não elimina — o impacto de vários achados. Um comprometimento de qualquer estação da equipe (via XSS) ainda é caminho direto para roubo de sessão.

## Mapa de severidade

| Sev | Achados |
|---|---|
| 🔴 **CRÍTICA** | C-1 JWT cookie sem HttpOnly/Secure · C-2 sem rate limit no login · C-3 acoplamento JWT↔Fernet |
| 🟠 **ALTA** | A-1 sem revogação + expiração 12h · A-2 IDOR em documentos · A-3 admin default fraco · A-4 Next.js com CVEs |
| 🟡 **MÉDIA** | M-1 SSRF research · M-2 SSRF/roubo de key via base_url · M-3 middleware só checa presença · M-4 container API root · M-5 Chromium `--no-sandbox` · M-6 CORS+credentials |
| ⚪ **BAIXA** | B-1 Content-Disposition · B-2 log de dados sensíveis · B-3 PBKDF2 (ok, mas não argon2) · B-4 sem HSTS/CSP |

**Ordem de correção recomendada:** C-1 e C-2 (exploráveis remotamente sem privilégio) → A-4 (bypass de middleware Next) → C-3 (separar segredos antes de qualquer rotação) → A-2 (autorização de objeto).

---

## 🔴 CRÍTICA

### C-1 · JWT em cookie sem `HttpOnly` / `Secure` (roubo de sessão via XSS)
**Categoria:** OWASP A07 Broken Auth / A05 Misconfiguration
**Evidência:** `apps/web/lib/auth.ts:15-19` — `document.cookie = "duofy_token=...; path=/; max-age=43200; SameSite=Lax"`. Sem `HttpOnly`, sem `Secure`. O token é lido por JS em `getTokenFromCookie` (`lib/auth.ts:3-13`) e salvo no cliente após login (`login-form.tsx:27`).
**Impacto:** qualquer XSS (ou dependência JS comprometida) lê o JWT em claro e o exfiltra. Com validade de 12h e sem revogação (A-1), o atacante assume a sessão — inclusive admin. A ausência de `Secure` permite vazamento em qualquer request HTTP (o `.env.production.example` chega a prever `:80`/HTTP puro para testes).
**Correção:** emitir o token como cookie `HttpOnly; Secure; SameSite=Strict` no `Set-Cookie` do `/login` (backend) e lê-lo server-side. O `middleware.ts` já lê o cookie no servidor, então a migração é viável; o obstáculo é o `getTokenFromCookie()` espalhado por ~15 telas.
**Nota:** já registrado na memória do projeto como dívida consciente (`jwt-cookie-httponly-deferred`) — mas **continua sendo o risco de maior severidade**.

### C-2 · Ausência total de rate limiting / anti-brute-force no login
**Categoria:** OWASP A07 Identification & Auth Failures
**Evidência:** `apps/api/app/routers/auth.py:21-37` — `/api/auth/login` sem throttling/lockout/captcha. Busca por `slowapi|Limiter|rate_limit` no backend só encontra `agent_limits.py` (orçamento de tokens de LLM) — **não há rate limiting HTTP em nenhuma rota**.
**Impacto:** brute-force/credential-stuffing sem fricção. Agravado por: senha admin default (A-3) e login form **pré-preenchido** com `admin@duofy.com.br` / `admin123456` (`login-form.tsx:12-13`). Também abre DoS por tentativa massiva.
**Correção:** rate limiting por IP+conta no `/login` (ex.: `slowapi`, ou no próprio Caddy), lockout progressivo, log de tentativas falhas.

### C-3 · `JWT_SECRET_KEY` deriva a chave Fernet (segredo único, dois papéis)
**Categoria:** OWASP A02 Cryptographic Failures / Secrets Management
**Evidência:** `apps/api/app/crypto.py:11-14` — a chave Fernet é derivada por SHA-256 do próprio `jwt_secret_key`:
```python
digest = hashlib.sha256(get_settings().jwt_secret_key.encode()).digest()
key = base64.urlsafe_b64encode(digest)
return Fernet(key)
```
O mesmo segredo assina/verifica JWTs (`security.py:39-55`) **e** cifra as API keys dos provedores (`admin.py:217`, `llm.py:51`, `embeddings.py:59`, `research_service.py:183`).
**Impacto duplo:**
1. **Rotação impossível sem quebra:** rotacionar `JWT_SECRET_KEY` (resposta padrão a vazamento de token) torna todas as `api_key_encrypted` indecifráveis e derruba todos os agentes. O mecanismo de resposta a incidente de auth **quebra o mecanismo de cripto de segredos**.
2. **Blast radius ampliado:** vazar o segredo do JWT = forjar tokens **E** decifrar todas as chaves de API.
**Correção:** separar em dois segredos independentes (`JWT_SECRET_KEY` e `SECRETS_ENCRYPTION_KEY` via `Fernet.generate_key()`) e suportar rotação com re-cifragem das credenciais. **Fazer isso antes de qualquer rotação**, senão a rotação vira incidente.
**Nota:** coerente com a memória do projeto (`jwt-secret-fernet-coupling`).

---

## 🟠 ALTA

### A-1 · Sem revogação / logout real; expiração longa (12h)
**Categoria:** OWASP A07 Broken Auth
**Evidência:** `/logout` só retorna `{"status":"ok"}` (`auth.py:40-42`); `access_token_expire_minutes = 720` (`settings.py:28`); logout do front só apaga o cookie (`lib/auth.ts:21-23`).
**Impacto:** token roubado (via C-1) permanece válido até 12h mesmo após "logout" ou desativação do usuário. Mitigado parcialmente por `get_current_user` revalidar `is_active`, mas não há denylist nem versão de credencial.
**Correção:** reduzir expiração (30–60 min) + refresh token; `jti`/`token_version` com denylist em Redis para revogação imediata.

### A-2 · IDOR/BOLA — qualquer usuário baixa/exporta documento de qualquer marca
**Categoria:** OWASP A01 Broken Access Control
**Evidência:** `apps/api/app/routers/documents.py:51-59` (`_get_document_or_404` busca só por `Document.id`) e `221-238`/`241-253` (download/export exigem só `get_current_user`, sem checar propriedade/marca). Contraste: o chat **escopa** por `user_id` (`chat.py:93,111`) — o padrão existe, mas não foi aplicado a documentos.
**Impacto:** um `manager` enumera IDs sequenciais e baixa todo o material de memória/marca de qualquer cliente. Em contexto multi-marca, é vazamento cruzado.
**Correção:** filtrar por marca/permissão em todas as rotas de documento (download, export, chunks, list) — ou documentar explicitamente o modelo "toda a equipe vê tudo".

### A-3 · Credenciais admin default fracas e propagadas
**Categoria:** OWASP A07 / Secrets Management
**Evidência:** `settings.py:10,31` (`DEFAULT_ADMIN_PASSWORD="admin123456"`), `docker-compose.yml:68-69,135-137`, `seed.py:29-48`, e o login form pré-preenchido (`login-form.tsx:12-13`).
**Mitigação existente (boa):** `settings.py:44-65` faz a API **recusar subir** em `APP_ENV` não-dev se `ADMIN_PASSWORD` ainda for o default. Depende de `APP_ENV` estar correto.
**Correção:** manter o hardening; remover o pré-preenchimento de senha no login; forçar troca no primeiro login; nunca expor a porta 8000 usando o compose de dev.

### A-4 · Next.js 14.2.35 com CVEs conhecidos (inclui bypass de middleware)
**Categoria:** OWASP A06 Vulnerable & Outdated Components
**Evidência:** `apps/web/package.json:12,20` — `next` e `eslint-config-next` em `14.2.35`.
**Impacto:** a linha 14.2.x acumulou vulnerabilidades relevantes (SSRF em Server Actions, cache poisoning e a família **CVE-2025-29927 — bypass de autorização no middleware**). Como toda a proteção de rotas do frontend depende de `middleware.ts` (ver M-3), bypass de middleware é diretamente relevante aqui.
**Correção:** rodar `npm audit`, atualizar para a última 14.2.x/15.x patcheada **em tarefa isolada com regressão**; garantir defesa em profundidade (o backend já valida o token, o que ajuda).
**Nota:** já registrado na memória (`npm-audit-next-bloqueador-producao`).

---

## 🟡 MÉDIA

### M-1 · SSRF no serviço de research
**Evidência:** `research_service.py:279-287` (URLs do usuário viram candidatos), `:109-117` (`_fetch_url_text` com `httpx.AsyncClient(follow_redirects=True)` sem validar host/esquema/IP), `:120-137` (`_fetch_with_playwright` idem).
**Impacto:** a API pode ser induzida a requisitar `http://169.254.169.254/` (metadata cloud), serviços internos (`http://postgres:5432`, `redis`) ou `file://`. `follow_redirects=True` permite bypass por redirect. Em VPS sem metadata endpoint o risco cai, mas a rede interna do Docker é alcançável.
**Correção:** validar esquema (só http/https), resolver o host e **bloquear IPs privados/loopback/link-local** (127./10./172.16-31/192.168/169.254), limitar redirects, allowlist de domínios quando possível.

### M-2 · SSRF / roubo de API key via `base_url` de provedor
**Evidência:** admin define `base_url` livre (`admin.py:188-221`); esse `base_url` recebe `POST` com `Authorization: Bearer <api_key decifrada>` (`llm.py:54-71`, `embeddings.py:60`).
**Impacto:** um admin (ou admin comprometido via C-1) aponta o `base_url` para host próprio e **captura a chave real** enviada no header, ou usa a API como proxy SSRF autenticado. Requer privilégio admin → Média.
**Correção:** allowlist de hosts de provedores conhecidos; validar esquema/host; nunca enviar credenciais para base_url arbitrário.

### M-3 · Proteção de rotas do frontend só checa presença do cookie
**Evidência:** `middleware.ts:20-35` verifica apenas **existência** de `duofy_token`, não valida assinatura/expiração/role. Um cookie forjado qualquer (`duofy_token=x`) passa o gate do frontend.
**Impacto:** o gate do front é cosmético; a segurança real está no backend (bom). Combinado com A-4 (bypass de middleware), reforça que não se deve confiar no middleware. Risco real baixo porque o backend valida — por isso Média/defesa em profundidade.
**Correção:** tratar o middleware como UX; garantir que **toda** rota de API sensível exija `get_current_user`/`require_admin` (já ocorre nas revisadas); validar o JWT no middleware se ele for usado como controle.

### M-4 · Container da API roda como root
**Evidência:** `apps/api/Dockerfile:1-32` — nenhum `USER`; `uvicorn` (e worker e migrate, mesma imagem) rodam como **root**. Contraste: `apps/web/Dockerfile.prod:29,35` usa `USER nextjs`.
**Impacto:** uma RCE no container (via deps, WeasyPrint/Chromium, parsing de PDF/DOCX de upload) executa como root, ampliando o blast radius e facilitando escape.
**Correção:** criar usuário não-root no `apps/api/Dockerfile` e `USER` antes do `CMD`; considerar `read_only`/`cap_drop` no compose.

### M-5 · Chromium com `--no-sandbox` processando URLs não confiáveis
**Evidência:** `research_service.py:127-130` — `chromium.launch(args=["--no-sandbox", ...])` navegando em URLs externas/fornecidas pelo usuário (research "deep").
**Impacto:** `--no-sandbox` + conteúdo web hostil + processo root (M-4) = superfície séria de comprometimento do container por exploit de renderer.
**Correção:** rodar o Chromium com sandbox (usuário não-root permite) ou isolar o fetch em processo/container dedicado com menos privilégios.

### M-6 · CORS com `allow_credentials=True`
**Evidência:** `main.py:64-70` — `allow_credentials=True` com `allow_origins=settings.cors_origins`; `.env:5` usa localhost fixo.
**Impacto:** hoje as origens são localhost (ok). Risco operacional: se `BACKEND_CORS_ORIGINS` virar `*` ou origem ampla com credenciais, habilita roubo cross-origin. O modelo atual usa Bearer, não cookie cross-site (atenua) — mas se C-1 migrar para cookie, isso escala para crítico.
**Correção:** manter origens explícitas; validar em código que nunca haja `*` com credenciais.

---

## ⚪ BAIXA

### B-1 · `Content-Disposition` com filename não sanitizado
`documents.py:71-76,234-238` — `filename` derivado do nome de upload do usuário, sem sanitizar `"`/CRLF. Impacto baixo (Starlette codifica boa parte). **Correção:** normalizar filename e usar `filename*=UTF-8''`.

### B-2 · Possível log de dados sensíveis
`error_handlers.py:21-26` (`logger.exception`) e `llm.py:76-78` (inclui `exc.response.text[:600]` em mensagens que podem chegar a `AgentRun.error`/`Document.error`). A resposta ao cliente é genérica (bom), mas o corpo de erro de provedores pode gravar tokens/PII nos logs. **Correção:** redigir respostas de provedor antes de logar/persistir.

### B-3 · PBKDF2 em vez de bcrypt/argon2 (informativo)
`security.py:15-34` — PBKDF2-HMAC-SHA256, 390k iterações, salt por senha, `compare_digest`. Implementação **correta**; não vulnerável. **Correção opcional:** migrar para argon2id, ou elevar iterações para ~600k (recomendação OWASP atual).

### B-4 · Sem HSTS / CSP no Caddy
`infra/caddy/Caddyfile:19-24` — só `X-Content-Type-Options` e `Referrer-Policy`. Faltam `Strict-Transport-Security`, `Content-Security-Policy`, `frame-ancestors`. Sem HSTS há janela de downgrade/SSL-strip (agravado por permitir `:80`); sem CSP, o impacto de um XSS (C-1) é maior. **Correção:** adicionar HSTS (com domínio HTTPS), CSP restritiva e `frame-ancestors 'none'`.

---

## ✅ Pontos positivos de segurança (confirmados)

- **Sem SQL injection:** o único raw SQL (`rag.py:55-92`) usa `text()` com parâmetros vinculados; `vector_to_sql` gera string numérica passada como parâmetro, não interpolada. O restante é ORM.
- **Sem path traversal em upload:** grava com `uuid4().hex + suffix` em `STORAGE_DIR`; o nome do usuário não influencia o caminho. Download usa `stored_path` do banco.
- **Segredos nunca expostos em API:** `password_hash` e `api_key_encrypted` jamais aparecem em schemas; provedores retornam `has_api_key`/`masked_api_key`.
- **Hardening de produção fail-fast:** `settings.py:44-65` recusa subir com JWT/admin default fora de dev.
- **Isolamento de rede em produção:** só o Caddy expõe portas; em dev, Postgres/Redis fazem bind só em `127.0.0.1`.
- **`.env` real sem segredos** e coberto pelo `.gitignore`; YAML sempre via `yaml.safe_load`.
- **Chat escopado por usuário** (contraste que evidencia o gap A-2).

---

## Resumo de correção priorizada

| Prioridade | Itens | Efeito |
|---|---|---|
| **P0 (bloqueadores)** | C-1, C-2 | Fecha os dois vetores exploráveis remotamente sem privilégio. |
| **P1** | A-4, C-3 | Elimina bypass de middleware; permite rotação de segredo sem incidente. |
| **P2** | A-1, A-2, M-1, M-4, M-5 | Revogação de token; autorização de objeto; contenção de SSRF/RCE. |
| **P3** | A-3, M-2, M-3, M-6, B-1..B-4 | Hardening de defesa em profundidade e higiene. |

> Detalhes de esforço e sequência em **[07 · Plano de Ação Priorizado](07_PLANO_DE_ACAO_PRIORIZADO.md)**.
