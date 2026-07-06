from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import assert_brand_access
from app.cocreation_service import (
    generate_content_package,
    refine_content_package,
)
from app.db import get_db
from app.dependencies import get_current_user
from app.llm import LLMConfigurationError
from app.models import Output, OutputVersion, User
from app.schemas import (
    CocreationRefineRequest,
    ContentPackage,
    ContentPackageResponse,
    CreationRequest,
)

router = APIRouter(prefix="/api/cocreation", tags=["cocreation"])


def _response(
    output: Output, version: OutputVersion, package: ContentPackage, warnings: list[str]
) -> ContentPackageResponse:
    return ContentPackageResponse(
        output_id=output.id,
        version_number=version.version_number,
        status=output.status,
        package=package,
        content_markdown=version.content,
        warnings=warnings,
    )


@router.post("/generate", response_model=ContentPackageResponse)
async def generate(
    payload: CreationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPackageResponse:
    assert_brand_access(current_user, payload.brand_slug)  # C1
    try:
        output, version, package, warnings = await generate_content_package(db, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - erro do provedor vira mensagem legivel
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao cocriar conteudo: {str(exc)[:300]}",
        ) from exc
    return _response(output, version, package, warnings)


@router.post("/{output_id}/refine", response_model=ContentPackageResponse)
async def refine(
    output_id: int,
    payload: CocreationRefineRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPackageResponse:
    existing = await db.get(Output, output_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conteudo nao encontrado."
        )
    assert_brand_access(current_user, existing.brand_slug)  # C1
    try:
        output, version, package, warnings = await refine_content_package(db, output_id, payload)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao refinar: {str(exc)[:300]}",
        ) from exc
    return _response(output, version, package, warnings)


@router.get("/{output_id}", response_model=ContentPackageResponse)
async def get_package(
    output_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContentPackageResponse:
    import json

    output = await db.get(Output, output_id)
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conteudo nao encontrado."
        )
    assert_brand_access(current_user, output.brand_slug)  # C1
    version = (
        await db.get(OutputVersion, output.current_version_id)
        if output.current_version_id else None
    )
    if version is None or not version.structured_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este conteudo nao tem pacote estruturado.",
        )
    package = ContentPackage.model_validate(json.loads(version.structured_json))
    return _response(output, version, package, [])
