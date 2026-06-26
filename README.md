# DUOFY V1 - Fundacao Tecnica e Auth Base

Base local-first da DUOFY V1. A Fase 1 criou monorepo, FastAPI, Next.js 14, PostgreSQL com pgvector, Redis e Docker Compose. A Fase 2 adiciona autenticacao JWT, layout autenticado e seeds iniciais. A etapa atual adiciona configuracao segura de provedores e execucao inicial de agentes.

## Escopo implementado

- Monorepo com `apps/api` e `apps/web`.
- Backend FastAPI com `GET /health`.
- Frontend Next.js 14 com pagina inicial temporaria.
- Docker Compose com API, Web, PostgreSQL + pgvector e Redis.
- `.env.example` com variaveis locais.
- Estrutura `config`, `docs` e `infra`.
- Autenticacao JWT com roles simples `admin` e `manager`.
- Migrations para `users`, `brands`, `agents` e `settings`.
- Seed idempotente com admin padrao, 3 marcas e 6 agentes.
- Login, dashboard protegido e tela admin inicial de agentes.
- Painel admin para configurar chaves de modelos e ferramentas.
- Provedores configuraveis: OpenRouter, Anthropic, OpenAI e Apify.
- Execucao inicial de agentes via `POST /api/agents/run`.
- Historico basico de execucoes em `agent_runs`.
- Filtros reais para historico de execucoes por agente, status, provedor e busca textual.
- Pesquisa de mercado conectada ao `research_agent`, com web search via OpenRouter quando a pergunta exige informacao atual.
- Conteudos e aprovacoes conectados ao historico real de execucoes dos agentes.
- Memoria/Documentos/RAG com upload de PDF, DOCX, TXT e MD.
- Indexacao com chunks, embeddings em `pgvector` e busca semantica filtrada.
- Agentes `content_agent`, `research_agent` e `orchestrator` recuperam memoria antes de responder.
- Co-criacao de conteudo com outputs reais, `output_versions`, edicao versionada e envio para aprovacao.
- Tela `/content` conectada a `POST /api/content/generate` e historico de outputs.
- Tela `/approvals` consumindo outputs em status `review`.
- Pesquisa de mercado estruturada com coleta RSS/HTTP/Playwright, fontes vinculadas e relatorios salvos como outputs.
- Tela `/research` conectada a `POST /api/research/run`, com salvar como memoria e usar em co-criacao.
- Aprovacoes com endpoints canonicos `/api/outputs`, memoria permanente ao aprovar e aprendizado temporario por 30 dias ao rejeitar.
- Calendario editorial em `/calendar`, com eventos reais, visual mes/semana/lista e scheduler interno.
- Assessoria de imprensa com `press_agent`, outputs versionados e integracao com aprovacao.
- Metricas de chamadas LLM em `model_calls`, pagina `/costs` e relatatorios internos em `/insights`.
- Exportacao PDF para outputs e relatorios internos com branding Duofy simples.
- Chat operacional com sessoes, mensagens, tarefas, logs, SSE e worker Celery.
- Roteiro de demo, checklist final e smoke test local.

## Requisitos

- Docker e Docker Compose.
- Python 3.11+ para checks locais da API.
- Node.js 20+ para checks locais do frontend.

## Como rodar com Docker

```bash
cp .env.example .env
docker compose up --build
```

Servicos:

- Web: http://localhost:3000
- API: http://localhost:8000
- Health: http://localhost:8000/health
- Login: http://localhost:3000/login
- Dashboard: http://localhost:3000/dashboard
- Admin agentes: http://localhost:3000/admin/agents
- Admin configuracoes: http://localhost:3000/admin/config
- Calendario: http://localhost:3000/calendar
- Custos e tokens: http://localhost:3000/costs
- Insights/relatorios: http://localhost:3000/insights
- PostgreSQL: localhost:5433
- Redis: localhost:6379
- Worker: `duofy-worker`

Credenciais locais padrao apos rodar o seed:

- E-mail: `admin@duofy.com.br`
- Senha: `admin123456`

## Migrations e seed

Com Docker:

