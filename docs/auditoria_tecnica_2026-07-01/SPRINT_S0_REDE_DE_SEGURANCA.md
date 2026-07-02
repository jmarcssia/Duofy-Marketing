# Sprint Núcleo de Agentes — S0: Rede de Segurança (concluído)

**Data:** 2026-07-01 · **Objetivo:** criar testes dos fluxos críticos e CI **antes** de qualquer refatoração/remoção de código morto, para que nenhuma mudança das etapas seguintes (S1–S7) regrida em silêncio.

## O que foi entregue

### 1. Harness de integração com Postgres real (pgvector)
- **`apps/api/tests/conftest.py`** — aponta a app para um banco de teste (`duofy_v1_test` no Postgres do dev, `127.0.0.1:5433`), semeia dados estáticos uma vez (admin, marcas `duofy`/`postos`, 6 agentes, providers habilitados com chave fictícia cifrada) e **trunca as tabelas dinâmicas entre os testes**. Segue a convenção async do projeto (**anyio** + `@pytest.mark.anyio`).
- Fixtures: `client` (TestClient com lifespan), `auth_headers` (JWT real do admin), `db`, e **`patch_ai`** — mocka `call_llm` (em todos os serviços) e `embed_text` (em todos os módulos que o importam), evitando qualquer chamada de rede e **capturando o modelo efetivamente enviado** (base para o S1).
- **`apps/api/app/db.py`** — em `APP_ENV=test`, o engine usa `NullPool` (abre/fecha conexão a cada uso), eliminando o erro "event loop is closed" que ocorre com TestClient + fixtures em loops distintos. **Sem impacto em produção.**

### 2. Testes dos fluxos críticos (9 novos, todos verdes)
| Arquivo | Cobre |
|---|---|
| `test_flow_auth.py` | Login/JWT ponta a ponta: sucesso, senha errada (401), `/me` com e sem token |
| `test_flow_content.py` | `POST /api/content/generate` → persiste `Output` + `OutputVersion`; LLM chamado com a marca correta |
| `test_flow_press.py` | `POST /api/press/generate` → persiste output de imprensa |
| `test_flow_calendar.py` | Calendário como **módulo do usuário**: CRUD completo + export `.ics` (protege o comportamento que sobrevive à remoção do agente Calendário no S3) |
| `test_flow_approval.py` | **Gate do Guardião**: não se aprova output sem revisão de qualidade aprovada |

### 3. CI mínima — `.github/workflows/ci.yml`
- **Backend:** serviços Postgres(pgvector)+Redis → instala libs nativas do WeasyPrint → `ruff check app alembic` → `alembic upgrade head` → `pytest`.
- **Frontend:** `npm install` → `next lint` → `next build`.

### 4. Higiene pontual (necessária para CI verde)
- `test_export_pdf.py` — os 2 testes que geram PDF agora usam `@skipif` quando o WeasyPrint não está disponível (host de dev); os testes de `markdown_to_html` continuam rodando em qualquer ambiente.
- `app/routers/outputs.py` — auto-fix de ordenação de import (I001) do ruff; mudança puramente mecânica.

## Estado da suíte

```
85 passed, 2 skipped   (os 2 skips = testes de PDF, só rodam onde o WeasyPrint existe — CI/container)
ruff check app alembic → All checks passed!
```
Antes do S0: 76 passavam, 2 falhavam (WeasyPrint), **0 testes de integração HTTP/DB**, **0 CI**.

## Como rodar localmente
```bash
# 1. banco de teste (uma vez)
#    CREATE DATABASE duofy_v1_test;  e:
cd apps/api
DATABASE_URL="postgresql+asyncpg://duofy:duofy@127.0.0.1:5433/duofy_v1_test" \
APP_ENV=test JWT_SECRET_KEY="test-secret-key-with-32-bytes-minimum-xyz" \
python -m alembic upgrade head

# 2. testes
PYTHONPATH=apps/api APP_ENV=test \
DATABASE_URL="postgresql+asyncpg://duofy:duofy@127.0.0.1:5433/duofy_v1_test" \
python -m pytest -q
```

## Critérios de aceite (S0) — atendidos
- [x] Fluxos críticos cobertos por teste de integração real (auth, conteúdo, imprensa, calendário, gate do Guardião).
- [x] Suíte verde (`pytest` + `ruff`).
- [x] CI executando lint + migrations + pytest (backend) e lint + build (frontend).
- [x] Nenhuma regressão nos 76 testes pré-existentes.

## Próxima etapa
**S1 — modelo/provider efetivo por agente:** inverter a precedência `credential.default_model or model` para que o modelo escolhido seja o executado, consolidar `_provider_for_model` (5 cópias → 1) e persistir/expor o modelo efetivo em `ModelCall`. O `patch_ai` já captura o modelo enviado ao provedor, então a asserção de "modelo efetivo" entra como teste red→green.
