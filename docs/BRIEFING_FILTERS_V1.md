# Briefing Estruturado e Taxonomia de Filtros — V1

> **Entrega de refinamento (2026-07-05).** Consolida um **padrão único de briefing clicável**
> reutilizado por três telas: **Novo evento do calendário**, **Agente de Pesquisa** e **Agente de
> Cocriação**. Reduz digitação livre ao mínimo, mantém os slugs técnicos das marcas e passa os
> filtros escolhidos ao prompt do LLM de forma **determinística e sanitizada (V4)**.

---

## 1. Onde a taxonomia vive

- **Frontend compartilhado (fonte de verdade da UI):**
  - [`apps/web/lib/briefing/taxonomy.ts`](../apps/web/lib/briefing/taxonomy.ts) — todas as listas de
    opções (`Option[] = {id, label, hint?}`), mapas por marca/segmento, e os catálogos de
    **templates** de evento/pesquisa/cocriação.
  - [`apps/web/lib/briefing/types.ts`](../apps/web/lib/briefing/types.ts) — o tipo
    `StructuredBriefing`, `cleanBriefing()` (remove chaves vazias), `briefingSummaryRows()` (traduz
    ids → rótulos para o resumo) e `computeCompleteness()` (indicador "Pronto para executar").
  - [`apps/web/components/briefing/`](../apps/web/components/briefing) — os primitivos:
    `MultiSelectChips`, `ChoiceChips`, `FilterCardGroup`, `CollapsibleSection`, `FieldGroup`,
    `TextField`, `TextAreaField`, `BriefingSummary`, `BriefingCompleteness`, `TemplatePicker`.
- **Backend (composição do prompt + persistência):**
  - [`apps/api/app/briefing_filters.py`](../apps/api/app/briefing_filters.py) —
    `briefing_filters_to_prompt(dict) -> str` (texto determinístico, sanitizado) e
    `normalize_briefing_filters(dict) -> dict|None` (guarda só chaves conhecidas não vazias).
  - Persistência: coluna **`outputs.briefing_json`** (migração `0026_output_briefing_json`) guarda o
    briefing usado na pesquisa/cocriação. O evento guarda o briefing em
    `calendar_events.execution_payload.briefing` (JSON já existente, sem migração).

**Evoluir é local:** acrescentar uma opção = adicionar um item na lista de `taxonomy.ts`. O backend
ignora chaves desconhecidas e sanitiza valores, então o contrato não quebra ao evoluir a UI.

---

## 2. Campos da taxonomia (chave → uso)

| # | Chave (`StructuredBriefing`) | Tipo | Onde aparece | Obrigatório? |
|---|---|---|---|---|
| 1 | *(marca)* | slug | topo global (`useBrand`) | **sim** (todas as telas) |
| 2 | `segmento` | id único | pesquisa, cocriação, evento | opcional (default por marca) |
| 3/4 | `subsegmentos` | multiselect | pesquisa/evento (condicional ao segmento) | opcional |
| 5 | `personas` | multiselect (+outro) | pesquisa, cocriação, evento | opcional |
| 6 | `decisores` | multiselect (+outro) | pesquisa | opcional |
| 7 | `jornadas` | multiselect | pesquisa | opcional |
| 8 | `objetivos` | multiselect (+outro) | pesquisa | opcional |
| 9 | `tipos_pesquisa` | multiselect | pesquisa/evento | **sim** na pesquisa (≥1) |
| 10 | `escopo_geografico` | id único (+detalhe) | pesquisa | **sim** na pesquisa |
| 11 | `periodo` | id único (+custom) | pesquisa/evento | **sim** na pesquisa |
| 12 | `profundidade` | id único → `depth` | pesquisa/evento | **sim** na pesquisa |
| 13 | `fontes` | multiselect | pesquisa | opcional (tem default) |
| 14 | `entregaveis` | multiselect | pesquisa | opcional (tem default) |
| 15 | `canais` | multiselect | cocriação/evento | **sim** na cocriação (≥1) |
| 16 | `formatos` | multiselect | cocriação/evento | **sim** na cocriação (formato principal) |
| 17 | `pecas` | multiselect (condicional a canais) | cocriação/evento | opcional |
| 18 | `tom` | id único | cocriação/evento | opcional (default por segmento) |
| 19 | `cta` | id único (+custom) | cocriação/evento | opcional |
| 20 | `restricoes` | multiselect | cocriação | opcional (tem default) |
| 21 | `nutricao` | `{canais, opcoes}` | cocriação (template de nutrição) | opcional |
| 22 | `imprensa` | `{entregas}` | cocriação (template de imprensa) | opcional |
| 23 | `publicacao` | `{modo, requisitos}` | evento tipo Publicação | opcional |
| 24 | *(datas)* | data/hora | evento (etapa Datas) | data **sim** |
| 25 | *(dependências)* | `requires_research_approval` | evento (etapa Aprovação) | default: exigir |
| — | `concorrentes`, `contexto`, `observacoes` | **texto livre** | pesquisa/cocriação | opcional |

> **Texto livre sobrou apenas em:** pergunta principal da pesquisa; concorrentes específicos;
> contexto adicional; observações; e o CTA/segmento/persona "outro". Todo o resto é clicável.

### Marcas oficiais (exibição)

