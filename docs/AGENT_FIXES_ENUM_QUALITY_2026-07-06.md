# Correções dos Agentes de Pesquisa e Cocriação — 2026-07-06

> Foco: eliminar o erro de execução `Input should be 'quick' or 'deep'`, impedir que a UI exiba
> JSON técnico bruto, garantir a cocriação a partir de pesquisa aprovada, e melhorar a qualidade
> das saídas (pesquisa sem concorrentes fictícios; cocriação por canal). Sem Meta real, sem
> refatoração de arquitetura, sem modelo premium.

## Causa raiz do erro

A UI da Cocriação (`CocreationPanel.tsx`) tinha um seletor de profundidade próprio (`DEPTHS`
com ids `rapida`/`profunda`) e enviava esse **id/rótulo cru** no campo `depth` do
`CreationRequest`, cujo schema é `Literal["quick","deep"]`. O Pydantic rejeitava com o erro
`Input should be 'quick' or 'deep', input: "rápida"`, que era repassado **cru** para a tela
(o `catch` mostrava `e.message`, que é o corpo JSON do backend). A página de Pesquisa já mapeava
certo (`PROFUNDIDADES.find(...).depth`); o wizard do Calendário também. O furo estava só na Cocriação.

## Correções feitas

### 1. Normalização única UI→API (frontend)
Novo módulo `apps/web/lib/briefing/normalize.ts` (exportado em `lib/briefing/index.ts`):
`normalizeDepth`, `normalizeCocreationDepth` (colapsa "Padrão"→deep), `normalizeChannel(s)`,
`normalizePiece(s)`, `normalizeFormat`, `normalizePurpose`, `normalizeBrand`. Mapeia rótulos/ids
pt-BR → enums canônicos. **Usado nas 3 telas** (Pesquisa, Cocriação, wizard do Calendário) — cada
tela deixou de fazer o próprio mapeamento:
- `CocreationPanel.tsx`: `depth: normalizeCocreationDepth(depth)`, `channels: normalizeChannels(...)`,
  `pieces: normalizePieces(...)`.
- `research/page.tsx`: `depth: normalizeDepth(profundidade)`.
- `calendar/page.tsx`: `executionPayload.depth/channels/pieces` normalizados.

### 2. Coerção no backend (rede de segurança)
Novo `apps/api/app/enum_normalize.py::normalize_depth` + `field_validator("depth", mode="before")`
em `ResearchRunRequest` e `CreationRequest` (`schemas.py`). Aceita "Rápida"/"rapida"/"Padrão"/
"Profunda"/"Consultiva"/etc. e coage para o enum canônico; valor desconhecido cai em default
seguro. **Resultado: o erro bruto de enum não pode mais ocorrer**, mesmo se algum cliente enviar
um rótulo. Cocriação (só quick|deep) colapsa "Padrão"→deep.

### 3. UX de erro amigável (frontend)
Novo `apps/web/lib/friendly-error.ts::friendlyError`: nunca exibe JSON bruto. Erro de validação
Pydantic (lista) vira "Não foi possível gerar o conteúdo. Revise os filtros selecionados e tente
novamente. Verifique: <campo>." Detalhe da string do backend (mensagens pt-BR de gate) é exibido
como está. **Detalhe técnico completo vai só para o console em desenvolvimento.** Aplicado nos
catches de geração em Cocriação, Pesquisa e Conteúdo; log do payload em dev antes do POST.

### 4. Cocriação a partir de pesquisa aprovada
`routers/cocreation.py::generate` passou a validar `research_output_id`: **404** se não existir ou
for de **outra marca**; **400** se não for relatório de pesquisa; **400** se **não estiver
aprovada**. `cocreation_service._research_context` agora injeta o **briefing estruturado da
pesquisa** (`briefing_json`) + o relatório; se o briefing for insuficiente, usa o conteúdo do
output (fallback). Os 3 modos de cocriação seguem funcionando: **briefing manual**, **pesquisa
aprovada** e **evento do calendário** (o calendário já gateia a aprovação antes de cocriar).

### 5. Prompt do Agente de Pesquisa (`config/agents/research_agent.md` + `config/rules/agent_rules.yaml`)
- **Proibido concorrente fictício/placeholder** (Empresa A/B/C, Player 1/2, Concorrente X/Y,
  "principais players" sem nome) — adicionados também à lista `forbidden` (injetada no prompt).
