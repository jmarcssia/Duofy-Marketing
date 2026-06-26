# Prompt Codex — Fase 5: Memória, Documentos e RAG

Implemente upload, extração, chunking, embeddings, pgvector e busca contextual.

## Objetivo

Permitir que documentos oficiais da Duofy/TOTVS sejam carregados, indexados e usados como memória dos agentes.

## Requisitos

1. Criar migrations/modelos:
   - `documents`
   - `document_chunks`
   - `memory_entries`
   - `sources`
2. Implementar upload para:
   - PDF;
   - DOCX;
   - TXT;
   - MD;
   - CSV opcional.
3. Implementar extração de texto.
4. Implementar normalização.
5. Implementar chunking.
6. Implementar embeddings.
7. Salvar embeddings no pgvector.
8. Criar busca RAG filtrada por:
   - marca;
   - nicho;
   - categoria;
   - source_type;
   - relevância.
9. Criar tela Memória/Documentos.
10. Criar endpoint de busca:
   - `GET /api/memory`
   - `POST /api/memory/search`
   - `POST /api/documents/upload`

## Critérios de pronto

- Upload funciona.
- Documento fica com status indexado.
- Chunks são criados.
- Busca retorna contexto relevante.
- Interface lista documentos e memórias.

## Responda no final

- Arquivos criados/alterados.
- Como indexar documento.
- Como testar RAG.
- Checks executados.
- Pendências.
