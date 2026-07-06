# Roadmap Pós-Demo — Duofy V1

> Sequência priorizada após a apresentação de 07/07. Baseado na auditoria independente
> (`AUDITORIA_VERDADE_DUOFY_2026-07-06.md`) e no que ficou pendente na estabilização pré-demo
> (`PRE_DEMO_STABILIZATION_REPORT.md`). Ordem: P1 (uso interno) → P2 (produção) → P3 (evolução).

---

## P1 — antes de uso interno amplo

1. **Sanitização de prompt fora da pesquisa** (injection). Aplicar `sanitize_prompt_input` a:
   briefing livre de cocriação, contexto RAG na cocriação, conteúdo enviado ao Guardião,
   `press/generate`, orquestrador e **evidência web coletada** (`_sources_block` em research).
   *Esforço: médio. Sem dependência externa.* Arquivos: `cocreation_service.py`,
   `content_generation.py`, `quality_guardian.py`, `calendar_service.py`, `orchestrator.py`,
   `research_service.py`.
2. **Sincronização completa peça↔pacote (Opção A).** Ao refinar/editar uma peça, atualizar o
   `structured_json`/`content` da versão corrente (ou criar nova versão); ao refinar o pacote,
   re-explodir as peças. Hoje só o export é mitigado (inclui peças + aviso). *Médio.*
3. **Resíduos de brand_scope.** Migração para dar `brand_slug` a `AgentRun` (escopar `agents/runs`
   e `operations.total_agent_runs`); decidir política de **escrita** em `institucional` (hoje qualquer
   restrito pode escrever). *Médio.*
4. **Recuperação de evento `running`.** Sweep de órfãos no scheduler ou timeout de execução — hoje
   um crash no meio de uma execução trava o evento (só PATCH manual destrava). *Médio.*
5. **Auditoria nos gaps.** `PATCH /publications/{id}`, upload de mídia e `PATCH /pieces/{id}` sem
   `record_audit_event`. *Pequeno.*

## P2 — antes de produção real

6. **Meta real** (Graph API/OAuth). Unificar os **dois** stubs (`publishers.py` e o inline de
   `publications.py`) antes; usar a validação de marca cruzada e magic bytes já adicionadas.
   *Grande; depende de app Meta aprovado.*
7. **Endpoints LLM assíncronos** (research/cocreation/refine): AgentTask + poll de status, eliminando
   o teto de timeout do proxy e o polling frágil do frontend. *Grande.*
8. **Hardening de deploy.** Plumbar `FERNET_SECRET_KEY` nos composes + `.env.production.example`;
   **corrigir `DEPLOY.md`** (seed é manual, não automático); rate-limit/lockout no login; HSTS/CSP no
   Caddy. *Pequeno/médio.*
9. **Worker de lembrete/recorrência** + **publicação agendada automática** (hoje `reminder_at`,
   `recurrence_rule` e `Publication.scheduled_at` são só metadados). *Médio.*
10. **npm audit / Next 16** em tarefa isolada com regressão do build; adicionar `tsc --noEmit` e
    `npm audit` ao CI (hoje ausentes). *Médio.*
11. **Contagem de publicações em Relatórios no backend** (hoje client-side, trava em 100 e ignora o
    período selecionado). *Pequeno.*
12. **Hardening SSRF** na coleta web: pin de IP resolvido, bloquear redirect antes do request,
    isolar/proxy para o Playwright (depth=deep). *Médio.*

## P3 — evolução

13. Biblioteca de templates de conteúdo + edição/exclusão pela UI.
14. Deep-links reais em Revisão / painel de evento / busca global (hoje levam à raiz dos módulos).
15. Testes de frontend (Playwright/Vitest) e o validador de taxonomia prometido (inexistente hoje).
16. Monitoramento/alertas de custo de IA (o banco já tem `ModelCall` com custo/tokens).
17. Re-embedding após outage do provedor de embeddings; piso de score no RAG (evita contexto lixo).
18. Revogação de JWT (logout hoje só apaga cookies; token válido por 12h).
19. Papéis granulares reais (Editor/Revisor/Visualizador) no modelo de dados, se o produto exigir.
