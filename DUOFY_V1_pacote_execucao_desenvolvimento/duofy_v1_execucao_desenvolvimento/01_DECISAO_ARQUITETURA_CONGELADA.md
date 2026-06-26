# Decisão de Arquitetura Congelada — DUOFY V1

## Decisão final

A V1 será uma aplicação local-first, com possibilidade de exposição temporária para demonstração.

## Entra na V1

- Monorepo.
- Backend FastAPI.
- Frontend Next.js 14.
- PostgreSQL com pgvector.
- Redis.
- Celery para tarefas assíncronas.
- LangGraph para orquestração dos agentes.
- OpenRouter e Anthropic direto para LLMs.
- OpenAI embeddings ou alternativa compatível.
- Upload e indexação de documentos.
- RAG filtrado por marca, categoria, nicho e relevância.
- Login com JWT.
- Admin e Gestor como perfis simples.
- Configurações externas em Markdown/YAML.
- Interface Admin para alterar prompts, regras, fontes, modelos e limites.
- Registro de tokens, custos, logs e versões de outputs.

## Não entra na V1

- Supabase.
- n8n.
- Meta Graph API.
- LinkedIn API.
- WhatsApp API.
- Publicação automática em redes sociais.
- Métricas externas de redes sociais.
- Geração de imagens dentro do sistema.
- Multi-tenant complexo.
- Deploy definitivo em VPS de produção.
- Permissões complexas por equipe.

## Stack definida

### Frontend

- Next.js 14.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- TanStack Query.
- React Hook Form.
- Zod.
- Recharts.
- EventSource/SSE.

### Backend

- Python 3.11.
- FastAPI.
- SQLAlchemy.
- Alembic.
- Pydantic.
- JWT.
- passlib.
- python-jose.
- Uvicorn.

### Banco e filas

- PostgreSQL.
- pgvector.
- Redis.
- Celery.
- APScheduler ou Celery Beat.

### Pesquisa e documentos

- pypdf.
- python-docx.
- markdown.
- BeautifulSoup.
- trafilatura.
- httpx.
- RSS.
- Apify.
- Playwright quando necessário.

## Princípios de implementação

1. Começar simples e funcional.
2. Não criar abstrações avançadas antes do fluxo ponta a ponta funcionar.
3. Priorizar co-criação, pesquisa, memória, aprovações e custos.
4. Guardar tudo que afeta comportamento dos agentes fora do código duro.
5. Cada output deve ter versão, status e possibilidade de aprovação/rejeição/ajuste.
6. Cada chamada de IA deve registrar modelo, provider, tokens, custo estimado, latência e erro.
7. Toda memória deve ser filtrável por marca, categoria, nicho e origem.