```bash
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

Fora do Docker, usando o Postgres exposto pelo Compose na porta `5433`:

```powershell
cd apps/api
$env:DATABASE_URL="postgresql+asyncpg://duofy:duofy@localhost:5433/duofy_v1"
alembic upgrade head
python -m app.seed
```

Variaveis do admin inicial:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Configurar chaves de modelos e ferramentas

1. Acesse http://localhost:3000/login.
2. Entre com `admin@duofy.com.br` e `admin123456`.
3. Acesse http://localhost:3000/admin/config.
4. Na aba `Modelos LLM`, configure um ou mais provedores:
   - `OpenRouter`: recomendado para testar varios modelos com uma chave.
   - `Anthropic`: chamadas diretas para Claude.
   - `OpenAI`: chamadas diretas para modelos OpenAI.
5. Cole a API key, ajuste `Base URL` se necessario, defina o `Modelo padrao` e marque `Habilitar provedor`.
6. Na aba `Ferramentas`, configure `Apify` quando for usar ferramentas externas.

As chaves ficam salvas no PostgreSQL criptografadas. A API retorna apenas mascara da chave salva.

Valores recomendados para OpenRouter:

- Base URL: `https://openrouter.ai/api/v1`
- Modelo padrao: `~anthropic/claude-sonnet-latest`

O backend tambem normaliza `https://openrouter.ai/api` e endpoints completos terminados em `/chat/completions` para evitar erro 404.

Valores recomendados para embeddings:

- Provedor: `OpenAI Embeddings`
- Base URL: `https://api.openai.com/v1`
- Modelo padrao: `text-embedding-3-small`

Se `OpenAI Embeddings` nao estiver habilitado, o sistema usa embedding local deterministico para permitir testes locais de upload, indexacao e busca RAG.

## Testar agentes

Depois de configurar e habilitar pelo menos um provedor LLM:

1. Acesse http://localhost:3000/admin/agents.
2. Escolha um agente ativo.
3. Escolha o provedor.
4. Escreva o prompt de teste.
5. Clique em `Executar agente`.

Sem chave configurada, a API retorna erro controlado informando para configurar o provedor em `Admin > Configuracoes > Modelos LLM`.

## Testar chat, tarefas e worker

Pelo frontend:

1. Garanta que o worker esta rodando: `docker compose ps`.
2. Acesse http://localhost:3000/chat.
3. Crie uma conversa ou envie uma mensagem diretamente.
4. Use um pedido de baixo custo para validar sem LLM:
   `Gere um relatorio interno de metricas para validar a demo.`
5. Acompanhe a tarefa ate `Concluida`.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
$session = Invoke-RestMethod -Uri http://localhost:8000/api/chat/sessions -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ title='Demo'; brand_slug='duofy_solucoes' } | ConvertTo-Json)
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/chat/sessions/$($session.id)/messages" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ content='Gere um relatorio interno de metricas para validar a demo.'; brand_slug='duofy_solucoes' } | ConvertTo-Json)
Invoke-RestMethod -Uri "http://localhost:8000/api/tasks/$($response.task.id)" -Headers $headers
```

## Testar memoria, documentos e RAG

Pelo frontend:

1. Acesse http://localhost:3000/memory.
2. Envie um arquivo `PDF`, `DOCX`, `TXT` ou `MD`.
3. Escolha marca, categoria e `source_type`.
4. Aguarde o status `indexed`.
5. Use a busca RAG na mesma tela.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod -Uri http://localhost:8000/api/documents -Headers $headers
Invoke-RestMethod -Uri http://localhost:8000/api/memory/search -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ query='diferencial da Duofy'; brand_slug='duofy_solucoes'; category='brand'; limit=5 } | ConvertTo-Json)
```

## Testar co-criacao de conteudo

Pre-requisitos:

- Configure e habilite um provedor LLM em http://localhost:3000/admin/config.
- OpenRouter recomendado: `https://openrouter.ai/api/v1` com modelo `~anthropic/claude-sonnet-latest`.
- Para respostas com contexto proprietario, suba documentos em http://localhost:3000/memory antes de gerar.

Pelo frontend:

1. Acesse http://localhost:3000/content.
2. Escolha marca, categoria RAG, canal e formato.
3. Preencha o briefing e clique em `Gerar conteudo`.
4. Edite o resultado e clique em `Salvar versao` se necessario.
5. Clique em `Enviar para aprovacao`.
6. Acesse http://localhost:3000/approvals e revise o output em status `Em revisao`.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
$body = @{
  brand_slug='deathcare'
  category='sales'
  channel='LinkedIn'
  format='Post LinkedIn'
  briefing='Crie um post de LinkedIn sobre reducao de inadimplencia em planos funerarios, com persona financeira/comercial, dor de inadimplencia/churn, solucao Gestao DeathCare/App de Cobranca/Portal Cliente e CTA claro.'
  provider='openrouter'
} | ConvertTo-Json
$output = Invoke-RestMethod -Uri http://localhost:8000/api/content/generate -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://localhost:8000/api/content/outputs/$($output.id)/submit-review" -Method Post -Headers $headers
Invoke-RestMethod -Uri "http://localhost:8000/api/content/outputs?status=review" -Headers $headers
```

Teste Postos:

```powershell
$body = @{
  brand_slug='postos_combustiveis'
  category='sales'
  channel='Instagram'
  format='Carrossel'
  briefing='Crie um carrossel para donos de postos sobre conciliacao de caixa, cobrindo multiplas formas de pagamento, sangrias e DRE por unidade, conectando Smart PDV, Retaguarda, Backoffice Protheus e Fast Analytics.'
  provider='openrouter'
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/content/generate -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

## Testar pesquisa de mercado

Pelo frontend:

1. Acesse http://localhost:3000/research.
2. Escolha marca, tema, periodo, profundidade e provedor.
3. Opcionalmente informe URLs de fontes, uma por linha.
4. Clique em `Rodar agora`.
5. Abra o relatorio, confira as fontes e use `Salvar memoria` ou `Usar em conteudo`.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
$body = @{
  brand_slug='postos_combustiveis'
  theme='conciliacao de caixa em postos de combustiveis'
  period='ultimos 30 dias'
  depth='standard'
  provider='openrouter'
  source_urls=@()
  use_apify=$false
} | ConvertTo-Json
$report = Invoke-RestMethod -Uri http://localhost:8000/api/research/run -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://localhost:8000/api/research/reports/$($report.id)/save-memory" -Method Post -Headers $headers
Invoke-RestMethod -Uri "http://localhost:8000/api/research/reports/$($report.id)/use-in-content" -Method Post -Headers $headers
```

Teste DeathCare:

```powershell
$body = @{
  brand_slug='deathcare'
  theme='inadimplencia e churn em planos funerarios'
  period='ultimos 90 dias'
  depth='standard'
  provider='openrouter'
  source_urls=@()
  use_apify=$false
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/research/run -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

## Testar aprovacoes, versoes e aprendizado

Pelo frontend:

1. Gere um conteudo em http://localhost:3000/content.
2. Clique em `Enviar para aprovacao`.
3. Acesse http://localhost:3000/approvals.
4. Edite o texto e clique em `Salvar versao`.
5. Para aprovar, clique em `Aprovar e criar memoria`.
6. Para rejeitar ou solicitar ajuste, preencha feedback antes da acao.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
$outputs = Invoke-RestMethod -Uri "http://localhost:8000/api/outputs?status=review" -Headers $headers
$outputId = $outputs[0].id
Invoke-RestMethod -Uri "http://localhost:8000/api/outputs/$outputId" -Method Patch -Headers $headers -ContentType 'application/json' -Body (@{ content='Versao editada para revisao'; editor_note='Teste de versao' } | ConvertTo-Json)
Invoke-RestMethod -Uri "http://localhost:8000/api/outputs/$outputId/approve" -Method Post -Headers $headers
Invoke-RestMethod -Uri http://localhost:8000/api/memory/search -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ query='Versao editada para revisao'; brand_slug='duofy_solucoes'; category='output_approved'; limit=5 } | ConvertTo-Json)
```

Teste de rejeicao com aprendizado temporario:

```powershell
$reviewOutput = (Invoke-RestMethod -Uri "http://localhost:8000/api/outputs?status=review" -Headers $headers)[0]
Invoke-RestMethod -Uri "http://localhost:8000/api/outputs/$($reviewOutput.id)/reject" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ feedback='Nao usar abordagem generica; faltou dor especifica e CTA.' } | ConvertTo-Json)
```

## Testar calendario editorial e assessoria

Pelo frontend:

1. Acesse http://localhost:3000/calendar.
2. Crie um evento manual com agente opcional.
3. Para execucao automatica, marque status `Agendado`, escolha um agente e defina data/hora.
4. Use `Executar agora` para testar sem aguardar o scheduler.
5. Use `Gerar calendario` para criar eventos com o `calendar_agent`.
6. Use `Assessoria` para gerar pauta, release, comunicado ou abordagem com o `press_agent`.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
$event = Invoke-RestMethod -Uri http://localhost:8000/api/calendar -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  brand_slug='duofy_solucoes'
  category='general'
  title='Pauta institucional sobre IA no marketing'
  description='Criar uma pauta institucional conectando IA, eficiencia operacional e crescimento.'
  event_type='press'
  status='scheduled'
  channel='Assessoria'
  format='pauta'
  start_at=(Get-Date).ToUniversalTime().ToString('o')
  assigned_agent_slug='press_agent'
  execution_payload=@{ briefing='Gerar pauta institucional sobre IA no marketing.' }
} | ConvertTo-Json -Depth 5)
Invoke-RestMethod -Uri "http://localhost:8000/api/calendar/$($event.id)/run-now" -Method Post -Headers $headers
Invoke-RestMethod -Uri http://localhost:8000/api/press/generate -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  brand_slug='duofy_solucoes'
  category='general'
  format='press_release'
  briefing='Gerar release institucional sobre a Duofy como plataforma de IA para marketing.'
  provider='openrouter'
} | ConvertTo-Json)
```