- Concorrente citado exige nome real, fonte/URL, proposta, diferencial, público, evidência e
  limitação. Sem concorrente real → **declarar a lacuna, não inventar**.
- Macroindicadores econômicos só como **contexto**, nunca dominando pesquisa de concorrência/mercado.
- **Cada entregável selecionado vira seção obrigatória**; toda pesquisa termina com Recomendações
  estratégicas + Ideias de conteúdo + Briefing para cocriação. Respeitar todo o briefing.
- **Recorte por marca** (evita genérico): Duofy = marketing assistido por IA / marketing
  intelligence / automação de conteúdo / IA para marketing B2B / verticais (Postos, DeathCare).

### 6. Prompt do Agente de Cocriação (`config/agents/content_agent.md`)
Seção "Saída por canal e peça (OBRIGATÓRIO)": Instagram+Carrossel (slides+legenda+CTA+prompt
visual, sem imagem final); LinkedIn reaproveita o carrossel com **legenda diferente**, tom
executivo; WhatsApp (mensagem curta + alternativa + prompt de imagem se marcado); E-mail (assunto+
preheader+corpo+CTA); Blog (artigo completo + SEO + meta description); Release (pauta+ângulo+
release+pitch+mensagens-chave). Toda peça selecionada deve ser gerada; se não puder, **aviso
claro**, não falha silenciosa. Restrições reforçadas (sem logo/@/# na imagem, sem número sem
fonte, sem case inventado, adaptar por marca/tom).

### 7. Calendário
Os mesmos fixes valem pelo Calendário: o wizard normaliza depth/channels/pieces no
`execution_payload`; o backend coage o depth; o gate de pesquisa→cocriação e o "evento de conteúdo
sem pesquisa não trava" (já corrigido antes) seguem válidos; erros de execução aparecem amigáveis
no painel do evento (tratamento de 4xx rápido já existente).

## Arquivos alterados
**Backend:** `app/enum_normalize.py` (novo), `app/schemas.py`, `app/routers/cocreation.py`,
`app/cocreation_service.py`, `config/agents/research_agent.md`, `config/agents/content_agent.md`,
`config/rules/agent_rules.yaml`, `tests/test_agent_enum_fixes.py` (novo).
**Frontend:** `lib/briefing/normalize.ts` (novo), `lib/briefing/index.ts`, `lib/friendly-error.ts`
(novo), `app/(app)/operations/CocreationPanel.tsx`, `app/(app)/research/page.tsx`,
`app/(app)/content/page.tsx`, `app/(app)/calendar/page.tsx`.

## Testes e resultados (executados 2026-07-06)

Novo `tests/test_agent_enum_fixes.py` (7 testes): coerção de depth (research + cocriação, rótulos
pt-BR e valor inválido), cocriação a partir de pesquisa (cross-brand 404, não aprovada 400,
aprovada 200) e wiring dos termos proibidos.

| Comando | Resultado |
|---|---|
| `ruff check app alembic` | ✅ All checks passed |
| `pytest -q` (suíte completa) | ✅ **326 passed, 2 skipped** (7m07) — antes 319 + 7 novos |
| `next lint` | ✅ sem erros |
| `npx tsc --noEmit` | ✅ sem erros |
| `next build` | ✅ 24 rotas |

**Verificação ao vivo (API dev, sem gastar IA):** `POST /api/cocreation/generate` com
`depth:"Profunda"` e `depth:"rápida"` (acentuado) **não gera mais** `Input should be 'quick' or
'deep'` — passa a coerção e cai na checagem de pesquisa (404 "Pesquisa não encontrada para esta
marca", mensagem limpa em pt-BR, sem JSON bruto). Cocriação de pesquisa de outra marca bloqueada.

## Riscos restantes / a refinar depois da apresentação
- As melhorias de prompt orientam o LLM mas **não garantem** determinismo — com `gpt-4o-mini` a
  qualidade pode variar; concorrentes reais dependem do que a coleta web encontra (pode declarar
  lacuna corretamente em vez de inventar).
- A divergência peça↔pacote (refino) segue mitigada só no export; sincronização total é roadmap.
- Normalização de canais é lowercase canônico; o canal **primário** (`Output.channel`) segue
  exibido com o rótulo para não alterar a apresentação.
- "standard" continua não sendo um tier real de pesquisa (vira quick com mais fontes) — fora do
  escopo desta correção.
