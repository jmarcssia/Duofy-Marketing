from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class ServiceHealth(BaseModel):
    status: Literal["ok", "error"]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    services: dict[str, ServiceHealth]


class UserRead(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: Literal["admin", "manager"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead


class LogoutResponse(BaseModel):
    status: Literal["ok"]


class BrandRead(BaseModel):
    id: int
    name: str
    slug: str
    niche: str
    description: str


class AgentRead(BaseModel):
    id: int
    name: str
    slug: str
    default_model: str
    is_active: bool


class ProviderCredentialRead(BaseModel):
    provider: str
    display_name: str
    base_url: str | None
    default_model: str | None
    is_enabled: bool
    has_api_key: bool
    masked_api_key: str | None


class ProviderCredentialUpdate(BaseModel):
    provider: Literal["openrouter", "anthropic", "openai", "openai_embeddings", "apify"]
    display_name: str
    api_key: str | None = Field(default=None, min_length=8)
    base_url: str | None = None
    default_model: str | None = None
    is_enabled: bool = False


class QualitySettingsRead(BaseModel):
    review_mode: Literal["local_only", "hybrid", "llm_required"] = "hybrid"
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None


class QualitySettingsUpdate(BaseModel):
    review_mode: Literal["local_only", "hybrid", "llm_required"] = "hybrid"
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = Field(default=None, max_length=255)


class AgentSettingsRead(BaseModel):
    token_budgets: dict[str, int]
    research_depth: dict[str, dict[str, int]]


class AgentSettingsUpdate(BaseModel):
    token_budgets: dict[str, int]
    research_depth: dict[str, dict[str, int]]


class AgentRunRequest(BaseModel):
    agent_slug: str
    prompt: str = Field(min_length=3)
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None
    brand_slug: str | None = None


class AgentRunStatusUpdate(BaseModel):
    status: Literal["completed", "approved", "needs_adjustment", "rejected", "failed"]


class AgentRunResponse(BaseModel):
    id: int
    agent_slug: str
    provider: str
    model: str
    prompt: str
    output: str
    status: str
    error: str | None


class ChatSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    brand_slug: str | None = Field(default=None, max_length=120)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=2)
    brand_slug: str | None = Field(default=None, max_length=120)


class AgentLogRead(BaseModel):
    id: int
    task_id: int
    level: str
    message: str
    metadata_json: dict | None
    created_at: datetime


class AgentTaskRead(BaseModel):
    id: int
    session_id: int | None
    user_id: int | None
    brand_slug: str | None
    task_type: str
    status: str
    input: str
    result: str
    output_type: str | None
    output_id: int | None
    celery_task_id: str | None
    error: str | None
    metadata_json: dict | None
    created_at: datetime
    updated_at: datetime
    logs: list[AgentLogRead] = Field(default_factory=list)


class ChatMessageRead(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    agent_task_id: int | None
    metadata_json: dict | None
    created_at: datetime


class ChatSessionRead(BaseModel):
    id: int
    user_id: int
    title: str
    brand_slug: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetail(ChatSessionRead):
    messages: list[ChatMessageRead]


class ChatMessageResponse(BaseModel):
    message: ChatMessageRead
    task: AgentTaskRead


class ContentGenerateRequest(BaseModel):
    brand_slug: str
    category: str = Field(default="general", min_length=2, max_length=120)
    channel: str = Field(min_length=2, max_length=80)
    format: str = Field(min_length=2, max_length=80)
    briefing: str = Field(min_length=10)
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None
    status: Literal["draft", "review"] = "draft"


class ContentRefineRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=2000)


class ContentThemeRead(BaseModel):
    id: int
    title: str
    theme: str
    brand_slug: str | None = None
    audience: str | None = None
    kind: str | None = None
    owner: str | None = None
    status: str | None = None


class ContentThemeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    theme: str = Field(default="", max_length=2000)
    brand_slug: str | None = Field(default=None, max_length=120)
    audience: str | None = Field(default=None, max_length=255)
    kind: str | None = Field(default=None, max_length=120)
    owner: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, max_length=80)


class ThemeImportResult(BaseModel):
    parsed: int
    inserted: int
    skipped: int


class ResearchThemeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    brand_slug: str | None = Field(default=None, max_length=120)


