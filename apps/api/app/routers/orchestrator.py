from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.briefing_service import (
    approve_briefing,
    create_blank_research_briefing,
    create_briefing,
    create_briefing_from_theme,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.llm import LLMConfigurationError
from app.models import Briefing, ResearchTheme, User
from app.research_models import allowed_research_model_ids, load_research_models
from app.schemas import (
    BriefingApproveRequest,
    BriefingApproveResponse,
    BriefingRead,
    PlanFromThemeRequest,
    PlanRequest,
    PlanResearchRequest,
    ResearchModelRead,
)

router = APIRouter(prefix="/api/orchestrator", tags=["orchestrator"])
models_router = APIRouter(prefix="/api/research-models", tags=["research-models"])


def _briefing_read(b: Briefing, *, direct_answer: str | None = None) -> BriefingRead:
    return BriefingRead(
        id=b.id, brand_slug=b.brand_slug, request_text=b.request_text, tipo=b.tipo,
        objetivo=b.objetivo, resumo_plano=b.resumo_plano, agente_alvo=b.agente_alvo,
        tema_sugerido=b.tema_sugerido, status=b.status, model_override=b.model_override,
        research_theme_id=b.research_theme_id, result_kind=b.result_kind, result_id=b.result_id,
        direct_answer=direct_answer or getattr(b, "_direct_answer", None),
    )


@models_router.get("", response_model=list[ResearchModelRead])
async def list_research_models(
    _current_user: Annotated[User, Depends(get_current_user)],
) -> list[ResearchModelRead]:
    return [
        ResearchModelRead(label=m["label"], model_id=m["model_id"]) for m in load_research_models()
    ]


@router.post("/plan", response_model=BriefingRead)
async def plan(
    payload: PlanRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    try:
        briefing = await create_briefing(
            db, user=current_user, prompt=payload.prompt, brand_slug=payload.brand_slug
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _briefing_read(briefing)


@router.post("/plan-from-theme", response_model=BriefingRead)
async def plan_from_theme(
    payload: PlanFromThemeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    theme = await db.get(ResearchTheme, payload.research_theme_id)
    if theme is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tema de pesquisa nao encontrado."
        )
    briefing = await create_briefing_from_theme(
        db, user=current_user, theme=theme, brand_slug=payload.brand_slug
    )
    return _briefing_read(briefing)


@router.post("/plan-research", response_model=BriefingRead)
async def plan_research(
    payload: PlanResearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    """Entrada 'Nova pesquisa': abre um briefing de pesquisa em branco (sem LLM)."""
    briefing = await create_blank_research_briefing(
        db, user=current_user, brand_slug=payload.brand_slug, theme=payload.theme
    )
    return _briefing_read(briefing)


@router.get("/briefings/{briefing_id}", response_model=BriefingRead)
async def get_briefing(
    briefing_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    b = await db.get(Briefing, briefing_id)
    if b is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Briefing nao encontrado."
        )
    return _briefing_read(b)


@router.post("/briefings/{briefing_id}/approve", response_model=BriefingApproveResponse)
async def approve(
    briefing_id: int,
    payload: BriefingApproveRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingApproveResponse:
    b = await db.get(Briefing, briefing_id)
    if b is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Briefing nao encontrado."
        )
    if b.status not in ("pending", "failed"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Briefing ja processado (status={b.status}).",
        )

    model_override = payload.model_override
    theme_override = payload.theme_override
    depth = payload.depth
    if b.tipo == "pesquisa":
        if model_override and model_override not in allowed_research_model_ids():
            raise HTTPException(
                status_code=422,  # Unprocessable Content
                detail="Modelo de pesquisa invalido (fora da lista permitida).",
            )
    else:
        model_override = None  # so pesquisa aceita override de modelo
        theme_override = None
        depth = None

    try:
        answer, kind, result_id = await approve_briefing(
            db,
            briefing=b,
            model_override=model_override,
            research_theme_id=payload.research_theme_id,
            theme_override=theme_override,
            depth=depth,
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - erro do provedor/coleta vira mensagem legivel na UI
        # A pesquisa faz rollback das mutacoes na falha; o briefing continua 'pending'
        # (retryavel). Devolvemos a causa real em vez de um 500 sem CORS ("Failed to fetch").
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao executar a pesquisa: {str(exc)[:300]}",
        ) from exc

    return BriefingApproveResponse(
        briefing=_briefing_read(b), answer=answer, result_kind=kind, result_id=result_id
    )
