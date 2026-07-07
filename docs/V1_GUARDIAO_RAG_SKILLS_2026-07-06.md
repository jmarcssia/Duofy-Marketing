# V1 para teste real — Guardião automático, ajuste, RAG, skills e correções

> Data: 2026-07-06. Passe amplo pelas 10 fases do plano, priorizando o que habilita o teste real da
> gestora nas 3 marcas. **Embeddings semânticos ficaram como roadmap opt-in** (decisão do usuário:
> não instalar torch/reindexar antes do teste, para não destabilizar o stack). Sem Meta, sem custo
> adicional de API por padrão, sem loop autônomo.

## Fase 1 — Guardião automático (feito)
`run_guardian_after_generation` (best-effort, em **sessão própria isolada** — não toca a transação
do request) roda o Guardião **automaticamente após pesquisa e cocriação**, nos pontos de
orquestração (routers de pesquisa/cocriação **e** `calendar_workflow` — cobre página **e**
calendário), e **persiste a avaliação sem aprovar**
(`quality_reviews`: score, status, critical_failures, required_fixes, optional_improvements,
verified_sources, confidence, summary). Uma falha do Guardião nunca derruba a geração. As regras por
marca (Postos/DeathCare/Duofy) já vivem na rubrica determinística + prompt do Guardião.
Arquivos: `app/quality_guardian.py`, `app/research_service.py`, `app/cocreation_service.py`.

## Fase 2/3 — Ajuste com feedback do Guardião (feito, backend + UI mínima)
- `CocreationRefineRequest` ganhou `use_guardian_feedback` + `human_note`; novo alvo `guardian`.
- `refine_content_package` injeta as recomendações da última avaliação + observação humana no prompt,
  cria **nova versão** (histórico preservado via `_persist_version`) e o **Guardião reavalia** a nova
  versão. **Não é loop** — só o humano dispara o próximo ajuste.
- UI: bloco "Solicitar ajuste com o Guardião" no `CocreationPanel` (nota + observação opcional +
  botão), mensagens claras, erro amigável (nunca JSON bruto — já corrigido antes).
Arquivos: `app/schemas.py`, `app/cocreation_service.py`, `apps/web/lib/api.ts`,
`apps/web/app/(app)/operations/CocreationPanel.tsx`.

## Fase 4/5 — Skills testáveis fora do sistema + skills oficiais (feito)
- `config/skills/{research,cocreation,quality_guardian}/` com `skill.md`, `output_schema.yaml`/`rubric.yaml`,
  `examples_good.md`, `examples_bad.md` — contrato de cada skill.
- **`scripts/test_agent_skill.py`**: roda `research`/`cocreation`/`guardian` fora da UI, imprime a saída
  (Markdown/JSON), o feedback do Guardião e o **custo estimado**. Ex.:
  `python -m scripts.test_agent_skill --skill research --brand postos_combustiveis --briefing "Concorrência" --depth quick`
- Prompts oficiais já reforçados na entrega anterior (pesquisa sem concorrentes fictícios; cocriação
  por canal). Ver `config/agents/*.md` e `config/rules/agent_rules.yaml`.

## Fase 6 — RAG semântico local (ROADMAP opt-in, plumbing pronto)
Decisão: **não ativado agora** (evita ~2GB de torch + rebuild + migração 1536→384 + reindex que
apagaria os 277 chunks/8 memórias antes do teste). Entregue e pronto para ligar:
- Config: `EMBEDDINGS_PROVIDER` (`local_sha256` padrão | `local_sentence_transformers` | `openai`),
  `LOCAL_EMBEDDING_MODEL` (default `paraphrase-multilingual-MiniLM-L12-v2`),
  `ALLOW_SHA256_EMBEDDING_FALLBACK` (default true).
- `embed_text` agora despacha por provider, **loga** quando usa o fallback SHA256, e com
  `ALLOW_SHA256_EMBEDDING_FALLBACK=false` **NÃO gera embedding falso** — falha claro (`EmbeddingError`).
- Caminho `local_sentence_transformers` implementado (import lazy) — basta instalar o pacote.
- **`scripts/reindex_embeddings.py`** (dry-run, por marca, progresso, erros) reprocessa
  `document_chunks` + `memory_entries`.
- **Como ativar (roadmap):** `pip install sentence-transformers` no ambiente da API; escolher um
  modelo de 384 dims; ajustar a coluna `Vector(1536)→Vector(384)` (migração) OU manter 1536 com um
  modelo 1536; definir `EMBEDDINGS_PROVIDER=local_sentence_transformers` e
  `ALLOW_SHA256_EMBEDDING_FALLBACK=false`; rodar `python -m scripts.reindex_embeddings`.
