# 04 · Modelo de Dados

**Stack:** SQLAlchemy 2 (async/asyncpg) + PostgreSQL 16 + pgvector + Alembic.
**Veredito:** esquema **REAL e coeso** (24 tabelas, 24 modelos, nenhum órfão). Cadeia de 15 migrations linear e íntegra. Dívidas concentradas em **integridade referencial** (sem cascades, `brand_slug` sem FK) e **um índice faltante**.

---

## 1. Inventário por domínio

Base: `db.py:11` (`Base(DeclarativeBase)`). Mixin de timestamps (`models.py:22-33`): `created_at`/`updated_at` com `timezone=True`, `server_default=now()`, `updated_at onupdate=now()` (só client-side — ver §5).

| Domínio | Tabelas | Confiança |
|---|---|:---:|
| **Auth** | `users`, `brands`, `settings` | REAL |
| **Agentes/Credenciais** | `agents`, `provider_credentials`, `agent_runs` | REAL |
| **Memória/RAG** | `sources`, `documents`, `document_chunks`, `memory_entries` | PARCIAL |
| **Conteúdo/Outputs** | `outputs`, `output_versions`, `output_decisions`, `output_comments` | REAL |
| **Pesquisa** | `research_sources` | REAL |
| **Calendário** | `calendar_events` | REAL (falta índice `category`) |
| **Métricas/Relatórios** | `model_calls`, `reports` | REAL |
| **Tarefas/Chat** | `chat_sessions`, `agent_tasks`, `chat_messages`, `agent_logs` | REAL |
| **Auditoria** | `audit_events` | REAL |
| **Quality** | `quality_reviews` | REAL |

### Chaves de negócio
- `Brand.slug` é a **chave de negócio de facto** — ~14 tabelas referenciam `brand_slug String(120)` **sem FK** (desacoplamento por slug; ver §5).
- `provider_credentials.api_key_encrypted` é nullable e `is_enabled` default `False` — seed não commita segredo.
- Colunas vetoriais: `document_chunks.embedding` e `memory_entries.embedding`, ambas `Vector(1536)` nullable.

**Segurança de exposição (correta):** `password_hash` e `api_key_encrypted` **nunca** aparecem em schemas Pydantic. `ProviderCredentialRead` expõe `has_api_key: bool` + `masked_api_key` (`schemas.py:56-64`).

---

## 2. Migrations — consistência e cadeia

- **Cadeia `down_revision` íntegra e linear:** `0001 (None)` → … → `0015`. Sem ramificações. Detalhe estético: o `revision` interno nem sempre bate com o nome do arquivo (ex.: `0003_provider_credentials_agent_runs.py` tem `revision="0003_provider_creds_runs"`), mas as referências fecham corretamente.
- `env.py:17,50-51` usa `Base.metadata` com `compare_type=True` e `compare_server_default=True` — autogenerate funcional.

### Divergências ORM ↔ migrations (achados)

| # | Divergência | Evidência | Efeito |
|---|---|---|---|
| A | `calendar_events.category` tem `index=True` no ORM mas o índice **não é criado** na migration | `models.py:330` vs `0008:54-64` | Filtro por categoria faz seq scan; autogenerate vai querer criar o índice |
| B | `embedding` criado como `Text` + `ALTER ... TYPE vector(1536)` via SQL cru | `0004:67-74` vs `models.py:386` (`Vector(1536)`) | Resultado final correto, mas autogenerate pode gerar diffs espúrios |
| D | `updated_at onupdate` só client-side (ORM) | `models.py:31` | **UPDATE via SQL cru não atualiza `updated_at`** — armadilha real, há bastante `text()` no projeto |

Defaults (`server_default` nas migrations vs `default` no ORM) são coerentes nos casos verificados (`role`, `passed`, colunas JSON `default=list`).

---

## 3. pgvector / RAG