Os nomes exibidos são exatamente: **TOTVS Varejo Postos de Combustíveis** (`postos_combustiveis`),
**Gestão DeathCare by Duofy** (`deathcare`), **Duofy Soluções** (`duofy_solucoes`). Os slugs técnicos
não mudaram; só os `name` (seed `config/seeds/brands.yaml` + banco). A UI puxa 100% de `GET /api/brands`.

### Regras de produto embutidas na taxonomia

- **Segmento por marca** (`SEGMENTO_POR_MARCA`) e **tom por segmento** (`TOM_POR_SEGMENTO`) pré-selecionam
  o campo, sem travar a escolha manual: DeathCare → *sensível e respeitoso*; Postos → *objetivo e operacional*.
- **Restrições default** (`RESTRICOES_DEFAULT`): sem logo, sem hashtag na imagem, sem número sem fonte,
  mesmo carrossel IG+LinkedIn, legendas diferentes por canal.
- **Peças condicionais aos canais** (`PIECES_BY_CHANNEL` / `allowedPiecesFor`): selecionar Instagram/LinkedIn
  libera carrossel + legendas + direção visual; WhatsApp libera mensagem + prompt de imagem opcional;
  E-mail/Blog/Release/Pitch/Landing libera a peça correspondente.

---

## 3. Regras por agente (o que cada tela envia)

### Agente de Pesquisa — `POST /api/research/run`
Campo `theme` = **só a pergunta principal** (≤255 chars; não concatena mais objetivo/segmento/persona).
`depth` vem do id de profundidade (`PROFUNDIDADES.find(id).depth` → quick/standard/deep). `period` = id
do período ou texto custom. Novo campo **`briefing_filters`** carrega segmento, subsegmentos, personas,
decisores, jornadas, objetivos, tipos de pesquisa, escopo, entregáveis, concorrentes, contexto,
observações. O backend compõe esse dict num bloco de prompt e grava em `outputs.briefing_json`.

### Agente de Cocriação — `POST /api/cocreation/generate`
`channel` = primeiro canal social selecionado; `format` = formato principal (Carrossel se marcado).
Novos campos: **`channels: string[]`** (multicanal), **`pieces: string[]`** (kinds extras:
`whatsapp`, `whatsapp_image_prompt`, `email`, `blog`, `release`, `pitch`, `landing_page`) e
**`briefing_filters`**. O pacote (`ContentPackage`) ganhou **`extra_pieces: ExtraPiece[]`** (peças fora
do carrossel) que são explodidas em `content_pieces` aprováveis. `captions` cobre os canais sociais
selecionados (mínimo Instagram+LinkedIn, sempre diferentes entre si).

### Evento do calendário — `POST /api/calendar` (+ `execute-research` / `execute-cocreation`)
O wizard grava `execution_payload = {depth, period, channel, format, channels, formats, pieces,
pipeline, briefing}`. `execute-research` repassa `briefing` como `briefing_filters` ao Agente de
Pesquisa (+ depth/period). `execute-cocreation` **sem** `channel/format` na query usa o canal/formato/
canais/peças/briefing do evento; com query params, eles têm precedência. O tipo **"Pesquisa + Conteúdo"**
(`research_content`) é salvo como `event_type=research` + `execution_payload.pipeline=research_content`.

---

## 4. Regras por tipo de evento (wizard)

| Tipo | Etapas do briefing exibidas | Aprovação |
|---|---|---|
| Pesquisa (`research`) | segmento, subsegmentos, tipo de pesquisa, profundidade, período, personas | exige aprovação da pesquisa |
| Pesquisa + Conteúdo (`research_content`) | tudo de pesquisa **+** canais/formatos/tom/CTA/peças | exige aprovação antes da cocriação |
| Conteúdo (`content`) | canais, formatos, tom, CTA, personas, peças | — |
| Publicação (`publication`) | modo de publicação + requisitos | — |
| Tarefa/Reunião/Evento/Entrega | só título, descrição, datas | — |

Etapas fixas do wizard: **1 Tipo → 2 Marca e template → 3 Briefing → 4 Datas e automação →
5 Peças e aprovação (só com agente) → 6 Resumo**. O botão só fica ativo com os obrigatórios mínimos
(tipo, marca, título, data); o `BriefingCompleteness` no rodapé indica o quanto falta.

---

## 5. Economia de modelo em teste (FASE 8)

- Testes automatizados **mockam `call_llm`/`embed_text`** (fixture `patch_ai` + `_patch_llm` local) —
  **custo zero de IA**, nenhuma chamada real à OpenRouter.
- Default barato mantido: `openai/gpt-4o-mini` para os 5 agentes (`config/seeds/agents.yaml`).
- A composição do briefing em prompt é testada **sem LLM** (`test_briefing_filters.py` inspeciona o
  texto do prompt via spy, não gera de verdade).

---

## 6. Limitações restantes

- `briefing_json` guarda o briefing da **pesquisa/cocriação**; o do evento vive em
  `execution_payload.briefing`. Não há uma tabela `briefings` estruturada única (o `briefings`
  existente é o plano do orquestrador — inalterado).
- "Salvar pesquisa como template" (FASE 5.7) ainda não persiste no backend; os templates são os fixos
  em `taxonomy.ts`. Evoluir para `research_themes`/`content_themes` é o próximo passo.
- Datas avançadas da FASE 3.24 (entrega/revisão/aprovação/prazo/recorrência/lembrete) não têm colunas
  próprias — o wizard cobre data, início/fim e automação (manual/auto + `auto_execute_at`).
- Publicação Meta continua **stub honesto** (400 claro; caminho manual funciona).
