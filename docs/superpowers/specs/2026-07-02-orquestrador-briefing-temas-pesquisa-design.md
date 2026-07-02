# Orquestrador: Briefing por tarefa + Modelo de Pesquisa + Banco de Temas de Pesquisa

**Data:** 2026-07-02
**Branch base:** `sprint/nucleo-agentes`
**Contexto:** Sprint núcleo de agentes concluído (ver `duofy-sprint-nucleo-agentes`). Regra herdada: **não reescrever arquitetura** — reusar grafo/serviços, config em `config/` + overrides no Postgres, Admin existente.

## Objetivo

No chat do agente Orquestrador (`/operations`), adicionar:
1. Um **briefing** que antecede a execução de qualquer tarefa de agente — o orquestrador entende a solicitação, propõe um plano e só executa após aprovação do usuário num painel lateral/modal.
2. A escolha de **modelo LLM** — disponível **apenas para tarefas de Pesquisa**, dentro do briefing.
3. Acesso a um **banco de temas de pesquisa** (separado do banco de cocriação) para disparar pesquisas por marca com agilidade.

## Decisões fixadas (brainstorming)

- **Abordagem B — duas fases (planejar → executar).** Sem interromper/retomar o grafo LangGraph e sem checkpointer Postgres (que o sprint adiou). São duas execuções independentes; o plano fica persistido no banco, então falha de qualquer lado é recuperável.
- **Escopo do modelo:** a escolha de modelo vale **só para tarefas de Pesquisa**, naquela execução. Cocriação, Imprensa, Guardião, Calendário e o próprio Orquestrador mantêm os modelos configurados no Admin (`Agent.default_model`).
- **Briefing antes de toda tarefa de agente** (pesquisa, conteúdo, imprensa, calendário). Conversa comum (papo/pergunta) responde direto, sem painel.
- **Painel lateral/modal** para o briefing (não conversacional puro).
- **Banco de temas de pesquisa separado** do `ContentTheme` (cocriação). Gestão na **Memória** (mesmo padrão: listar/adicionar/excluir/importar CSV) + adicionar rápido no chat. Acesso pelo botão "Temas" no chat **e** por campo dentro do briefing.
- **Skill do orquestrador:** comportamento (briefing/classificação/delegação) via prompt/skills configurável do Admin (infra do S2); tools novas em código só se o fluxo exigir (nesta entrega: nenhuma necessária).
- **Lista de modelos (todos via OpenRouter):** `google/gemini-3.1-pro`, `z-ai/glm-5.2`, `minimax/minimax-m3`, `anthropic/claude-opus-4.8`, `openai/gpt-5.5-pro`, `deepseek/deepseek-v4-flash`.

## Arquitetura

### Fluxo de briefing (backend, duas fases)

**Fase 1 — planejar.**
- Mensagem do usuário entra por `POST /api/chat/sessions/{id}/messages` (inalterado na assinatura).
- O worker roda primeiro uma chamada curta de **planejamento** usando o modelo do Orquestrador do Admin. Saída estruturada:
  ```json
  {
    "tipo": "pesquisa | conteudo | imprensa | calendario | conversa",
    "objetivo": "string",
    "resumo_do_plano": "string",
    "agente_alvo": "research | content | press | calendar | null",
    "tema_sugerido": "string | null"
  }
  ```
- Se `tipo = conversa`: o orquestrador responde direto como hoje, **sem painel** (nenhum briefing criado).
- Se for tarefa: nada é executado. Cria-se um registro em `briefings` (`status = pending`, `plan` em JSON, `session_id`, `message_id`, `brand_slug`) e o chat recebe uma mensagem curta ("Preparei o briefing, revise para eu executar").

