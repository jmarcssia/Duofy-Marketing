# Publicações e Canais — V1 + Preparação para a Meta

> **FASE 9.** Área de Publicações real (canais, fila, upload de mídia, montagem, agendamento,
> publicação manual) + **arquitetura pronta** para a integração futura com a **Meta Graph API/OAuth**.
> Princípio: **stub honesto** — o sistema nunca finge uma publicação na Meta.

---

## 1. O que foi entregue (real, não-mock)

**Backend** (`routers/publications.py`, `models.py`, migração `0025_publications`):
- Tabelas novas: `publication_channels` e `publications` (nenhuma alteração no workflow existente).
- Endpoints (`/api/publications`), todos com isolamento por marca (C1) e auditoria:
  - `GET/POST /channels` — listar / adicionar canal (entra como `pending`; conexão real é fase futura).
  - `GET/POST ""` — listar fila / criar publicação (opcionalmente a partir de um Output aprovado).
  - `PATCH /{id}` · `DELETE /{id}` — editar rascunho / remover (bloqueado se já publicada).
  - `POST /media` — upload de mídia (imagem/vídeo, ≤25MB, extensões permitidas) → `storage/media/`.
  - `POST /{id}/publish?target=manual|meta` — **manual** registra publicação externa; **meta** retorna
    **400 claro** (stub honesto) e nunca marca como publicada.

**Frontend** (`/publicacoes`): canais + estado; compositor (conteúdo aprovado, canal, tipo Feed/Stories/
Reels, mídia, legenda, 1º comentário, hashtags, agendamento); prévia; fila (Rascunhos/Agendadas/
Publicadas/Erros) com publicar-manual / editar / remover; banner "Integração Meta pendente".

**Testes** (`tests/test_publications.py`, 6): canal fica `pending`; criar+listar; publicar manual registra
(`published`/`publish_ref=manual`/`published_at`); **Meta não finge sucesso** (400 + não-publicada);
bloqueio cross-brand (C1).

## 2. Modelo de dados

**`publication_channels`** — `id, brand_slug, platform (instagram|facebook|meta), display_name,
external_id, status (pending|connected|expired|error), last_error, created_by, timestamps`.

**`publications`** — `id, brand_slug, channel_id→channels, output_id→outputs (conteúdo aprovado de
origem), title, caption, first_comment, hashtags, media_paths (JSON), post_type (feed|stories|reels),
status (draft|scheduled|published|error), mode (manual|meta), scheduled_at, published_at, publish_ref,
last_error, created_by, timestamps`.

Decisão de modelagem: **router próprio** em vez de sobrecarregar `calendar_events`. A publicação
consome conteúdo aprovado via `output_id` (peças aprovadas continuam no fluxo de `content_pieces`),
mantendo o Calendário como orquestrador e Publicações como a camada de entrega.

## 3. Contrato de integração Meta (fase futura)

O único ponto que precisa mudar para publicar de verdade:

1. **OAuth/token de página**: fluxo OAuth da Meta → guardar o token de página **cifrado** (reusar
   `crypto.encrypt_secret`, como `provider_credentials`) associado ao `PublicationChannel`; `status`
   passa a `connected` (ou `expired`/`error`).
2. **Publicação real**: em `POST /{id}/publish?target=meta`, trocar o 400-stub por uma chamada à
   **Graph API** (`/{ig-user-id}/media` + `/media_publish` para IG; `/{page-id}/photos|videos|feed`
   para FB), respeitando `post_type` (Feed/Stories/Reels) e `media_paths` (subir a mídia ou fornecer URL
   pública). Escopos: `pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`.
3. **Persistência do resultado**: `status=published`, `published_at`, `publish_ref=<id externo do post>`;
   em falha, `status=error` + `last_error` (nunca marcar publicado sem confirmação).
4. **Agendamento automático**: um worker/scheduler (análogo a `calendar_scheduler.py`, com lock Redis
   idempotente) pega `status=scheduled` com `scheduled_at<=now` e publica; hoje o agendamento é
   registrado, mas a execução automática só liga com a Meta real.
5. **Rate limit/erros**: tratar throttling da Meta (retry/backoff) e refresh de token expirado.

Nada disso exige tocar no restante do workflow — a arquitetura já isola a Meta no endpoint de publish e
no `PublicationChannel`.

## 4. Limitações honestas (V1)

- **Meta**: stub (400 claro). Sem OAuth, sem Graph API, sem publicação/agendamento automático.
- **Preview de mídia**: a fila/compositor mostram nome e contagem das mídias; não há endpoint de
  serviço de mídia, então a imagem em si não é renderizada de volta (evita fingir).
- **`media_paths`** guarda caminhos em `storage/media/` (dev). Em produção, migrar para storage
  persistente/S3 e servir via URL pública (necessário para a Graph API por URL).
