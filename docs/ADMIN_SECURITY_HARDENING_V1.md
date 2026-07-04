# Admin & Security Hardening — V1 (FASE 12)

> Fechamento dos gaps de segurança priorizados no `ESTADO_DO_SISTEMA_2026-07-04.md`
> (C1/V1/V4/V5), com testes. Complementa a ativação operacional do C1 pela UI (FASE 11).

---

## 1. C1 — isolamento por marca (anti-IDOR) agora operacional

**Mecanismo** (`app/access.py`): `assert_brand_access` (404 no mismatch, sem vazar existência) e
`accessible_brands` (None = todas; lista = escopo + institucional). `brand_scope` nulo/vazio = acesso total.

**Aplicado** (além de outputs/documents/pieces que já tinham): **calendar**, **research** e **operations**:
- `routers/calendar.py`: `_get_event_or_404` verifica escopo; `list`/`export.ics` filtram por
  `accessible_brands`; `create`/`generate` validam `payload.brand_slug`.
- `routers/research.py`: `_get_report_or_404` verifica escopo; `list_reports` filtra por `accessible_brands`.
- `routers/operations.py`: `summary`/`audit-events` verificam `brand_slug` explícito e a trilha é filtrada
  por `accessible_brands`.

**Ativação prática (FASE 11):** `/admin/acessos` — o admin seleciona o usuário, marca "todas" ou marcas
específicas, e salva via `PUT /api/admin/users/{id}/brand-scope` (auditado). Enquanto `brand_scope` for
nulo (time interno único), a proteção fica dormente por design; ao atribuir escopos, ativa.

**Testes:** `test_c1_calendar_research.py` (6) — cross-brand negado em calendar/research/operations; próprio
brand permitido; listas excluem outras marcas. `test_access_control.py` (existentes) — outputs/documents.

**Limitação honesta (follow-up):** `GET /operations/summary` **sem** `brand_slug` para usuário restrito
ainda agrega todas as marcas do escopo de forma simples — a função `operations_summary` é single-brand;
uma variante multi-marca fica como follow-up. O vetor dominante (acesso/enumeração por-id em
calendar/research) está fechado.

## 2. V1 — auditoria de ações admin

`record_audit_event` adicionado a `PUT /admin/quality-settings`, `/admin/agent-settings` e
`/admin/providers/{provider}` (antes sem trilha). A **chave de provedor nunca** aparece na trilha —
o metadata registra apenas `api_key_changed: bool`. Ações: `admin.quality_settings_updated`,
`admin.agent_settings_updated`, `admin.provider_updated`. Visíveis em `/admin/acessos`.
**Testes:** `test_admin_audit.py` (3), incluindo a asserção de que o segredo não vaza.

## 3. V4 — sanitização anti-prompt-injection

Novo `app/prompt_safety.py:sanitize_prompt_input` — neutraliza instruções suspeitas (PT/EN: "ignore
previous instructions", "desconsidere as instruções", "aja como…", rótulos `system:/assistant:`),
remove delimitadores (```` ``` ````, `###`, `---`) e limita o tamanho, **preservando o conteúdo útil**.
Aplicado em `research_service._user_prompt` a `theme`, `period`, `brand.description` e `rag_context`.
**Testes:** `test_prompt_safety.py` (9) — benigno preservado, malicioso neutralizado (PT/EN), delimitadores/
rótulos removidos, tamanho limitado, e o prompt real da pesquisa neutraliza injection.

## 4. V5 — tracking de web-search em ModelCall

`research_service._openrouter_web_search` passou a gravar `ModelCall` (provider/model/tokens/custo/
latência/status) via `record_model_call`, best-effort (nunca derruba a coleta de fontes). O `brand_slug`
é propagado. Assim o custo dessa etapa aparece nos Relatórios. **Testes:** `test_web_search_tracking.py`
(2) — sucesso registra ModelCall completo; falha registra `status=failed` e não quebra a coleta.

## 5. Fix pontual — GET /admin/users (500)

`AdminUserRead.email` era `EmailStr`, que rejeita domínios reservados (`admin@duofy.local`) e derrubava a
listagem de usuários com 500 — bug pré-existente, latente até a página `/admin/acessos` consumir o
endpoint. Corrigido para `str` (modelo de saída lendo e-mails já persistidos e confiáveis).

## 6. Pendências conhecidas (fora desta entrega)

- **npm audit (Next.js):** rodar antes de produção; upgrade arriscado só com regressão do `next build`.
- **operations/summary multi-marca** para usuário restrito (§1).
- **V2 (opcional):** `GET /admin/providers` retorna `has_api_key` + máscara; poderia expor só `has_api_key`.
- Integração **Meta real** (OAuth/Graph API) — ver `PUBLICATIONS_META_PREP_V1.md`.
