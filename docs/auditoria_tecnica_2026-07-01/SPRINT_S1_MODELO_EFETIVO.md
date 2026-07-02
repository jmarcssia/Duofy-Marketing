# Sprint Núcleo de Agentes — S1: Modelo/Provider Efetivo por Agente (concluído)

**Objetivo:** garantir que o modelo escolhido para o agente é o efetivamente executado, e ter uma única fonte de verdade para o roteamento provider↔modelo.

## Mudanças

### 1. Precedência corrigida (o modelo escolhido vence)
Antes, todos os serviços chamavam `call_llm(model=credential.default_model or model, ...)` — o `default_model` do provider **sobrepunha** o modelo do request/agente. Corrigido para `model=model` (o modelo já resolvido como `request.model or agent.default_model`) em:
- `content_generation.py`
- `research_service.py`
- `orchestrator.py`
- `calendar_service.py` (2 call sites)
- `quality_guardian.py` (`_quality_credential` retorna o modelo resolvido)
- `orchestrator_graph.py` (`model = agent.default_model or credential.default_model`)

### 2. `provider_for_model` consolidado (5 cópias → 1)
Nova função canônica em **`app/llm.py`**: `provider_for_model(model)`. Removidas as 5 cópias locais divergentes (uma delas mapeava `~anthropic/` de forma inconsistente). Regra única:
- prefixo `~` ou formato `vendor/modelo` → **openrouter**
- `gpt-`/`o1`/`o3` → **openai**
- `claude-` → **anthropic**
- fallback → **openrouter**

### 3. Modelo efetivo persistido/exposto
Como `call_llm` recebe agora o modelo correto, `ModelCall` (via `record_model_call`) e `AgentRun.model` passam a registrar o **modelo efetivamente executado** — sem mudança adicional. Admin/Relatórios já exibem `model`.

## Teste (red → green)
`tests/test_flow_model_effective.py` — gera conteúdo com `model="~anthropic/claude-3.5-sonnet"` (≠ default do provider) e verifica que:
- o modelo enviado ao provedor é o escolhido (não o default do provider);
- o provider de um `~anthropic/...` é `openrouter`;
- `AgentRun.model` persiste o modelo efetivo.

Falhava antes da correção (capturava `~anthropic/claude-sonnet-latest`); passa depois.

## Estado
```
86 passed, 2 skipped   ·   ruff check app → All checks passed!
```

## Critérios de aceite (S1) — atendidos
- [x] Modelo escolhido == modelo enviado ao provedor == `AgentRun.model`.
- [x] `provider_for_model` único, sem cópias divergentes.
- [x] Sem regressão na suíte.
