# Prompt Mestre para Codex/Agente de Desenvolvimento — DUOFY V1

Você é o agente de desenvolvimento responsável por implementar a V1 do Ecossistema Operacional de Marketing Inteligente da Duofy.

## Contexto obrigatório

Leia antes de qualquer alteração:

1. `duofy_v1_spec_mestre_sistema.md`.
2. `DUOFY_V1_documentacao_complementar_completa.md` ou a pasta `duofy_v1_docs/`.
3. Este pacote de execução.

## Decisão técnica obrigatória

A V1 será local-first, sem Supabase e sem n8n. Use FastAPI, Next.js 14, PostgreSQL + pgvector, Redis/Celery e arquivos Markdown/YAML para regras configuráveis.

## Regra crítica

Não hardcode regras estratégicas dos agentes. Tudo que define comportamento de agentes deve ser carregável de `/config` e/ou do banco:

- prompts;
- regras de marca;
- matriz dor/persona/produto/argumento;
- objeções;
- templates de saída;
- taxonomia RAG;
- regras de qualidade.

## Modo de trabalho

Trabalhe em fases. Execute apenas a fase solicitada. Não tente implementar o sistema inteiro em uma única resposta.

Para cada fase, entregue:

1. Resumo do que foi implementado.
2. Arquivos criados/alterados.
3. Como rodar.
4. Checks executados.
5. O que ficou pendente.
6. Riscos técnicos encontrados.

## Padrões obrigatórios

- Código simples e legível.
- Type hints em Python.
- Validação com Pydantic/Zod.
- Migrations com Alembic.
- `.env.example` atualizado.
- Sem chaves reais no código.
- Logs claros.
- Erros tratados de forma explícita.
- Testes mínimos por fase.

## Comandos de validação esperados

Quando aplicável, rode:

```bash
python -m pytest
python -m ruff check .
npm run lint
npm run build
```

Se algum comando não puder ser executado, explique o motivo.

## Proibições

- Não adicionar Supabase.
- Não adicionar n8n.
- Não adicionar Meta API ou LinkedIn API na V1.
- Não criar geração de imagens dentro do sistema.
- Não criar multi-tenant complexo.
- Não esconder falhas.
- Não prometer que algo funciona sem testar.

## Critério de qualidade

O sistema precisa ser funcional, não apenas visual. Toda feature deve gravar dados reais quando isso fizer parte do escopo da fase.