class ResearchThemeRead(BaseModel):
    id: int
    title: str
    notes: str | None = None
    brand_slug: str | None = None


class ResearchModelRead(BaseModel):
    label: str
    model_id: str


class PlanRequest(BaseModel):
    prompt: str = Field(min_length=2)
    brand_slug: str | None = Field(default=None, max_length=120)


class PlanFromThemeRequest(BaseModel):
    research_theme_id: int
    brand_slug: str | None = Field(default=None, max_length=120)


class PlanResearchRequest(BaseModel):
    brand_slug: str | None = Field(default=None, max_length=120)
    theme: str | None = Field(default=None, max_length=255)


class BriefingApproveRequest(BaseModel):
    model_override: str | None = Field(default=None, max_length=120)
    research_theme_id: int | None = None
    theme_override: str | None = Field(default=None, max_length=255)
    depth: Literal["quick", "deep"] | None = None


class BriefingRead(BaseModel):
    id: int
    brand_slug: str | None = None
    request_text: str
    tipo: str
    objetivo: str
    resumo_plano: str
    agente_alvo: str | None = None
    tema_sugerido: str | None = None
    status: str
    model_override: str | None = None
    research_theme_id: int | None = None
    result_kind: str | None = None
    result_id: int | None = None
    direct_answer: str | None = None  # preenchido quando tipo == "conversa"


class BriefingApproveResponse(BaseModel):
    briefing: BriefingRead
    answer: str
    result_kind: str | None = None
    result_id: int | None = None


class ContentOutputUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    content: str | None = Field(default=None, min_length=1)
    status: Literal[
        "draft",
        "review",
        "approved",
        "needs_adjustment",
        "rejected",
        "archived",
    ] | None = None
    editor_note: str | None = None


class ContentOutputRead(BaseModel):
    id: int
    brand_slug: str
    category: str
    channel: str
    format: str
    title: str
    briefing: str
    status: str
    provider: str
    model: str
    agent_run_id: int | None
    current_version_id: int | None
    current_version_number: int | None
    current_content: str
    document_type: str
    document_sections: list[str] = Field(default_factory=list)
    quality_notes: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ContentOutputVersionRead(BaseModel):
    id: int
    output_id: int
    version_number: int
    content: str
    editor_note: str | None
    created_at: datetime


class QualityReviewRead(BaseModel):
    id: int
    output_id: int
    version_id: int
    agent_run_id: int | None
    reviewer_slug: str
    status: str
    score: int
    passed: bool
    summary: str
    critical_failures: list[str] = Field(default_factory=list)
    required_fixes: list[str] = Field(default_factory=list)
    optional_improvements: list[str] = Field(default_factory=list)
    verified_sources: list[str] = Field(default_factory=list)
    raw_report: str
    review_mode: str = "local_only"
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_error: str | None = None
    confidence: float | None = None
    created_at: datetime


class QualityReviewRequest(BaseModel):
    mode: Literal["local_only", "hybrid", "llm_required"] | None = None
    force: bool = True


class ContentOutputDetail(ContentOutputRead):
    versions: list[ContentOutputVersionRead]
    latest_quality_review: QualityReviewRead | None = None


class OutputActionRequest(BaseModel):
    feedback: str | None = Field(default=None, max_length=4000)


class OutputMoveRequest(BaseModel):
    status: Literal["draft", "review", "approved", "needs_adjustment", "rejected", "archived"]


class OutputCommentCreate(BaseModel):
    version_id: int | None = None
    anchor_text: str | None = Field(default=None, max_length=500)
    selected_text: str | None = Field(default=None, max_length=4000)
    comment: str = Field(min_length=2, max_length=4000)


class OutputCommentUpdate(BaseModel):
    comment: str | None = Field(default=None, min_length=2, max_length=4000)
    status: Literal["open", "resolved"] | None = None


class OutputCommentRead(BaseModel):
    id: int
    output_id: int
    version_id: int | None
    user_id: int | None
    user_name: str | None
    anchor_text: str | None
    selected_text: str | None
    comment: str
    status: str
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class OutputVersionDiffLine(BaseModel):
    change_type: Literal["added", "removed", "unchanged"]
    old_line_number: int | None
    new_line_number: int | None
    content: str


