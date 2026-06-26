# Design — Orquestrador Multiagente (loop agêntico com LangGraph)

Data: 2026-06-26
Status: aprovado para virar plano de implementação

## 1. Problema

O Chat hoje tem orquestração fraca em dois níveis:

1. `task_service.classify_task()` decide o tipo da tarefa por **match de palavra-chave** (substring em texto normalizado). É frágil — "post sobre o **mercado**" cai em pesquisa, não conteúdo.
2. `task_service.execute_agent_task()` tem um `if/elif` por tipo e chama cada serviço com **parâmetros chumbados** (conteúdo sempre `LinkedIn / Post`, pesquisa sempre `últimos 30 dias / quick`), ignorando o que o usuário pediu.
3. O "orquestrador" (`orchestrator.run_agent("orchestrator")`) é apenas **uma chamada LLM única com RAG** — não planeja, não chama outros agentes, não coordena.

O que já funciona e deve ser preservado: cada agente roda isolado pelas páginas (`/content`, `/research`, `/calendar`, etc.), chamando os serviços diretamente.

## 2. Objetivo

Transformar o Chat em um **orquestrador agêntico real**: um LLM que entende a intenção, extrai os parâmetros corretos e chama os agentes certos (em sequência quando necessário) como ferramentas, em loop, até concluir — criando rascunhos e enviando-os ao Guardião de Qualidade. Cada agente continua acionável isoladamente pelas páginas.

## 3. Decisões tomadas (brainstorming)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Nível de orquestração | **Loop agêntico com tool-calling** |
| 2 | Cerca do loop | **Teto baixo: ~5 passos**; ao atingir, encerra com resumo do que tem |
| 3 | Autonomia | **Criar rascunhos E rodar o Guardião** (status `review`); aprovação final sempre humana |
| 4 | Ferramentas | Todas as 4 (research, content, press, calendar) conforme a solicitação exigir, + busca em memória (RAG, leitura) |
| 5 | Motor | **LangGraph**, desenhado para escalar ("aposta no futuro": estado tipado, grafo extensível, persistência/checkpointing desde já) |
| 6 | Tool-calling | **Nativo** via OpenRouter/Claude (não JSON pseudo-tool) |

## 4. Princípio de arquitetura: um cérebro, ferramentas reutilizadas

- **Chat** = orquestrador (decide e encadeia). Passa a ser o único cérebro do chat.
- **Páginas** = chamam os serviços diretamente, isoladamente. **Não mudam.**
- As "ferramentas" do orquestrador são exatamente os mesmos serviços que as páginas usam (`run_market_research`, `generate_content_output`, `generate_press_output`, `generate_calendar_events`). Zero duplicação.

### O que sai e o que entra

| Hoje | Vira |
|------|------|
| `classify_task()` por palavra-chave | Removido |
| `execute_agent_task` com `if/elif` e params chumbados | Roteia tudo para o grafo |
| `run_agent("orchestrator")` = 1 chamada LLM | Mantido apenas para `/api/agents/run` (execução direta de 1 agente); o grafo é o novo cérebro do chat |

## 5. O grafo (LangGraph)

Padrão ReAct (raciocina → age → observa), montado explicitamente para ser extensível.

```
START → [agent] → (tem tool_calls e step_count < 5?)
                     ├─ sim → [tools] → volta para [agent]
                     └─ não → [resumo_final] → END
```

- **Nó `agent`**: chama o LLM com as ferramentas vinculadas; decide o próximo passo.
- **Nó `tools`**: executa a(s) ferramenta(s) pedida(s); incrementa `step_count`; devolve `ToolMessage`(s) ao estado.
- **Aresta condicional**: enquanto houver `tool_calls` e `step_count < 5`, faz o ciclo; senão vai para `resumo_final`.
- **Nó `resumo_final`**: uma chamada ao LLM **sem ferramentas** que produz a resposta conversacional final (garante resposta coerente mesmo no teto).

