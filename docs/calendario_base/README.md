# Base do Calendário — normalização do xlsx (para upload)

Base normalizada e **revisável** extraída de `Calendário de Eventos e Conteúdo Redes Sociais (2).xlsx`,
pronta para o upload completo no sistema. Arquivo de dados: [`calendario_base.json`](calendario_base.json).

> **Revise esta base antes do import.** Ela é o insumo do upload; ajustes de mapeamento aqui
> evitam corrigir registros já dentro do banco.

## Conteúdo da base

| Coleção | Registros | Origem |
|---|---:|---|
| `events` | **208** | abas `1º tri 2026` (95), `2º tri 2026` (91), `2025` (13), `EDITORIAL JULHO` (9) |
| `themes` | **142** | aba `BANCO DE TEMAS` |
| `roteiros` | **32** | aba `ROTEIROS` |

### Eventos — distribuição
- **Marca:** duofy_solucoes 122 · deathcare 55 · postos_combustiveis 31
- **Status:** completed 133 · planned 58 · in_progress 11 · scheduled 5 · cancelled 1
- **Formato:** Vídeo 86 · (sem formato) 47 · Post 21 · Carrossel 19 · Card 13 · Motion 7 · Story 6 · Foto 6 · Artigo 2 · Infográfico 1
- **Sem data confiável:** 8 (marcados com `date_missing: true`)

## Regras de mapeamento aplicadas

- **Marca principal:** a conta do **FEED** na coluna PERFIL vence (ex.: `GESTAO DEATHCARE (FEED) + DUOFY (STORY)` → `deathcare`); senão, o PRODUTO; senão `duofy_solucoes`. As demais marcas citadas vão em `execution_payload.marcas_adicionais` (decisão: **um evento por linha, marca principal**).
  - POSTO → `postos_combustiveis` · DEATH → `deathcare` · DUOFY/TOTVS → `duofy_solucoes` · "3 REDES"/"TODOS" → as três (principal duofy).
- **Datas do 1º tri 2026:** o xlsx trazia o ano corrompido (1900); reconstruído para **2026** (validado: 05/01/2026 = segunda, bate com a coluna DIA).
- **Status:** DIVULGADO→`completed` · AGENDADO/PRONTO/AGUARDANDO→`scheduled` · EM EDIÇÃO/PRODUZINDO/GRAVADO→`in_progress` · NÃO PRODUZIDO/ADIADO/VERIFICAR→`planned` · CANCELADO/FORA DO AR→`cancelled`.
- **Canal:** detecta Instagram/LinkedIn/YouTube/WhatsApp/Blog/E-mail e junta (`Instagram + LinkedIn`).
- **Formato:** normalizado para Vídeo/Carrossel/Post/Card/Motion/Story/Reels/Foto/Artigo/Ebook/Infográfico.
- **`execution_payload`** preserva os valores originais (`produto_original`, `canal_original`, `formato_original`, `perfil`, `comemorativa`, `origem_aba`) para rastreabilidade.

## Formato dos registros

**event** → mapeia direto para `CalendarEvent`:
```json
{ "brand_slug", "category":"content", "title", "description", "event_type":"content",
  "channel", "format", "start_at", "status", "date_missing", "execution_payload": {...} }
```
**theme** → futura tabela `content_themes`:
```json
{ "title", "theme", "brand_slug", "audience", "kind", "owner", "status" }
```
**roteiro** → futura tabela `content_scripts`:
```json
{ "title", "brand_slug", "recording_status", "script", "scenes", "lettering", "caption", "status" }
```

## Próximo passo (upload)
Escopo aprovado: **conteúdo + banco de temas + roteiros**. O import exige:
1. Modelos novos `ContentTheme` e `ContentScript` + migration Alembic (os eventos usam o `CalendarEvent` existente).
2. Script de importação idempotente que carrega este JSON (eventos → calendário; temas/roteiros → novas tabelas).
3. (Depois) telas no Calendário para navegar temas/roteiros e usá-los como fonte na Cocriação.

Abas **ignoradas** (operacionais / template genérico, fora do escopo de calendário): `Planejamento`, `DEMO 1 MINUTO`, `CRACHAS E ASSINATURAS`, `Régua`, `LINKS`, `Canais x Personas`, `CRONOGRAMA`, `PIT STOP`, `Página15`, `Linhas Editoriais - Aux`. Abas `EVENTOS` (feiras/congressos), `EDITORIAL 2026`, `MKT DEATH`, `FALA DUOFY` podem virar dados numa rodada posterior se você quiser.
