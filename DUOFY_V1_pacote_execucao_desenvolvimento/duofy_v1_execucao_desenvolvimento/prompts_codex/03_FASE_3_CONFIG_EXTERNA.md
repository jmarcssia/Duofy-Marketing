# Prompt Codex — Fase 3: Configuração Externa dos Agentes

Implemente o carregamento de configurações externas em Markdown/YAML.

## Objetivo

Garantir que prompts, regras, templates, marcas e taxonomias sejam editáveis fora do código.

## Requisitos

1. Criar pasta `/config` no repositório com subpastas:
   - `agents`
   - `brands`
   - `templates`
   - `rules`
   - `seeds`
2. Implementar loader backend para ler Markdown/YAML.
3. Validar arquivos com schemas Pydantic.
4. Criar endpoint admin de visualização:
   - `GET /api/admin/config`
   - `GET /api/admin/config/{type}`
5. Opcional: comando de sincronização config → banco.
6. Garantir que agentes futuros consigam carregar prompts desses arquivos.

## Critérios de pronto

- Alterar um arquivo em `/config/agents` muda a configuração carregada.
- Admin consegue consultar configs.
- Erros de configuração são explícitos.

## Responda no final

- Arquivos criados/alterados.
- Como testar loader.
- Checks executados.
- Pendências.
