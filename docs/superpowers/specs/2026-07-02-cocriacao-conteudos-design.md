# Cocriação de conteúdos unificada — Design

**Data:** 2026-07-02 · **Tela:** `apps/web/app/(app)/operations/page.tsx` · **Status:** aprovado

## Objetivo
Unificar as seções "Conteúdos" e "Cocriação de conteúdo" da `/operations` numa única seção
**"Cocriação de conteúdos"**, e substituir o popup/drawer de edição por manejo **inline**:
ao clicar num conteúdo, a seção passa a mostrar **apenas** aquele conteúdo em cocriação.

## Escopo
Incluído agora:
- Fusão das duas seções numa só, com dois estados (Lista e Foco).
- Remoção do drawer/popup de edição de conteúdo (o modal de **criação de pesquisa** permanece).
- Criar conteúdo novo a partir de: **Pesquisa** (existente), **Item do calendário** (eventos atuais) ou **Institucional**.
- Manejo inline: edição manual (título/status/markdown) + ações de workflow + **refino por agente**.

Fora de escopo (fica para a etapa do Calendário + xlsx):
- Banco de temas curado, roteiros, calendário de postagens, importação do xlsx. A fonte
  "Item do calendário" já é o encaixe para isso entrar depois, sem retrabalho.

## Comportamento da seção "Cocriação de conteúdos"
Dois estados mutuamente exclusivos:

**Lista (padrão)**
- Barra "Criar novo": **fonte** (Pesquisa / Item do calendário / Institucional) + **canal·formato**
  (presets atuais) + observação opcional + botão **Gerar**.
- Grid dos conteúdos existentes (cards atuais). Clicar num card → estado **Foco**.

**Foco (um conteúdo aberto)**
- A lista some; aparece só o conteúdo selecionado, com **"← Voltar"**.
- Edição manual: título, status, conteúdo (markdown).
- **Pedir ajuste ao agente:** campo de instrução → regenera criando **nova versão** (histórico preservado).
- Ações: Salvar · Aprovar · Solicitar ajuste · PDF · Copiar · Arquivar.
- Notas de qualidade; fontes (quando o conteúdo tem origem em pesquisa).

O Kanban de Pesquisas e o Orquestrador (chat) no topo permanecem inalterados.

## Fontes de criação
- **Pesquisa:** relatório selecionado no Kanban → briefing base (comportamento atual).
- **Item do calendário (novo):** seletor de um evento de `/api/calendar` → `title`/`description`/
  `channel`/`format` pré-preenchem a geração. Sem mudança de backend.
- **Institucional:** sem fonte (comportamento atual).

Geração pela barra "Criar novo" usa o **content_agent** direto (`POST /api/content/generate`),
determinístico com o canal/formato escolhido. O Orquestrador (chat) também pode criar conteúdo.

## Backend
**Novo — refino por agente:**
- `refine_content_output(db, output, instruction)` em `app/content_generation.py`: carrega o conteúdo
  atual + instrução, chama `call_llm` com o `content_agent` (respeitando o **modelo efetivo**, S1),
  normaliza e grava **nova `OutputVersion`** (mesmo padrão de `generate_content_output`), registra `AgentRun`.
- Schema `ContentRefineRequest { instruction: str (min 3) }`.
- Endpoint `POST /api/content/outputs/{id}/refine` → retorna `ContentOutputDetail`.
- Teste de integração no harness S0 (mock de `call_llm`): refine cria nova versão e retorna o detalhe atualizado.

**Reuso (inalterado):** `POST /api/content/generate`, `PATCH /api/outputs/{id}` (edição manual → nova versão),
`/move`, `/approve`, `/request-adjustment`, `/archive`, `/export`, `GET /api/outputs/{id}` (detalhe/versões).

## Frontend
- `operations/page.tsx`: remover a seção "Conteúdos" e a "Cocriação" separadas + o bloco do drawer de edição
  (`editId`/`detail`/modal). Introduzir a seção única com os estados Lista/Foco (estado `focusedId`).
- Novo cliente: `apiFetch` para `/refine`; seletor de fonte "Item do calendário" carrega `/api/calendar`.
- Tipos já existentes em `lib/api.ts` (ContentOutput, ContentOutputDetail, ResearchReport, CalendarEvent).

## Critérios de aceite
- [ ] Uma única seção "Cocriação de conteúdos" (sem seções separadas, sem popup).
- [ ] Clicar num conteúdo abre inline mostrando só ele; "Voltar" retorna à lista.
- [ ] Criar novo a partir de Pesquisa, Item do calendário ou Institucional.
- [ ] Refino por agente cria nova versão; edição manual e ações de workflow funcionam inline.
- [ ] Backend: endpoint `/refine` com teste verde; suíte e `ruff`/`next lint`/`build` verdes.