### Estado tipado

```python
class OrchestratorState(TypedDict):
    messages: Annotated[list, add_messages]   # histórico do loop
    brand_slug: str                            # marca da sessão de chat (NÃO vem do LLM)
    task_id: int                               # para logar no SSE
    step_count: int                            # cerca dos 5 passos
    created: list[dict]                        # rastro: [{type, id, status, score}]
```

O estado é o que torna o sistema extensível: adicionar um nó futuro (revisor, planejador, ramo paralelo, interrupção humana) é plugar no grafo sem reescrever.

## 6. Ferramentas

Construídas por-execução, com *closure* sobre `(db, brand_slug, task_id, log_fn)`. A marca vem do contexto da sessão — o LLM não a fornece (evita alucinação).

| Ferramenta | Parâmetros (LLM fornece) | Mapeia para | Efeito |
|---|---|---|---|
| `research_market` | `theme`, `period?`, `depth?` | `run_market_research` | Cria output de pesquisa (`channel="Pesquisa"`) + fontes |
| `create_content` | `channel`, `format`, `briefing`, `category?` | `generate_content_output` → submit-review | Rascunho + **Guardião** (status `review`) |
| `create_press` | `format`, `briefing`, `category?`, `event?` | `generate_press_output` → submit-review | Rascunho + **Guardião** (status `review`) |
| `create_calendar` | `objective`, `period_days?`, `channels?`, `category?` | `generate_calendar_events` | Cria eventos de calendário |
| `search_memory` | `query` | `build_rag_context` | Leitura (RAG) para contextualização; não cria nada |

Cada executor retorna ao LLM um resumo curto + IDs criados (para encadeamento e para a resposta final). `create_content`/`create_press` chamam o fluxo de submit-review existente (Guardião) após criar o rascunho.

## 7. LLM + rastreio de custo

- `ChatOpenAI` (langchain-openai) configurado a partir da `ProviderCredential` habilitada: chave **descriptografada do banco**, `base_url` do OpenRouter, modelo do agente `orchestrator`. `.bind_tools(tools)` para tool-calling nativo.
- Um callback handler captura tokens de entrada/saída e latência de cada chamada LLM e grava em `model_calls` (reutiliza o caminho de métricas atual). O tracking de custo permanece intacto.

## 8. Persistência (a aposta no futuro)

- Checkpointer Postgres do LangGraph, `thread_id` = id da sessão de chat. Habilita: retomar fluxos interrompidos, inspecionar estado e, no futuro, interrupção humana no meio do loop.

### Ponto de decisão em aberto (resolver na implementação)

O checkpointer Postgres do LangGraph usa `psycopg` (sync), enquanto o banco da app usa `asyncpg`. São conexões separadas, e o checkpointer **gerencia as próprias tabelas** (fora do Alembic, via `.setup()`).

- **Plano A (preferido)**: ligar o `AsyncPostgresSaver` com uma conexão dedicada derivada de `DATABASE_URL`, rodando `.setup()` no startup.
- **Plano B (fallback)**: se a integração `psycopg`/`asyncpg` pesar no V1, começar com checkpointer em memória deixando a interface pronta, e ligar o Postgres em seguida.

A escolha não muda a forma do grafo nem das ferramentas — só a camada de persistência.

## 9. Integração no fluxo do chat

- `chat.py`: a mensagem do usuário cria `AgentTask` e enfileira no Celery (como hoje).
- `task_service.execute_agent_task`: deixa de classificar/ramificar por palavra-chave; **invoca o grafo** (`.ainvoke()`), passando `brand_slug`, `task_id` e a mensagem. O resultado final (resposta do nó `resumo_final`) vira a `ChatMessage` do assistente.
- O worker Celery (`--pool=solo`) roda o grafo async dentro do seu event loop (padrão já usado por `execute_agent_task`).

## 10. Observabilidade

