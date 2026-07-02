from __future__ import annotations

import hashlib
import logging
import math

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_secret
from app.models import ProviderCredential

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 1536


def vector_to_sql(vector: list[float]) -> str:
    normalized = _fit_dimensions(vector)
    return "[" + ",".join(f"{value:.8f}" for value in normalized) + "]"


def _fit_dimensions(vector: list[float]) -> list[float]:
    if len(vector) == EMBEDDING_DIMENSIONS:
        return vector
    if len(vector) > EMBEDDING_DIMENSIONS:
        return vector[:EMBEDDING_DIMENSIONS]
    return [*vector, *([0.0] * (EMBEDDING_DIMENSIONS - len(vector)))]


def _local_embedding(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    tokens = [token for token in text.lower().split() if token]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


async def embed_text(db: AsyncSession, text: str) -> list[float]:
    result = await db.execute(
        select(ProviderCredential).where(
            ProviderCredential.provider == "openai_embeddings"
        )
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        result = await db.execute(
            select(ProviderCredential).where(ProviderCredential.provider == "openai")
        )
        credential = result.scalar_one_or_none()
    if credential is None or not credential.is_enabled or not credential.api_key_encrypted:
        return _local_embedding(text)

    api_key = decrypt_secret(credential.api_key_encrypted)
    base_url = (credential.base_url or "https://api.openai.com/v1").rstrip("/")
    model = credential.default_model or "text-embedding-3-small"
    payload = {"model": model, "input": text}
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Resiliência: se o provedor falhar/der timeout, degrada para o embedding local
    # (com aviso) em vez de propagar 500 e derrubar o fluxo que usa RAG.
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{base_url}/embeddings",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        logger.warning(
            "Embeddings via provedor '%s' falharam; usando embedding local (qualidade menor).",
            credential.provider,
            exc_info=True,
        )
        return _local_embedding(text)

    embedding = data["data"][0]["embedding"]
    if len(embedding) != EMBEDDING_DIMENSIONS:
        logger.warning(
            "Embedding do modelo '%s' tem dimensão %d, esperado %d; ajustando (pad/truncate).",
            model,
            len(embedding),
            EMBEDDING_DIMENSIONS,
        )
    return _fit_dimensions(embedding)
