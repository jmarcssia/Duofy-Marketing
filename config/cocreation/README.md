# Agente de Cocriação — arquitetura e extensão

O Agente de Cocriação transforma tema/pesquisa/fonte em um **pacote estruturado de conteúdo**
(`ContentPackage`) + uma renderização humana (markdown), reusando o pipeline existente
(`Output` / `OutputVersion` / `AgentRun`, voz de marca, RAG, LLM). Ele **consome** pesquisa
existente — não refaz pesquisa profunda (isso é do Agente de Pesquisa).

## Onde fica o quê

| Peça | Local |
|------|-------|
| Serviço | `apps/api/app/cocreation_service.py` (`generate_content_package`, `refine_content_package`, `validate_package`) |
| Rotas | `apps/api/app/routers/cocreation.py` (`POST /api/cocreation/generate`, `POST /api/cocreation/{id}/refine`, `GET /api/cocreation/{id}`) |
| Contratos | `apps/api/app/schemas.py` (`CreationRequest`, `ContentPackage`, `ContentSlide`, `VisualDirection`, `CocreationRefineRequest`, `ContentPackageResponse`) |
| Persistência | `output_versions.structured_json` (migration `0019`) — o pacote JSON por versão |
| Perfis de marca | `config/cocreation/brands/{duofy,postos,deathcare}.md` |
| Regras gerais | `config/cocreation/references/{source-priority,factuality,tone-and-compliance}.md` |
| Formatos | `config/cocreation/formats/*.md` |
| Direção visual + prompts | `config/cocreation/visual/{visual-direction,image-prompt-engine,negative-rules}.md` |
| Schemas JSON | `config/cocreation/schemas/*.json` |
| Testes | `apps/api/tests/test_cocreation.py` |

## Fluxo

1. `CreationRequest` (marca, tema, canal, formato, opcionais + `research_output_id`).
2. Carrega perfil da marca + guia do formato + regras visuais/factualidade + RAG + a pesquisa
   associada (se houver).
3. Chama o LLM em **modo JSON** (`response_format: json_object`) para produzir o `ContentPackage`.
4. Valida (`validate_package`): legendas de canais diferentes DIFERENTES; carrossel com um
   `image_prompt` independente por slide; nenhum prompt PEDE logo/@/#/marca (o `image_prompt`
   pode listá-los como proibidos). Warnings não bloqueiam, apenas sinalizam.
5. Persiste `Output` + `OutputVersion` (markdown + `structured_json`) com versionamento.
6. Refino parcial: `refine_content_package` recebe o pacote atual, altera só o alvo
   (caption/slide/cta/visual/tone/shorten/persona) e grava uma nova versão preservando o resto.

## Como adicionar…

**Uma nova marca:** crie `config/cocreation/brands/<slug>.md` (perfil modular) e adicione a
entrada `"<brand_slug_do_sistema>": "<slug>"` em `_BRAND_PROFILE` (`cocreation_service.py`).
A marca também precisa existir e estar ativa na tabela `brands`.

**Um novo formato:** crie `config/cocreation/formats/<nome>.md` e mapeie o canal/formato para
esse arquivo em `_format_guide_file` (`cocreation_service.py`). O núcleo do agente não muda.

**Uma nova regra de máquina:** as regras de seções/termos proibidos vivem em
`config/rules/agent_rules.yaml` (agente `content_agent`) e são aplicadas pelo Guardião. Regras
de prompt/visual são texto em `config/cocreation/visual/*.md`, injetadas no prompt.

## Modos de saída

- **Estruturado**: o `ContentPackage` (JSON) retornado pelo endpoint — para banco, UI, lote.
- **Profissional**: a renderização markdown (`content_markdown`), persistida em `OutputVersion`.
- **Compacto**: extraia do pacote apenas `captions`/`slides` conforme a necessidade.

## Débitos / próximos passos (transparência)

- A chamada LLM da cocriação usa `json_mode` via `call_llm`; a geração da pesquisa web usa httpx
  cru (não passa pelo tracking de `ModelCall`).
- UI dedicada (blocos por slide com copiar/regenerar) ainda não implementada — a geração é via
  API; a página de cocriação existente em `/operations` cobre o fluxo básico.
- Formatos com módulo próprio implementados como guias markdown; os 17 formatos podem ser
  detalhados incrementalmente sem tocar no núcleo.