Modelo recomendado e motivo: **`paraphrase-multilingual-MiniLM-L12-v2`** (bom em português, leve,
roda em CPU). Dimensão: **384** (exige migração/nova coluna). Enquanto isso, o RAG segue com o
matcher local — melhorado na Fase 8.

## Fase 7 — Upload Markdown/YAML + base de conhecimento (feito)
- Upload aceita agora `.md`, `.markdown`, `.yaml`, `.yml` (além de PDF/DOCX/TXT). Markdown/YAML são as
  fontes preferenciais de regras/tom/personas/playbooks.
- Estrutura `knowledge/` criada (institucional, brands/<marca>, channels, playbooks) com README que
  documenta a convenção e como subir. Preencher com o conhecimento real.
Arquivos: `app/document_processing.py`, `app/routers/documents.py`, `knowledge/**`.

## Fase 8 — Qualidade de recuperação RAG (feito)
`build_rag_context` agora: `top_k` configurável (`RAG_TOP_K`), **piso de score** (`RAG_MIN_SCORE`),
**dedup por conteúdo**, **teto de tamanho** (`RAG_MAX_CONTEXT_CHARS`) e **log** dos trechos usados
(título/marca/score). Objetivo: poucos trechos relevantes com origem, não um bloco enorme inútil.
Filtro por marca + institucional já existia. Padrões conservadores para não mudar o comportamento
atual (min_score=0 por padrão; recomenda-se ~0.3 quando os embeddings forem semânticos).

## Fase 9 — Estabilidade (feito nesta e nas entregas anteriores)
- **Pacote vazio rejeitado**: `generate_content_package` recusa `{}` (evita o gate travar com zero peças).
- Enum PT-BR (rápida→quick) e erro amigável (nunca JSON bruto): entregas anteriores.
- Log de fallback de embedding (antes silencioso).
- Débitos maiores (divergência peça/pacote total, evento preso em running) seguem como roadmap.

## Fase 10 — Testes
Novo `tests/test_guardian_rag_fixes.py` (8 testes): Guardião roda após cocriação; pacote vazio 400;
refino com feedback do Guardião cria nova versão; upload MD e YAML geram chunks; RAG aplica piso de
score + dedup; embedding no-silent-fallback (raise) e fallback permitido (vetor). Somados aos testes
das entregas anteriores.

### Resultados (executados 2026-07-06)
| Comando | Resultado |
|---|---|
| `ruff check app alembic scripts` | ✅ All checks passed |
| `pytest -q` | ✅ **334 passed, 2 skipped** (5m26) |
| `next lint` / `tsc --noEmit` / `next build` | ✅ limpos (24 rotas) |
| `docker compose config` | ✅ 6 serviços |

**Verificação ao vivo (1 cocriação real gpt-4o-mini, ~US$ 0,0036):** cocriação DeathCare (output #80)
gerou automaticamente a review do Guardião — **score 75, status blocked, passed=false**, persistida
**sem aprovar** (output segue `draft`). Os `model_calls` mostram `content_agent(cocreation)` seguido
de `quality_guardian(quality_review)`, provando o disparo automático.

> Nota de arquitetura: o Guardião automático roda em **sessão própria isolada** (não na transação do
> request) — best-effort, nunca derruba a geração nem expira objetos do request. A review é cacheada
> por versão, então a aprovação posterior reaproveita a avaliação (sem chamada extra).

## Como as coisas funcionam agora (resumo operacional)
- **Guardião automático:** ao concluir pesquisa/cocriação, a avaliação é criada e fica visível; a
  aprovação de uso público continua **humana**.
- **Ajuste:** na Cocriação, "Solicitar ajuste com o Guardião" (+ observação opcional) → nova versão →
  Guardião reavalia. Histórico preservado.
- **Testar skill fora da UI:** `python -m scripts.test_agent_skill ...` (IA real barata).
- **Upload de conhecimento:** Memória → Documentos, `.md`/`.yaml` por marca; entra no RAG.
- **Reindexar (quando ligar embeddings semânticos):** `python -m scripts.reindex_embeddings`.

## Riscos restantes / roadmap
- **Embeddings semânticos** ainda não ativos (opt-in; passos acima). Até lá, RAG é matcher local
  melhorado (piso/dedup/log).
- Ajuste com feedback do Guardião cobre **cocriação**; para **pesquisa**, o feedback é persistido e
  visível, mas o re-versionamento do relatório continua sendo re-execução (roadmap: versão de pesquisa).
- Divergência peça↔pacote no refino: mitigada no export; sincronização total é roadmap.
- Guardião automático adiciona 1 chamada (gpt-4o-mini) por geração — mesma ordem de custo de antes
  (a review era feita na aprovação; agora é antecipada e cacheada por versão).