class OutputVersionCompareRead(BaseModel):
    output_id: int
    from_version: ContentOutputVersionRead
    to_version: ContentOutputVersionRead
    lines: list[OutputVersionDiffLine]


class OutputReformatLegacyRequest(BaseModel):
    status: Literal["draft", "review", "rejected"] | None = None
    brand_slug: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=50, ge=1, le=200)


class OutputReformatLegacyResponse(BaseModel):
    checked: int
    reformatted: int
    skipped: int


class OutputRepairFormattingRequest(BaseModel):
    status: Literal["draft", "review", "needs_adjustment", "rejected"] | None = None
    brand_slug: str | None = Field(default=None, max_length=120)
    output_id: int | None = Field(default=None, ge=1)
    limit: int = Field(default=50, ge=1, le=200)


class OutputRepairFormattingResponse(BaseModel):
    checked: int
    repaired: int
    skipped: int


class OutputWorkflowDetail(ContentOutputDetail):
    approved_memory_id: int | None = None
    temporary_learning_id: int | None = None
    latest_feedback: str | None = None


class ResearchRunRequest(BaseModel):
    brand_slug: str
    theme: str = Field(min_length=3, max_length=255)
    period: str = Field(default="ultimos 30 dias", min_length=3, max_length=80)
    depth: Literal["quick", "standard", "deep"] = "standard"
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None
    source_urls: list[str] = Field(default_factory=list, max_length=8)
    use_apify: bool = False


class ResearchSourceRead(BaseModel):
    id: int
    output_id: int
    title: str
    url: str
    publisher: str | None
    published_at: str | None
    accessed_at: datetime
    reliability: str
    source_kind: str
    status: str
    evidence: str
    error: str | None


class ResearchReportRead(ContentOutputRead):
    sources: list[ResearchSourceRead]


class ResearchMemoryResponse(BaseModel):
    memory_entry_id: int
    title: str


class ResearchContentBriefingResponse(BaseModel):
    brand_slug: str
    category: str
    channel: str
    format: str
    briefing: str


# Estados do evento: legados (planned/in_progress/completed) + workflow V1.
CalendarEventStatus = Literal[
    "draft",
    "briefing_incomplete",
    "ready",
    "planned",
    "scheduled",
    "in_progress",
    "running",
    "awaiting_approval",
    "approved",
    "completed",
    "cancelled",
    "failed",
]
CalendarExecutionMode = Literal["manual", "auto"]


class CalendarEventCreate(BaseModel):
    brand_slug: str = Field(min_length=2, max_length=120)
    category: str = Field(default="general", min_length=2, max_length=120)
    title: str = Field(min_length=2, max_length=255)
    description: str = ""
    event_type: str = Field(default="content", min_length=2, max_length=80)
    status: CalendarEventStatus = "draft"
    channel: str | None = Field(default=None, max_length=80)
    format: str | None = Field(default=None, max_length=80)
    start_at: datetime
    end_at: datetime | None = None
    assigned_agent_slug: str | None = Field(default=None, max_length=120)
    execution_payload: dict | None = None
    # Workflow V1
    objective: str = ""
    execution_mode: CalendarExecutionMode = "manual"
    auto_execute_at: datetime | None = None
    requires_research_approval: bool = True
    briefing_id: int | None = None


class CalendarEventUpdate(BaseModel):
    brand_slug: str | None = Field(default=None, min_length=2, max_length=120)
    category: str | None = Field(default=None, min_length=2, max_length=120)
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    event_type: str | None = Field(default=None, min_length=2, max_length=80)
    status: CalendarEventStatus | None = None
    channel: str | None = Field(default=None, max_length=80)
    format: str | None = Field(default=None, max_length=80)
    start_at: datetime | None = None
    end_at: datetime | None = None
    assigned_agent_slug: str | None = Field(default=None, max_length=120)
    execution_payload: dict | None = None
    # Workflow V1
    objective: str | None = None
    execution_mode: CalendarExecutionMode | None = None
    auto_execute_at: datetime | None = None
    requires_research_approval: bool | None = None