- **Extensão** habilitada de forma redundante/defensiva em 3 lugares (init SQL, `0001`, `0004`), idempotente.
- **Dimensão 1536** consistente em **todo** o sistema: `Vector(1536)` no ORM, `ALTER ... vector(1536)` nas migrations, `EMBEDDING_DIMENSIONS=1536` (`embeddings.py:13`), casado com `text-embedding-3-small` (seed). **Alinhamento total.**
- **Índices ANN:** migration `0015` cria **dois índices HNSW** com `vector_cosine_ops` (`ix_document_chunks_embedding_hnsw`, `ix_memory_entries_embedding_hnsw`). Escolha correta (melhor recall/latência que ivfflat, sem tuning de lists).
- **Operador casado:** `rag.py:68,84` usa `1 - (embedding <=> CAST(:embedding AS vector))` — `<=>` é cosseno, exatamente o que `vector_cosine_ops` indexa.

### ⚠️ Ressalva de performance (PARCIAL)
A query de busca (`rag.py:55-91`) faz `SELECT ... FROM (subquery1 UNION ALL subquery2) ranked ORDER BY score DESC LIMIT :limit`. O `ORDER BY score` está na **query externa** sobre um `UNION ALL`, e o score é a expressão `1 - (... <=> ...)`, não a distância pura ordenada por tabela. O índice HNSW só acelera quando o `ORDER BY <distância>` está diretamente na tabela indexada. **Portanto o planner provavelmente NÃO usa os índices HNSW nesta query** — computa a distância para todas as linhas filtradas e ordena. Os índices de `0015` existem mas podem não estar sendo aproveitados.
**Ação:** rodar `EXPLAIN (ANALYZE, BUFFERS)` na query real; se confirmar seq scan, reescrever para aplicar `ORDER BY embedding <=> :q LIMIT k` por tabela (subconsulta indexável) e só então combinar/re-rankear.

### Fallback de embedding
`embeddings.py:29-41` gera vetor determinístico via hashing SHA-256 bucketizado, normalizado (coerente com cosseno). `_fit_dimensions` (`:21-26`) faz pad/trunca para 1536 **silenciosamente** — um provider de 3072-D seria truncado sem aviso, degradando qualidade. Ver [02](02_FUNCIONALIDADES_E_NIVEIS_DE_CONFIANCA.md) §1.12.

---

## 4. Índices e performance

**Bem indexado para dashboards/filtros:** `outputs` (5 índices), `calendar_events` (7), `model_calls` (6), `audit_events` (7). Boa disciplina.

**FKs sem índice (dívida latente — Postgres não indexa FK automaticamente):**
`documents.source_id`, `memory_entries.source_id`, `outputs.agent_run_id`, `output_decisions.user_id`/`memory_entry_id`, `output_comments.user_id`, `quality_reviews.agent_run_id`, `chat_messages.agent_task_id`, `calendar_events.output_id`/`agent_run_id`. Um `DELETE` no lado pai faz seq scan nas filhas para checar as FKs. Aceitável no volume atual (equipe única), mas é dívida.

**N+1:** **não há `relationship()` em nenhum model** (zero lazy-loading ORM). Os agregados (`ChatSessionDetail.messages`, `ContentOutputDetail.versions` etc.) são montados por queries explícitas nos services — elimina o N+1 automático, mas transfere ao dev a responsabilidade de não fazer loop de queries manual.

---

## 5. Integridade

- **UNIQUE:** `users.email`, `brands.slug`, `agents.slug`, `settings.key`, `provider_credentials.provider`, e composto `uq_output_versions_output_version(output_id, version_number)`. Bom. (Faltaria talvez `research_sources(output_id, url)` para evitar fontes duplicadas.)
- **FKs "lógicas" como Integer puro (integridade não aplicada) — 4 casos:**
  1. `Output.current_version_id` (`models.py:177`) — dívida real (ciclo com `output_versions.output_id`).
  2. `AgentTask.output_id`, 3. `ModelCall.task_id`, 4. `AuditEvent.entity_id` — **polimórficos intencionais** (o tipo vem de outra coluna), aceitáveis.
- **`brand_slug` nunca é FK** — deletar/renomear uma marca deixa registros órfãos silenciosos em ~14 tabelas. Dívida de médio porte, provavelmente consciente.
- **CASCADES: nenhum `ondelete`/`onupdate` em nenhuma FK.** Default `NO ACTION` → deletar um `output` com versions/comments/reviews/decisions/research_sources filhos **falha por violação de FK** a menos que o app delete os filhos manualmente em ordem. **Dívida real:** limpeza 100% na mão da aplicação.
- **Timestamps** presentes em todas as tabelas; `updated_at` não atualiza em UPDATE via SQL cru (§2D).