**Fase 2 — executar.**
- `POST /api/briefings/{id}/approve` com body `{ "model_override": "string|null", "research_theme_id": "int|null" }`.
- Cria a `AgentTask` de execução real pelo caminho `orchestrate` já existente, com o plano aprovado e os overrides nos params.
- `model_override` só é aceito quando `tipo = pesquisa` **e** o id está na lista configurada. O serviço de pesquisa usa esse modelo naquela execução em vez de `Agent.default_model`. Registro em `model_calls` permanece automático.
- Todos os 6 modelos têm id com `/` → `provider_for_model` já resolve OpenRouter sem alteração.

**Estados do briefing:** `pending → approved → executed | failed`; ou `cancelled` (botão "Ajustar", ou automaticamente quando o usuário envia nova mensagem havendo briefing pendente na sessão — a conversa refina e um novo briefing nasce).

### Lista de modelos

- Arquivo `config/research_models.yml` (padrão do sprint: config em arquivo + override futuro no Postgres). Cada item: `label`, `model_id`, `enabled`. Sementes = os 6 modelos acima.
- `GET /api/research-models` expõe os habilitados.
- O dropdown do painel vem pré-selecionado com o modelo atual do agente Pesquisa.

### Banco de temas de pesquisa (separado)

- Nova tabela `research_themes`: `id`, `title`, `notes` (opcional), `brand_slug`, `created_at`, `updated_at`.
- Endpoints no padrão do banco de cocriação:
  - `GET /api/research-themes?brand_slug=&q=` — lista por marca, busca opcional.
  - `POST /api/research-themes` — cria.
  - `DELETE /api/research-themes/{id}` — remove.
  - `POST /api/research-themes/import` — importa CSV (separador `;`, mesmo parser adaptado do `theme_import.py`).

### Frontend (`/operations`)

- **Botão "Temas"** ao lado do input: popover com busca na lista da marca ativa + adicionar rápido. Clicar num tema **não passa pelo LLM**: chama `POST /api/chat/sessions/{id}/theme-briefing` que registra a mensagem do usuário e cria o briefing de pesquisa já montado com o tema — o painel abre na hora (zero latência de LLM).
- **Painel de briefing** (lateral/modal): resumo do plano, agente alvo e, quando pesquisa, seletor de modelo + campo de tema (pré-preenchido se veio do botão; busca no banco se veio de texto livre). Botões **Aprovar** (executa) e **Ajustar** (cancela o briefing; usuário refina por mensagem). O painel aparece via o polling de tasks que a página já faz.

### Skill do orquestrador

- Comportamento do briefing (resumir, classificar, propor plano, delegar) vira instrução no campo de prompt/skills configurável do Admin (infra do S2) — editável sem deploy.
- Tools novas em código: nenhuma nesta entrega. Fase 1 é saída estruturada; a execução usa as tools existentes. Porta fica aberta para tools futuras.

## Erros

- Falha no LLM de planejamento → erro real no chat (padrão atual; sem `MissingGreenlet`).
- Aprovação com modelo fora da lista, ou com OpenRouter desabilitado → `422` com mensagem clara.
- Aprovação de briefing não-`pending` → `409`/`422` idempotente (não recria task).

## Testes (padrão S0)

Banco `duofy_v1_test`, `anyio`, `conftest`, `patch_ai`. Cobrir:
- mensagem de tarefa → briefing `pending` criado, nada executado;
- `tipo = conversa` → nenhum briefing, resposta direta;
- aprovação → `AgentTask` criada com `model_override` correto nos params (só pesquisa);
- aprovação com modelo fora da lista → `422`;
- botão de tema → `theme-briefing` cria briefing sem chamada LLM;
- CRUD + import de `research_themes` (isolamento por `brand_slug`).

Migration Alembic única para `briefings` e `research_themes`.

## Fora de escopo

- Checkpointer Postgres do grafo (adiado no sprint).
- Escolha de modelo para agentes que não sejam Pesquisa.
- Override da lista de modelos via Postgres (fica no YAML por ora; porta aberta).
- Novas tools de código no orquestrador.