class CalendarEventRead(BaseModel):
    id: int
    brand_slug: str
    category: str
    title: str
    description: str
    event_type: str
    status: str
    channel: str | None
    format: str | None
    start_at: datetime
    end_at: datetime | None
    assigned_agent_slug: str | None
    execution_payload: dict | None
    output_id: int | None
    agent_run_id: int | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
    # Workflow V1
    objective: str = ""
    execution_mode: str = "manual"
    auto_execute_at: datetime | None = None
    requires_research_approval: bool = True
    current_step: str = "briefing"
    research_output_id: int | None = None
    content_output_id: int | None = None
    briefing_id: int | None = None
    agent_task_id: int | None = None
    created_by: int | None = None
    is_paused: bool = False
    publish_status: str = "not_published"
    published_at: datetime | None = None
    publish_target: str | None = None
    publish_ref: str | None = None


class CalendarStep(BaseModel):
    key: str
    label: str
    status: Literal["done", "current", "pending", "locked"]
    detail: str | None = None


class CalendarAttempt(BaseModel):
    """Tentativa de execucao (derivada de AgentTask, nao duplicada)."""

    id: int
    kind: str  # research | content
    trigger: str  # manual | auto
    status: str
    output_id: int | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class CalendarEventDetail(CalendarEventRead):
    """Read + pipeline derivado (nao persistido) e gate de aprovacao da pesquisa."""

    steps: list[CalendarStep] = Field(default_factory=list)
    research_output_status: str | None = None
    research_approved: bool = False
    cocreation_unlocked: bool = False
    content_output_status: str | None = None
    content_approved: bool = False
    history: list[CalendarAttempt] = Field(default_factory=list)


class CalendarGenerateRequest(BaseModel):
    brand_slug: str = Field(min_length=2, max_length=120)
    category: str = Field(default="general", min_length=2, max_length=120)
    objective: str = Field(min_length=10)
    period_start: datetime
    period_end: datetime
    channels: list[str] = Field(default_factory=list, max_length=8)
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None


class PressGenerateRequest(BaseModel):
    brand_slug: str = Field(min_length=2, max_length=120)
    category: str = Field(default="general", min_length=2, max_length=120)
    format: Literal["press_release", "pauta", "comunicado", "editorial_angle", "approach"] = (
        "pauta"
    )
    briefing: str = Field(min_length=10)
    event_id: int | None = None
    provider: Literal["openrouter", "anthropic", "openai"] | None = None
    model: str | None = None
    status: Literal["draft", "review"] = "draft"


class ModelCallRead(BaseModel):
    id: int
    task_type: str
    task_id: int | None
    agent_slug: str | None
    brand_slug: str | None
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    estimated_cost_usd: float | None
    latency_ms: int | None
    status: str
    error: str | None
    created_at: datetime


