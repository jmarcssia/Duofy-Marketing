from __future__ import annotations

import hashlib
import logging
import math

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_secret
from app.models import ProviderCredential
from app.settings import get_settings

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 1536


class EmbeddingError(RuntimeError):
    """Falha ao gerar embedding real quando o fallback SHA256 está desabilitado."""


def _sha256_embedding_or_raise(text: str, *, reason: str) -> list[float]:
    """Retorna o embedding local SHA256, mas SÓ se o fallback estiver permitido.

    Com `ALLOW_SHA256_EMBEDDING_FALLBACK=false`, NUNCA gera embedding falso — falha de forma
    clara para não indexar/consultar como se estivesse tudo ok (F6)."""
    settings = get_settings()
    if not settings.allow_sha256_embedding_fallback:
        raise EmbeddingError(
            f"Embedding real indisponível ({reason}) e fallback SHA256 desabilitado. "
            "Habilite o provedor de embeddings ou defina ALLOW_SHA256_EMBEDDING_FALLBACK=true."
        )
    logger.warning("Embedding: usando fallback LOCAL SHA256 (não-semântico) — motivo: %s.", reason)
    return _local_embedding(text)


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


def _sentence_transformer_embedding(text: str) -> list[float]:
    """Embedding semântico local via sentence-transformers (ROADMAP — requer o pacote instalado).

    Não instalado por padrão (evita ~2GB de torch na imagem). Import lazy: se ausente, levanta
    para o chamador decidir (fallback controlado ou erro claro)."""
    from sentence_transformers import SentenceTransformer  # import lazy (opcional)

    settings = get_settings()
    model = _get_st_model(settings.local_embedding_model, SentenceTransformer)
    vector = model.encode(text, normalize_embeddings=True).tolist()
    logger.info("Embedding: sentence-transformers local (%s), dim=%d.",
                settings.local_embedding_model, len(vector))
    return _fit_dimensions(vector)


_ST_MODEL_CACHE: dict = {}


def _get_st_model(name: str, cls):
    if name not in _ST_MODEL_CACHE:
        _ST_MODEL_CACHE[name] = cls(name)
    return _ST_MODEL_CACHE[name]


async def embed_text(db: AsyncSession, text: str) -> list[float]:
    settings = get_settings()
    provider = settings.embeddings_provider

    if provider == "local_sentence_transformers":
        try:
            return _sentence_transformer_embedding(text)
        except Exception as exc:  # noqa: BLE001 - pacote ausente/erro de carga do modelo
            return _sha256_embedding_or_raise(text, reason=f"sentence-transformers: {exc}")

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
        return _sha256_embedding_or_raise(text, reason="nenhum provedor de embeddings habilitado")

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
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embeddings via provedor '%s' falharam: %s", credential.provider, exc)
        return _sha256_embedding_or_raise(text, reason=f"provedor '{credential.provider}' falhou")

    embedding = data["data"][0]["embedding"]
    if len(embedding) != EMBEDDING_DIMENSIONS:
        logger.warning(
            "Embedding do modelo '%s' tem dimensão %d, esperado %d; ajustando (pad/truncate).",
            model,
            len(embedding),
            EMBEDDING_DIMENSIONS,
        )
    return _fit_dimensions(embedding)