---

## 6. Schemas Pydantic vs Models

- **Sem vazamento de segredo** (confirmado §1).
- **Enums frouxos no banco, restritos no schema:** `role`/`status` são `String` livre no banco mas `Literal[...]` nos schemas (ex.: `UserRead.role: Literal["admin","manager"]`, `schemas.py:22`). Um valor fora do enum no banco **quebra a serialização**. Risco baixo (seed usa valores válidos), mas real — o enum não é forçado no banco.
- **Campos "virtuais" em DTOs de resposta:** `ContentOutputRead` expõe `current_version_number`, `current_content`, `document_type`, `document_sections`, `quality_notes` — nenhum existe na tabela; são montados no service. Legítimo, mas cria acoplamento (quebrar a montagem quebra o contrato).
- **Validação saudável:** `Field(min_length/max_length/ge/le)` bem usado nos schemas de escrita; `EmailStr` em login/user.

---

## 7. Pool de conexão async (`db.py`)

`create_async_engine` (`db.py:16-24`): `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20` (**até 30 conexões/processo**), `pool_timeout=30`, `pool_recycle=1800`, `expire_on_commit=False` (correto e necessário em async). `get_db()` usa `async with` (sessão sempre fechada).

**Riscos em produção:**
1. **30 conexões × N workers × (API + Celery)** pode estourar o `max_connections` default do Postgres (100). Dimensionar com pgbouncer ou reduzir `pool_size` em prod.
2. asyncpg + pgbouncer em transaction mode exigiria `statement_cache_size=0` (não configurado) — dívida latente se um dia colocarem pgbouncer.

---

## 8. Seed (`seed.py`)

Idempotente (upsert por chave natural). Popula admin (`role=admin`, senha via `hash_password`), brands/agents (de YAML), settings, e **5 provider credentials todas com `is_enabled=False` e sem api_key** (`openrouter`, `anthropic`, `openai`, `openai_embeddings`, `apify`). **Nenhum segredo hardcoded.** Hardening de produção bloqueia senha admin default fora de dev.
> **Importante (operacional):** o seed é um script de CLI (`python -m app.seed`) e **não roda automaticamente no boot do Docker**. Ver [06 · Infra](06_INFRAESTRUTURA_E_DEPLOY.md) §4.

---

## Sumário de achados acionáveis (modelo de dados)

| # | Sev. | Achado | Local |
|---|---|---|---|
| 1 | Média | Índice `calendar_events.category` do ORM não existe na migration | `models.py:330` vs `0008` |
| 2 | Média | Query RAG ordena sobre `UNION ALL` → HNSW provavelmente não usado (confirmar c/ EXPLAIN) | `rag.py:55-91` |
| 3 | Média | Sem `ON DELETE CASCADE` em nenhuma FK → deletes bloqueiam/exigem limpeza manual | todas as migrations |
| 4 | Média | `brand_slug` sem FK em ~14 tabelas → órfãos silenciosos | esquema global |
| 5 | Baixa-Média | 8+ FKs sem índice | §4 |
| 6 | Baixa | `updated_at onupdate` só client-side → UPDATE cru não toca `updated_at` | `models.py:31` |
| 7 | Baixa | `embedding` como `Text`+ALTER → diffs espúrios no autogenerate | `0004:67-74` |
| 8 | Baixa | `_fit_dimensions` trunca embeddings silenciosamente | `embeddings.py:21-26` |
| 9 | Baixa | Pool 30 conn/processo pode estourar Postgres sem pgbouncer | `db.py:16-23` |
| 10 | Info | Enum `String` no banco vs `Literal` no schema → risco de erro de serialização | `models.py:43` vs `schemas.py:22` |

**Pontos fortes:** dimensão 1536 100% consistente; HNSW+`vector_cosine_ops` casado com `<=>`; cadeia de migrations linear e íntegra; seed idempotente e seguro; `expire_on_commit=False` correto; sem N+1 ORM; zero modelos mortos; nenhum segredo exposto.

> Continue por **[05 · Qualidade, Código Morto e Testes](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md)**.