- Cada execução de ferramenta no nó `tools` chama `add_task_log("🔍 Pesquisando mercado…")` (com metadata: ferramenta, output_id) → o Chat já transmite via SSE em `/api/tasks/{id}/stream`.
- A mensagem final do assistente resume o que foi criado, com IDs/links para `/approvals`, `/content`, `/calendar`.

## 11. Tratamento de erros

- Falha de ferramenta → capturada e devolvida como `ToolMessage` de erro; o LLM decide adaptar (tentar outra, pular, concluir). O grafo não quebra.
- Provedor/credencial ausente → mensagem clara ao usuário (reutiliza `LLMConfigurationError`).
- Teto de passos atingido → `resumo_final` força resposta coerente com o que já foi feito.
- Falha do Guardião → o rascunho permanece criado; o erro é logado; o loop segue.

## 12. Estratégia de testes

- **Grafo**: testado com um **chat model falso** (stub) que devolve `tool_calls` roteirizados. Asserções: roteamento correto, parâmetros repassados, rascunhos criados, Guardião acionado, teto de 5 passos respeitado, caminho de erro anexa `ToolMessage` e continua. Determinístico, sem gastar token.
- **Ferramentas**: testadas contra sessão de teste, no padrão dos testes atuais (`test_quality_guardian.py` etc.), verificando criação de output e submit-review.
- Testes existentes (`ruff`, `pytest`, `lint`, `build`) permanecem verdes.

## 13. Escopo e arquivos

**Dependências novas** (`apps/api/requirements.txt`):
- `langgraph`
- `langchain-core`
- `langchain-openai`
- `langgraph-checkpoint-postgres` (se Plano A da persistência)

**Arquivos novos**:
- `apps/api/app/orchestrator_graph.py` — estado, nós, arestas, montagem do grafo.
- `apps/api/app/orchestrator_tools.py` — catálogo de ferramentas + executores.
- `apps/api/app/orchestrator_llm.py` — fábrica do `ChatOpenAI` a partir da credencial + callback de custo.

**Arquivos modificados**:
- `apps/api/app/task_service.py` — chat → grafo; remove `classify_task` e o `if/elif`.
- `apps/api/app/orchestrator.py` — mantém `run_agent` para `/api/agents/run` (execução direta de 1 agente).

**Reescrito**:
- `config/agents/orchestrator.md` — prompt do cérebro: quando usar cada ferramenta, criar rascunho + Guardião, responder em PT-BR com resumo e links, consciência do orçamento de passos.

**Sem migration Alembic** — o checkpointer gerencia as próprias tabelas.

## 14. Fora de escopo (YAGNI)

- `metrics_agent` como ferramenta do loop (é página de relatório, não cadeia criativa).
- Teto de passos configurável no Admin (fica em 5 fixo no V1).
- Execução paralela de ferramentas (loop sequencial; mais simples e barato).
- Aprovação automática (proibido: aprovação é sempre humana).
- Interrupção humana no meio do loop (a fundação de persistência fica pronta, mas a UI de resume não entra no V1).
- Publicação externa, geração de imagens (já fora do escopo do produto).

## 15. Critérios de sucesso

1. "Pesquise o mercado de X e escreva um post de LinkedIn sobre isso" no Chat → o orquestrador chama `research_market` e depois `create_content` (LinkedIn/Post), cria os dois outputs, envia o post ao Guardião e responde com resumo + IDs.
2. Pedido simples ("escreva um carrossel sobre Y") → uma única ferramenta (`create_content`) com os parâmetros corretos extraídos do pedido.
3. Pedido conversacional ("oi", "o que você faz?") → resposta direta, sem chamar ferramenta.
4. As páginas `/content`, `/research`, etc. continuam funcionando isoladamente, sem regressão.
5. Custo de cada chamada LLM do loop registrado em `model_calls`.
6. Teto de 5 passos respeitado; resposta sempre coerente.