class AuditEventRead(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    entity_type: str
    entity_id: int | None
    action: str
    status: str
    brand_slug: str | None
    agent_slug: str | None
    summary: str
    metadata_json: dict | None
    created_at: datetime


class MetricsSummary(BaseModel):
    total_calls: int
    completed_calls: int
    failed_calls: int
    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    avg_latency_ms: float | None
    by_provider: list[dict]
    by_agent: list[dict]
    by_model: list[dict]


class OperationsSummary(BaseModel):
    total_model_calls: int
    failed_model_calls: int
    estimated_cost_usd: float
    avg_latency_ms: float | None
    total_agent_runs: int
    failed_agent_runs: int
    total_quality_reviews: int
    failed_quality_reviews: int
    avg_quality_score: float | None
    total_decisions: int
    audit_events: int
    recent_errors: list[dict] = Field(default_factory=list)
    by_agent: list[dict] = Field(default_factory=list)
    by_provider: list[dict] = Field(default_factory=list)
    by_action: list[dict] = Field(default_factory=list)


class AgentHealthRead(BaseModel):
    agent_slug: str
    model_calls: int
    failed_model_calls: int
    agent_runs: int
    failed_agent_runs: int
    estimated_cost_usd: float
    avg_latency_ms: float | None
    last_activity_at: datetime | None
    health_status: str


class QualityReviewListItem(BaseModel):
    id: int
    output_id: int
    version_id: int
    reviewer_slug: str
    status: str
    score: int
    passed: bool
    review_mode: str
    llm_provider: str | None
    llm_model: str | None
    llm_error: str | None
    confidence: float | None
    summary: str
    created_at: datetime


class ReportGenerateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    report_type: str = Field(default="internal_metrics", min_length=2, max_length=80)
    brand_slug: str | None = Field(default=None, max_length=120)
    period_start: datetime | None = None
    period_end: datetime | None = None


class ReportRead(BaseModel):
    id: int
    title: str
    report_type: str
    brand_slug: str | None
    period_start: datetime | None
    period_end: datetime | None
    content: str
    summary: dict | None
    created_at: datetime
    updated_at: datetime


class DocumentRead(BaseModel):
    id: int
    brand_slug: str
    category: str
    filename: str
    content_type: str
    file_size: int
    status: str
    error: str | None
    created_at: datetime


class DocumentChunkRead(BaseModel):
    id: int
    document_id: int
    chunk_index: int
    content: str
    token_count: int


class MemoryEntryRead(BaseModel):
    id: int
    brand_slug: str
    category: str
    source_type: str
    title: str
    content: str
    created_at: datetime


class MemorySearchRequest(BaseModel):
    query: str = Field(min_length=3)
    brand_slug: str | None = None
    category: str | None = None
    source_type: str | None = None
    limit: int = Field(default=8, ge=1, le=20)


class MemorySearchResult(BaseModel):
    id: int
    kind: Literal["document_chunk", "memory_entry"]
    document_id: int | None = None
    brand_slug: str
    category: str
    source_type: str
    title: str
    content: str
    score: float


# ---------------------------------------------------------------------------
# Cocriacao (agente de co-criacao) — pacote estruturado de conteudo
# ---------------------------------------------------------------------------

class CreationRequest(BaseModel):
    brand_slug: str = Field(min_length=1, max_length=120)
    theme: str = Field(min_length=2, max_length=2000)
    channel: str = Field(default="Instagram", max_length=80)
    format: str = Field(default="Carrossel", max_length=80)
    category: str = Field(default="content_generation", max_length=120)
    persona: str | None = Field(default=None, max_length=255)
    objetivo: str | None = Field(default=None, max_length=500)
    cta: str | None = Field(default=None, max_length=255)
    slides: int | None = Field(default=None, ge=3, le=12)
    depth: Literal["quick", "deep"] = "quick"
    tone: str | None = Field(default=None, max_length=255)
    observacoes: str | None = Field(default=None, max_length=4000)
    research_output_id: int | None = None
    previous_content: str | None = Field(default=None, max_length=20000)
    status: str = Field(default="draft", max_length=40)
    model: str | None = Field(default=None, max_length=120)
    provider: str | None = Field(default=None, max_length=40)


class VisualDirection(BaseModel):
    conceito: str = ""
    estilo: str = ""
    cenario: str = ""
    enquadramento: str = ""
    composicao: str = ""
    iluminacao: str = ""
    paleta: str = ""
    tipografia: str = ""
    restricoes: str = ""


class ContentSlide(BaseModel):
    numero: int
    funcao: str = ""
    texto: str = ""
    texto_arte: str = ""  # texto exato da arte (fora do prompt), curto e legivel
    image_prompt: str = ""  # prompt COMPLETO e INDEPENDENTE (sem logo/@/#)
    alt_text: str = ""


class ContentPackage(BaseModel):
    brand_slug: str
    channel: str
    format: str
    persona: str = ""
    objetivo: str = ""
    etapa_funil: str = ""
    analise_estrategica: str = ""
    conceito: str = ""
    arco_narrativo: str = ""
    cta: str = ""
    captions: dict[str, str] = Field(default_factory=dict)  # por canal; instagram != linkedin
    slides: list[ContentSlide] = Field(default_factory=list)
    visual_direction: VisualDirection = Field(default_factory=VisualDirection)
    factualidade: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)


class ContentPackageResponse(BaseModel):
    output_id: int
    version_number: int
    status: str
    package: ContentPackage
    content_markdown: str
    warnings: list[str] = Field(default_factory=list)


class CocreationRefineRequest(BaseModel):
    target: Literal["caption", "slide", "cta", "visual", "tone", "shorten", "persona"]
    channel: str | None = Field(default=None, max_length=80)
    slide_number: int | None = Field(default=None, ge=1, le=12)
    instruction: str | None = Field(default=None, max_length=2000)
    model: str | None = Field(default=None, max_length=120)
    provider: str | None = Field(default=None, max_length=40)