## Testar metricas, custos e PDF

As metricas comecam a ser registradas nas novas chamadas de IA feitas apos a migration da Fase 10.

Pelo frontend:

1. Execute qualquer agente ou gere conteudo/pesquisa/assessoria.
2. Acesse http://localhost:3000/costs para ver chamadas, tokens, custo estimado e latencia.
3. Acesse http://localhost:3000/insights e clique em `Gerar snapshot`.
4. Use `Exportar PDF` em `/insights` para baixar o relatorio interno.
5. Em http://localhost:3000/content, selecione um output e use `Exportar PDF`.

Pela API:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod -Uri http://localhost:8000/api/metrics/summary -Headers $headers
Invoke-RestMethod -Uri "http://localhost:8000/api/metrics/model-calls?limit=20" -Headers $headers
$report = Invoke-RestMethod -Uri http://localhost:8000/api/reports/generate -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ title='Snapshot operacional'; report_type='internal_metrics' } | ConvertTo-Json)
Invoke-WebRequest -Uri "http://localhost:8000/api/reports/$($report.id)/pdf" -Headers $headers -OutFile "duofy-report-$($report.id).pdf"
```

## Checks manuais

API:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@duofy.com.br\",\"password\":\"admin123456\"}"
```

Listar provedores e agentes exige token JWT:

```powershell
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method Post -ContentType 'application/json' -Body (@{ email='admin@duofy.com.br'; password='admin123456' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod -Uri http://localhost:8000/api/admin/providers -Headers $headers
Invoke-RestMethod -Uri http://localhost:8000/api/admin/agents -Headers $headers
```

PostgreSQL:

```bash
docker compose exec postgres psql -U duofy -d duofy_v1 -c "select 1;"
docker compose exec postgres psql -U duofy -d duofy_v1 -c "select extname from pg_extension where extname = 'vector';"
```

Redis:

```bash
docker compose exec redis redis-cli ping
```

Smoke test local:

```powershell
.\scripts\smoke-demo.ps1
```

Roteiro e checklist:

- `docs/ROTEIRO_DEMO_V1.md`
- `docs/CHECKLIST_FINAL_V1.md`

## Desenvolvimento local da API

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest
python -m ruff check .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Para rodar localmente fora do Docker, ajuste `DATABASE_URL` e `REDIS_URL` para `localhost`.
Se usar o Postgres do Compose a partir da maquina host, use a porta `5433`.

## Desenvolvimento local do frontend

```bash
cd apps/web
npm install
npm run lint
npm run build
npm run dev
```

## Variaveis de ambiente

Use `.env.example` como base. Nao versionar `.env` com segredos reais.

## Fora do escopo desta fase

- Telas finais.
- Workflows multiagente completos.
- Publicacao externa automatica.
- Billing oficial dos provedores.
- Deploy Vercel/ngrok automatico.
