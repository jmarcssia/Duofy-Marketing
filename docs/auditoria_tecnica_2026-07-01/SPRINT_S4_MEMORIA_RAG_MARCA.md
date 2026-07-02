# Sprint Núcleo de Agentes — S4: Memória/RAG, Embeddings e Isolamento por Marca (concluído)

**Objetivo:** garantir isolamento por marca na recuperação (sem vazamento cross-brand nos contextos de geração) e tornar os embeddings resilientes.

## Mudanças
- **`embeddings.py`** — `embed_text` agora é **resiliente**: se o provedor falhar/der timeout, degrada para o embedding local (com aviso em log) em vez de propagar 500 e derrubar o fluxo de RAG. Também avisa quando a dimensão retornada pelo provedor difere de 1536 (antes o ajuste era silencioso).

## Confirmado (já correto no código)
- **`rag.search_memory`** filtra `document_chunks` e `memory_entries` por `brand_slug` (linhas 42-45) — o contexto RAG é escopado por marca. `build_rag_context` propaga a marca a partir dos serviços. Persistência 100% no PostgreSQL (pgvector 1536, índices HNSW da migration 0015).

## Testes
- `test_rag_search_is_brand_isolated` — memórias de `duofy` e `postos` no banco; busca com `brand_slug=duofy` retorna **apenas** duofy (nada de postos).
- `test_embed_text_falls_back_on_provider_error` — com o cliente HTTP forçado a falhar, `embed_text` retorna vetor local de 1536 dims em vez de erro.

## Estado
```
89 passed, 2 skipped   ·   ruff check app → All checks passed!
```

## Fora de escopo desta etapa (registrado)
- **IDOR em download/export de documento** (doc 03, A-2): as rotas por `id` não checam propriedade/marca. É um item de **segurança** (não de isolamento de RAG) e permanece para uma passada de AppSec dedicada — em contexto single-tenant o impacto é "toda a equipe vê tudo".
