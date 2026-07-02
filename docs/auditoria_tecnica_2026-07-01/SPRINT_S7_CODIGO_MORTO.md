# Sprint Núcleo de Agentes — S7: Remoção de Código Morto (concluído)

**Objetivo:** remover o código morto identificado na auditoria — **por último**, com a suíte de testes já cobrindo os fluxos críticos.

## Removido (~2.900 linhas)
### Frontend (~2.850 linhas)
- `lib/mock.ts` (489 linhas, zero importadores).
- Cluster de componentes órfãos do redesign anterior (nenhum importador vivo):
  `chat-panel.tsx`, `kanban-board.tsx`, `card-popup.tsx`, `inspector-bar.tsx`,
  `logout-button.tsx`, `document-workspace.tsx`.
- O tipo `ExportFormat` (única dependência viva de `document-workspace`) foi movido para `lib/download.ts`.

### Backend
- `app/pdf_service.py` (wrapper órfão sobre `export_service.build_duofy_pdf`).
- `routers/outputs.py`: removidas as **3 funções redefinidas/sombreadas** (`_version_read`, `_output_read`, `_output_export_document`) — as primeiras definições eram mortas em runtime (sobrescritas pelas versões com `repair_text`). Remoção sem mudança de comportamento.

## Correção de bug
- **Classe Tailwind `surface`** (usada 17× mas inexistente → silenciosamente ignorada): adicionada em `tailwind.config.ts` (`surface: "#f4f4f8"`), fazendo os hovers/backgrounds pretendidos aparecerem.

## Verificação
```
Backend:  89 passed, 2 skipped   ·   ruff check app → All checks passed!
Frontend: next lint → ✔ clean    ·   next build → sucesso (todas as rotas compilam)
```
`/redes` agora é um stub de redirect (163 B). Nenhum import quebrado.

## Critérios de aceite (S7) — atendidos
- [x] Código morto removido (mock.ts + 6 componentes + pdf_service + funções sombreadas).
- [x] Bug da classe `surface` corrigido.
- [x] `build` + `lint` + `pytest` verdes; app inalterado.
