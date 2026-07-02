# Sprint Núcleo de Agentes — S2 (Configurabilidade) e S5 (Admin/Métricas) (concluídos)

## S2 — Tudo configurável

Verificado: a base de configurabilidade já existe e está coberta por testes. Consolidado nesta etapa:

| Item | Onde se configura | Runtime |
|---|---|---|
| **Prompts** dos agentes | `config/agents/*.md` | `read_agent_prompt(slug)` |
| **Skills / regras contextuais** | `config/rules/*.yaml`, `config/templates/*.md`, voz de marca em `config/brands` | `agent_config` / `read_config_text` |
| **Limites de token** por agente | `config/rules/agent_limits.yaml` (`token_budgets`) + override no DB | `get_token_budget(db, slug)` |
| **Quantidade de fontes** (pesquisa) | `config/rules/agent_limits.yaml` (`research_depth.{quick,standard,deep}.sources`, faixa 1–30) + override no DB (`research_depth_limits`) | `get_research_depth_limits(db, depth)` |
| **Provider e modelo por agente** | `Agent.default_model` + Admin › Modelos (providers) | resolvido em S1 (o modelo escolhido é o executado) |

Testes existentes cobrem o caminho config + override de DB para limites/fontes
(`tests/test_agent_limits.py`: `test_research_depth_from_config`,
`test_research_depth_invalid_db_falls_back_to_config`, `test_token_budget_from_db`, …).

**Ferramentas (tools) do Orquestrador** permanecem definidas em código (`build_tools`) com um
conjunto fixo (research/content/press/calendar/memory). Habilitar/desabilitar tools por agente
via config é uma extensão futura — sinalizada, fora do escopo mínimo desta consolidação.

## S5 — Admin funcional + Métricas rebaixadas

- **metrics_agent rebaixado a módulo interno**: removido do roster (`config/seeds/agents.yaml`).
  Confirmado que `metrics_service.generate_report` é **puramente determinístico** — não usa
  `call_llm`, `_get_agent` nem credencial; apenas agrega `ModelCall`/quality/auditoria e formata,
  usando o prompt `config/agents/metrics_agent.md` como config de módulo. Roster consolidado em
  **5 agentes**: Orquestrador, Pesquisa, Conteúdo, Imprensa, Guardião.
- **Admin** (já funcional, confirmado na auditoria): agentes, providers/modelos (chave cifrada),
  quality-settings, agent-settings (budgets/depth). "Permissões" e integrações Meta/Sheets/Tavily/
  SendGrid seguem marcadas como fora de escopo ("Em breve").
- **Validação de tokens/custos/latência/fontes/modelo efetivo**: `ModelCall` registra
  provider/model/tokens/custo/latência; `AgentRun.model` e `ModelCall.model` agora guardam o
  **modelo efetivo** (S1); `research_sources` registra as fontes com confiabilidade A–D.

## Teste
- `test_flow_reports.py::test_generate_internal_metrics_report` — `/api/reports/generate`
  funciona sem o agente `metrics_agent` (relatório determinístico).

## Critérios de aceite — atendidos
- [x] Prompts, regras, limites, nº de fontes e provider/modelo por agente configuráveis (config + DB).
- [x] Métricas rebaixadas a módulo; roster com 5 agentes; relatórios intactos.
- [x] Admin funcional para agentes, providers, modelos, memória, Guardião, custos e logs.
