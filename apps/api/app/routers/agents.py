from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import assert_brand_access
from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.llm import LLMConfigurationError
from app.models import AgentRun, User
from app.orchestrator import run_agent
from app.schemas import AgentRunRequest, AgentRunResponse, AgentRunStatusUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _run_response(run: AgentRun) -> AgentRunResponse:
    return AgentRunResponse(
        id=run.id,
        agent_slug=run.agent_slug,
        provider=run.provider,
        model=run.model,
        prompt=run.prompt,
        output=run.output,
        status=run.status,
        error=run.error,
    )


@router.post("/run", response_model=AgentRunResponse)
async def execute_agent(
    payload: AgentRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentRunResponse:
    assert_brand_access(current_user, payload.brand_slug)
    try:
        run = await run_agent(
            db=db,
            agent_slug=payload.agent_slug,
            prompt=payload.prompt,
            provider_override=payload.provider,
            model_override=payload.model,
            brand_slug=payload.brand_slug,
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await record_audit_event(
        db,
        user=current_user,
        action="agent_run.created",
        entity_type="agent_run",
        entity_id=run.id,
        status=run.status,
        brand_slug=payload.brand_slug,
        agent_slug=run.agent_slug,
        summary=f"Agente {run.agent_slug} executado.",
        metadata={"provider": run.provider, "model": run.model},
    )
    await db.commit()
    return _run_response(run)


@router.get("/runs", response_model=list[AgentRunResponse])
async def list_agent_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    agent_slug: str | None = None,
    provider: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    query: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AgentRunResponse]:
    # NOTA (C1): AgentRun não tem coluna brand_slug, então a lista não é filtrável por marca
    # sem alteração de schema (débito rastreado). A superfície sensível — exfiltração de RAG
    # de outra marca — é fechada no /run (assert de marca acima). Esta lista é diagnóstica.
    statement = select(AgentRun)
    if agent_slug:
        statement = statement.where(AgentRun.agent_slug == agent_slug)
    if provider:
        statement = statement.where(AgentRun.provider == provider)
    if status_filter:
        statement = statement.where(AgentRun.status == status_filter)
    if query:
        like_query = f"%{query}%"
        statement = statement.where(
            AgentRun.prompt.ilike(like_query) | AgentRun.output.ilike(like_query)
        )
    statement = statement.order_by(AgentRun.created_at.desc()).limit(limit)

    result = await db.execute(statement)
    return [_run_response(run) for run in result.scalars().all()]


@router.patch("/runs/{run_id}/status", response_model=AgentRunResponse)
async def update_agent_run_status(
    run_id: int,
    payload: AgentRunStatusUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentRunResponse:
    result = await db.execute(select(AgentRun).where(AgentRun.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execucao de agente nao encontrada.",
        )

    run.status = payload.status
    await record_audit_event(
        db,
        user=current_user,
        action="agent_run.status_updated",
        entity_type="agent_run",
        entity_id=run.id,
        status=payload.status,
        agent_slug=run.agent_slug,
        summary=f"Status da execução {run.id} atualizado para {payload.status}.",
    )
    await db.commit()
    await db.refresh(run)
    return _run_response(run)
