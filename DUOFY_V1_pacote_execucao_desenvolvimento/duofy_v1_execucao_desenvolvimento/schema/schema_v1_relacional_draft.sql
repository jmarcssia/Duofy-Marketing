-- DUOFY V1 — Draft de Schema Relacional
-- Este arquivo é referência. A implementação oficial deve usar Alembic migrations.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_role AS ENUM ('admin', 'manager');
CREATE TYPE task_status AS ENUM ('draft', 'review', 'approved', 'rejected', 'needs_adjustment', 'archived', 'running', 'failed', 'completed');
CREATE TYPE output_status AS ENUM ('draft', 'review', 'approved', 'rejected', 'needs_adjustment', 'archived');

CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'manager',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  niche TEXT,
  description TEXT,
  tone_of_voice TEXT,
  branding_guidelines TEXT,
  social_handles JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  system_prompt TEXT,
  default_model TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  brand_id UUID REFERENCES brands(id),
  title TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  agent_id UUID REFERENCES agents(id),
  session_id UUID REFERENCES chat_sessions(id),
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_type TEXT,
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  feedback TEXT,
  priority INTEGER DEFAULT 0,
  due_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE outputs (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES agent_tasks(id),
  brand_id UUID REFERENCES brands(id),
  type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  status output_status NOT NULL DEFAULT 'draft',
  current_version INTEGER NOT NULL DEFAULT 1,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE output_versions (
  id UUID PRIMARY KEY,
  output_id UUID REFERENCES outputs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  edited_by UUID REFERENCES users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  category TEXT,
  summary TEXT,
  status TEXT DEFAULT 'uploaded',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX document_chunks_embedding_idx ON document_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX document_chunks_brand_idx ON document_chunks (brand_id);

CREATE TABLE memory_entries (
  id UUID PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  category TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  source_type TEXT,
  source_id UUID,
  approved BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX memory_entries_embedding_idx ON memory_entries USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX memory_entries_brand_category_idx ON memory_entries (brand_id, category);

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY,
  brand_id UUID REFERENCES brands(id),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  status TEXT DEFAULT 'draft',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  recurrence TEXT,
  assigned_agent UUID REFERENCES agents(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_calls (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES agent_tasks(id),
  agent_id UUID REFERENCES agents(id),
  provider TEXT,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(12,6) DEFAULT 0,
  latency_ms INTEGER,
  status TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
