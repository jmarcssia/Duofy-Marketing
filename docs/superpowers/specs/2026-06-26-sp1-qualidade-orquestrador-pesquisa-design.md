# Design — SP1: Qualidade do Orquestrador & Pesquisa

Data: 2026-06-26
Status: aprovado para virar plano de implementação
Contexto maior: primeiro de 4 sub-projetos (SP1 orquestrador/pesquisa, SP2 base de conhecimento, SP3 pesquisa de mercado, SP4 refino dos agentes). Este spec cobre apenas o SP1.

## 1. Problema (3 dores observadas em uso)

1. **Truncamento de saída.** `apps/api/app/llm.py` usa `max_tokens=1200` fixo em todas as chamadas (OpenAI/OpenRouter e Anthropic), e `apps/api/app/orchestrator_llm.py` também (1200). Isso limita a saída de TODOS os agentes a ~900 palavras — a causa de "a pesquisa corta muita informação".
2. **Truncamento de entrada na pesquisa.** `apps/api/app/research_service.py`: `MAX_SOURCES = 8` e `_evidence_excerpt` corta cada fonte em `[:1800]` chars. O campo `depth` (quick/standard/deep) existe mas é ignorado na coleta.
3. **Latência/silêncio percebidos no chat.** Durante o loop do orquestrador, o artefato (ex: relatório de pesquisa) aparece em `/research` no meio do loop, enquanto a resposta do chat só surge no último passo. O chat já renderiza `activeTask.logs` (`apps/web/app/(app)/chat/page.tsx:292`), mas hoje cada ferramenta loga só no início e os logs não são proeminentes, dando sensação de silêncio e de "ordem trocada".

## 2. Objetivo

Eliminar o truncamento (saída e entrada), tornar limites de tokens e profundidade de pesquisa **configuráveis por agente no Admin** (com defaults sensatos), e fazer o chat mostrar **progresso ao vivo** (passos + links de artefato) durante o trabalho do orquestrador.

## 3. Decisões (brainstorming)

| Tema | Decisão |
|------|---------|
| Truncamento de saída | Orçamento de tokens **por agente** |
| Truncamento de entrada | Aprofundar a coleta (mais fontes + trecho maior), ligada ao `depth` |
| Latência/ordenação | **Progresso ao vivo no chat** (não otimização de velocidade real) |
| Configuração | Tudo **configurável no Admin**, com ordem: Admin (DB) → default em config → fallback no código |

## 4. Ordem de resolução de configuração

Um resolver central retorna o valor efetivo seguindo a precedência:

1. Valor salvo no Admin (tabela `Setting`, key/value, JSON) — se presente e válido.
2. Default em arquivo de config (`config/rules/agent_limits.yaml`).
3. Fallback hardcoded no código.

Espelha o padrão existente de `quality-settings` (`_setting_value`/`_upsert_setting` em `apps/api/app/routers/admin.py`). **Sem migration Alembic** — a tabela `Setting` já existe.

## 5. Componentes

### 5.1 Resolver de limites (`agent_config` ou módulo dedicado)
- `get_token_budget(db, agent_slug) -> int`
- `get_research_depth_limits(db, depth) -> {sources: int, excerpt: int}`
- Lê Admin (DB) → config YAML → fallback. Valida tipos/intervalos; valor inválido cai para o próximo nível.

Defaults (config YAML):
```yaml
token_budgets:
  research_agent: 6000
  content_agent: 4000
  press_agent: 3000
  quality_guardian: 2000
  orchestrator: 2000
  default: 1500
research_depth:
  quick:     { sources: 8,  excerpt: 1800 }
  standard:  { sources: 12, excerpt: 3000 }
  deep:      { sources: 15, excerpt: 4000 }
```
Fallback no código: budget `1500`; depth `quick`.

### 5.2 `call_llm` aceita `max_tokens`
- `apps/api/app/llm.py`: `call_llm(..., max_tokens: int | None = None)`. Quando `None`, mantém o atual `1200` (compat). Os payloads OpenAI-compat e Anthropic usam o valor recebido.
- Cada serviço passa o orçamento resolvido do seu agente: `content_generation.py` (content_agent), `research_service.py` (research_agent), `calendar_service.py` (press/calendar), `quality_guardian.py` (quality_guardian).
- `orchestrator_llm.build_orchestrator_chat_model`: `max_tokens` lido do resolver (orchestrator).

### 5.3 Coleta de pesquisa por `depth`
- `research_service.py`: substituir `MAX_SOURCES` constante e o `[:1800]` por valores vindos de `get_research_depth_limits(db, payload.depth)`.
- `collect_research_sources` e `_evidence_excerpt` passam a receber os limites (sources, excerpt) em vez de constantes globais.

