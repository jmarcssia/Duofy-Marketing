export type User = {
  id: number
  email: string
  name: string
  role: "admin" | "manager"
}

export type Brand = {
  id: number
  name: string
  slug: string
  niche: string
  description: string
}

export type Agent = {
  id: number
  name: string
  slug: string
  default_model: string
  is_active: boolean
}

export type LoginResponse = {
  access_token: string
  token_type: "bearer"
  user: User
}

export type ProviderCredential = {
  provider: "openrouter" | "anthropic" | "openai" | "openai_embeddings" | "apify"
  display_name: string
  base_url: string | null
  default_model: string | null
  is_enabled: boolean
  has_api_key: boolean
  masked_api_key: string | null
}

export type QualitySettings = {
  review_mode: "local_only" | "hybrid" | "llm_required"
  provider: "openrouter" | "anthropic" | "openai" | null
  model: string | null
}

export type AgentSettings = {
  token_budgets: Record<string, number>
  research_depth: Record<string, { sources: number; excerpt: number }>
}

export type AgentRun = {
  id: number
  agent_slug: string
  provider: string
  model: string
  prompt: string
  output: string
  status: string
  error: string | null
}

export type AgentLog = {
  id: number
  task_id: number
  level: string
  message: string
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export type AgentTask = {
  id: number
  session_id: number | null
  user_id: number | null
  brand_slug: string | null
  task_type: string
  status: string
  input: string
  result: string
  output_type: string | null
  output_id: number | null
  celery_task_id: string | null
  error: string | null
  metadata_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
  logs: AgentLog[]
}

export type ChatMessage = {
  id: number
  session_id: number
  role: string
  content: string
  agent_task_id: number | null
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export type ChatSession = {
  id: number
  user_id: number
  title: string
  brand_slug: string | null
  status: string
  created_at: string
  updated_at: string
}

export type ChatSessionDetail = ChatSession & {
  messages: ChatMessage[]
}

export type ChatMessageResponse = {
  message: ChatMessage
  task: AgentTask
}

export type AgentRunStatus =
  | "completed"
  | "approved"
  | "needs_adjustment"
  | "rejected"
  | "failed"

export type ContentOutputStatus =
  | "draft"
  | "review"
  | "approved"
  | "needs_adjustment"
  | "rejected"
  | "archived"

export type ContentOutput = {
  id: number
  brand_slug: string
  category: string
  channel: string
  format: string
  title: string
  briefing: string
  status: ContentOutputStatus | string
  provider: string
  model: string
  agent_run_id: number | null
  current_version_id: number | null
  current_version_number: number | null
  current_content: string
  document_type: string
  document_sections: string[]
  quality_notes: string[]
  created_at: string
  updated_at: string
}

export type ContentOutputVersion = {
  id: number
  output_id: number
  version_number: number
  content: string
  editor_note: string | null
  created_at: string
}

export type QualityReview = {
  id: number
  output_id: number
  version_id: number
  agent_run_id: number | null
  reviewer_slug: string
  status: string
  score: number
  passed: boolean
  summary: string
  critical_failures: string[]
  required_fixes: string[]
  optional_improvements: string[]
  verified_sources: string[]
  raw_report: string
  review_mode: string
  llm_provider: string | null
  llm_model: string | null
  llm_error: string | null
  confidence: number | null
  created_at: string
}

export type ContentOutputDetail = ContentOutput & {
  versions: ContentOutputVersion[]
  latest_quality_review: QualityReview | null
}

export type OutputWorkflowDetail = ContentOutputDetail & {
  approved_memory_id: number | null
  temporary_learning_id: number | null
  latest_feedback: string | null
}

export type OutputComment = {
  id: number
  output_id: number
  version_id: number | null
  user_id: number | null
  user_name: string | null
  anchor_text: string | null
  selected_text: string | null
  comment: string
  status: "open" | "resolved" | string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type OutputVersionDiffLine = {
  change_type: "added" | "removed" | "unchanged"
  old_line_number: number | null
  new_line_number: number | null
  content: string
}

export type OutputVersionCompare = {
  output_id: number
  from_version: ContentOutputVersion
  to_version: ContentOutputVersion
  lines: OutputVersionDiffLine[]
}

export type ResearchSource = {
  id: number
  output_id: number
  title: string
  url: string
  publisher: string | null
  published_at: string | null
  accessed_at: string
  reliability: string
  source_kind: string
  status: string
  evidence: string
  error: string | null
}

export type ResearchReport = ContentOutput & {
  sources: ResearchSource[]
}

export type ResearchContentBriefing = {
  brand_slug: string
  category: string
  channel: string
  format: string
  briefing: string
}

export type CalendarEvent = {
  id: number
  brand_slug: string
  category: string
  title: string
  description: string
  event_type: string
  status: string
  channel: string | null
  format: string | null
  start_at: string
  end_at: string | null
  assigned_agent_slug: string | null
  execution_payload: Record<string, unknown> | null
  output_id: number | null
  agent_run_id: number | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ContentTheme = {
  id: number
  title: string
  theme: string
  brand_slug: string | null
  audience: string | null
  kind: string | null
  owner: string | null
  status: string | null
}

export type ResearchTheme = {
  id: number
  title: string
  notes: string | null
  brand_slug: string | null
}

export type ResearchModel = {
  label: string
  model_id: string
}

export type Briefing = {
  id: number
  brand_slug: string | null
  request_text: string
  tipo: "pesquisa" | "conteudo" | "imprensa" | "calendario" | "conversa"
  objetivo: string
  resumo_plano: string
  agente_alvo: string | null
  tema_sugerido: string | null
  status: string
  model_override: string | null
  research_theme_id: number | null
  result_kind: string | null
  result_id: number | null
  direct_answer: string | null
}

export type BriefingApproveResponse = {
  briefing: Briefing
  answer: string
  result_kind: string | null
  result_id: number | null
}

export type ModelCall = {
  id: number
  task_type: string
  task_id: number | null
  agent_slug: string | null
  brand_slug: string | null
  provider: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  status: string
  error: string | null
  created_at: string
}

export type AuditEvent = {
  id: number
  user_id: number | null
  user_email: string | null
  entity_type: string
  entity_id: number | null
  action: string
  status: string
  brand_slug: string | null
  agent_slug: string | null
  summary: string
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export type MetricsSummary = {
  total_calls: number
  completed_calls: number
  failed_calls: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  avg_latency_ms: number | null
  by_provider: Array<{ key: string; calls: number; tokens: number; cost: number }>
  by_agent: Array<{ key: string; calls: number; tokens: number; cost: number }>
  by_model: Array<{ key: string; calls: number; tokens: number; cost: number }>
}

export type OperationsSummary = {
  total_model_calls: number
  failed_model_calls: number
  estimated_cost_usd: number
  avg_latency_ms: number | null
  total_agent_runs: number
  failed_agent_runs: number
  total_quality_reviews: number
  failed_quality_reviews: number
  avg_quality_score: number | null
  total_decisions: number
  audit_events: number
  recent_errors: Array<Record<string, unknown>>
  by_agent: Array<{ key: string; calls: number; failed: number; tokens: number; cost: number }>
  by_provider: Array<{ key: string; calls: number; failed: number; tokens: number; cost: number }>
  by_action: Array<{ key: string; events: number }>
}

export type AgentHealth = {
  agent_slug: string
  model_calls: number
  failed_model_calls: number
  agent_runs: number
  failed_agent_runs: number
  estimated_cost_usd: number
  avg_latency_ms: number | null
  last_activity_at: string | null
  health_status: string
}

export type QualityReviewListItem = {
  id: number
  output_id: number
  version_id: number
  reviewer_slug: string
  status: string
  score: number
  passed: boolean
  review_mode: string
  llm_provider: string | null
  llm_model: string | null
  llm_error: string | null
  confidence: number | null
  summary: string
  created_at: string
}

export type InternalReport = {
  id: number
  title: string
  report_type: string
  brand_slug: string | null
  period_start: string | null
  period_end: string | null
  content: string
  summary: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type DocumentItem = {
  id: number
  brand_slug: string
  category: string
  filename: string
  content_type: string
  file_size: number
  status: string
  error: string | null
  created_at: string
}

export type DocumentChunk = {
  id: number
  document_id: number
  chunk_index: number
  content: string
  token_count: number
}

export type MemorySearchResult = {
  id: number
  kind: "document_chunk" | "memory_entry"
  document_id: number | null
  brand_slug: string
  category: string
  source_type: string
  title: string
  content: string
  score: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}