### 5.4 Admin: settings dos agentes
- `apps/api/app/routers/admin.py`: `GET /api/admin/agent-settings` e `PUT /api/admin/agent-settings`.
  - Read retorna `{token_budgets: {...}, research_depth: {quick|standard|deep: {sources, excerpt}}}`, mesclando defaults com o que estiver salvo.
  - Write valida e faz upsert (JSON) na tabela `Setting` (chaves ex.: `agent_token_budgets`, `research_depth_limits`).
- `apps/api/app/schemas.py`: schemas `AgentSettingsRead`/`AgentSettingsUpdate`.
- **UI**: nova seção "Limites dos Agentes" em `apps/web/app/(app)/admin/config/page.tsx`, no mesmo padrão das abas existentes; consome os dois endpoints via `apiFetch`. Tipos em `apps/web/lib/api.ts`.

### 5.5 Progresso ao vivo no chat
- **Backend**: o orquestrador emite um log ao **iniciar** e outro ao **concluir** cada ferramenta, o de conclusão com o id/tipo do artefato (ex.: "✅ Pesquisa #50 criada"). Implementado nas ferramentas (`orchestrator_tools.py`) via o `log` closure já existente; o retorno da ferramenta já tem o id.
- **Frontend**: renderizar `activeTask.logs` como uma trilha de progresso proeminente sob a mensagem pendente do assistente, com links clicáveis para o artefato quando o log tiver um id (ex.: `/research`, `/content`, `/approvals`). Garantir atualização incremental via `streamTask`.

## 6. Fluxo de dados (exemplo)

Chat: "Pesquise o mercado X e escreva um post." →
1. Loga "🔍 Pesquisando: X" → coleta (depth=standard → 12 fontes, 3000 chars) → LLM research (budget 6000) → cria Output #50 → loga "✅ Pesquisa #50 criada — /research".
2. Loga "✍️ Gerando post" → LLM content (budget 4000) → Output #51 + Guardião → loga "✅ Post #51 em revisão (score 88) — /approvals".
3. Resumo final (budget 2000) → mensagem do assistente.
O chat mostra os passos 1-3 ao vivo conforme acontecem.

## 7. Tratamento de erros
- Resolver: valor de Admin malformado/JSON inválido → log + cai para config/fallback (nunca quebra a chamada).
- `PUT agent-settings`: validação de intervalos (ex.: budget 256–32000; sources 1–30; excerpt 500–20000); fora do intervalo → 400 com mensagem clara.
- Coleta mais profunda respeita os timeouts/fallback existentes por fonte (uma fonte que falha não derruba a pesquisa).

## 8. Testes
- **Resolver**: DB-set vence config; sem DB usa config; config ausente usa fallback; valor inválido cai para o próximo nível (sem DB real — usar fake/objetos).
- **Admin endpoints**: PUT persiste e GET reflete; valores fora do intervalo → 400 (padrão dos testes do projeto, sem DB real onde possível; senão fake session).
- **`call_llm` max_tokens**: com LLM/httpx fakeado, asserir que o payload leva o `max_tokens` recebido (e que `None` mantém 1200).
- **depth→limites**: função pura testada para quick/standard/deep e valor desconhecido.
- **Logs de ferramenta**: cada ferramenta emite log de início e de conclusão com o id do artefato (serviços fakeados, capturando o `log`).
- Convenção: testes async com `@pytest.mark.anyio`; cada arquivo define `anyio_backend`.
- Frontend: verificação manual no smoke (trilha de progresso aparece, links funcionam; aba "Limites dos Agentes" salva e relê).

## 9. Arquivos
- Novo: `config/rules/agent_limits.yaml`; resolver (em `apps/api/app/agent_config.py` ou novo `apps/api/app/agent_limits.py`); testes correspondentes.
- Modifica: `apps/api/app/llm.py` (param max_tokens), `orchestrator_llm.py`, `content_generation.py`, `research_service.py`, `calendar_service.py`, `quality_guardian.py` (passar budget), `orchestrator_tools.py` (logs início/fim), `routers/admin.py` (+endpoints), `schemas.py` (+schemas).
- Frontend: `apps/web/app/(app)/admin/config/page.tsx` (+seção), `apps/web/app/(app)/chat/page.tsx` (trilha de progresso), `apps/web/lib/api.ts` (+tipos).
- **Sem migration Alembic.**

## 10. Fora de escopo (YAGNI no SP1)
- Otimização de velocidade real (paralelizar fetches, pular Playwright).
- Streaming token-a-token da resposta final.
- Configuração por marca (limites são globais).
- SP2/SP3/SP4 (base de conhecimento, pesquisa de mercado, refino dos agentes).

## 11. Critérios de sucesso
1. Um relatório de pesquisa "deep" sai com muito mais conteúdo do que hoje (sem corte em ~900 palavras), respeitando o orçamento configurado.
2. Admin consegue alterar o orçamento de um agente e a profundidade de pesquisa pela tela, e o efeito vale na próxima execução (DB vence config).
3. No chat, os passos do orquestrador aparecem ao vivo com links de artefato, eliminando a sensação de silêncio e a ordenação estranha.
4. Sem regressões na suíte; sem migration.
