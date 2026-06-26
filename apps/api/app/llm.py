from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from app.crypto import decrypt_secret
from app.metrics import (
    estimate_cost_usd,
    estimate_tokens_from_text,
    latency_ms,
    parse_anthropic_usage,
    parse_openai_usage,
    record_model_call,
)
from app.models import ProviderCredential


class LLMConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMResult:
    output: str
    provider: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    estimated_cost_usd: float | None = None
    latency_ms: int | None = None
    raw_usage: dict[str, Any] | None = None


def _api_key(credential: ProviderCredential) -> str:
    if not credential.api_key_encrypted:
        raise LLMConfigurationError(f"API key ausente para {credential.provider}.")
    return decrypt_secret(credential.api_key_encrypted)


def _chat_completions_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    if normalized == "https://openrouter.ai/api":
        normalized = "https://openrouter.ai/api/v1"
    if normalized == "https://openrouter.ai":
        normalized = "https://openrouter.ai/api/v1"
    return f"{normalized}/chat/completions"


def _messages_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if normalized.endswith("/v1/messages"):
        return normalized
    if normalized.endswith("/messages"):
        return normalized
    return f"{normalized}/v1/messages"


def _raise_provider_error(exc: httpx.HTTPStatusError) -> None:
    response_text = exc.response.text[:600]
    raise RuntimeError(
        f"Provider returned HTTP {exc.response.status_code}: {response_text}"
    ) from exc


async def call_llm(
    credential: ProviderCredential,
    model: str,
    system_prompt: str,
    user_prompt: str,
    use_web_search: bool = False,
    max_tokens: int | None = None,
    task_type: str = "llm",
    task_id: int | None = None,
    agent_slug: str | None = None,
    brand_slug: str | None = None,
) -> LLMResult:
    provider = credential.provider
    started_at = datetime.now(UTC)
    try:
        if provider == "openrouter":
            result = await _call_openai_compatible(
                credential=credential,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                base_url=credential.base_url or "https://openrouter.ai/api/v1",
                extra_headers={
                    "HTTP-Referer": "http://localhost:3000",
                    "X-OpenRouter-Title": "Duofy V1 Local",
                },
                use_web_search=use_web_search,
                max_tokens=max_tokens or 1200,
            )
        elif provider == "openai":
            result = await _call_openai_compatible(
                credential=credential,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                base_url=credential.base_url or "https://api.openai.com/v1",
                max_tokens=max_tokens or 1200,
            )
        elif provider == "anthropic":
            result = await _call_anthropic(
                credential, model, system_prompt, user_prompt, max_tokens=max_tokens or 1200
            )
        else:
            raise LLMConfigurationError(f"Provedor {provider} nao suporta execucao de agentes.")

        ended_at = datetime.now(UTC)
        input_tokens = result.input_tokens or estimate_tokens_from_text(
            f"{system_prompt}\n{user_prompt}"
        )
        output_tokens = result.output_tokens or estimate_tokens_from_text(result.output)
        total_tokens = result.total_tokens or input_tokens + output_tokens
        estimated_cost = estimate_cost_usd(
            provider=result.provider,
            model=result.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            raw_usage=result.raw_usage,
        )
        tracked_result = LLMResult(
            output=result.output,
            provider=result.provider,
            model=result.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated_cost,
            latency_ms=latency_ms(started_at, ended_at),
            raw_usage=result.raw_usage,
        )
        await record_model_call(
            task_type=task_type,
            task_id=task_id,
            agent_slug=agent_slug,
            brand_slug=brand_slug,
            provider=tracked_result.provider,
            model=tracked_result.model,
            input_tokens=tracked_result.input_tokens,
            output_tokens=tracked_result.output_tokens,
            total_tokens=tracked_result.total_tokens,
            estimated_cost_usd=tracked_result.estimated_cost_usd,
            latency_ms=tracked_result.latency_ms,
            status="completed",
            error=None,
            raw_usage=tracked_result.raw_usage,
        )
        return tracked_result
    except Exception as exc:
        ended_at = datetime.now(UTC)
        input_tokens = estimate_tokens_from_text(f"{system_prompt}\n{user_prompt}")
        await record_model_call(
            task_type=task_type,
            task_id=task_id,
            agent_slug=agent_slug,
            brand_slug=brand_slug,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=None,
            total_tokens=input_tokens,
            estimated_cost_usd=None,
            latency_ms=latency_ms(started_at, ended_at),
            status="failed",
            error=str(exc),
            raw_usage=None,
        )
        raise


async def _call_openai_compatible(
    credential: ProviderCredential,
    model: str,
    system_prompt: str,
    user_prompt: str,
    base_url: str,
    extra_headers: dict[str, str] | None = None,
    use_web_search: bool = False,
    max_tokens: int = 1200,
) -> LLMResult:
    headers = {
        "Authorization": f"Bearer {_api_key(credential)}",
        "Content-Type": "application/json",
        **(extra_headers or {}),
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    if credential.provider == "openrouter" and use_web_search:
        payload["tools"] = [{"type": "openrouter:web_search"}]

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(
                _chat_completions_url(base_url),
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            _raise_provider_error(exc)
        data = response.json()

    usage = parse_openai_usage(data)
    return LLMResult(
        output=data["choices"][0]["message"]["content"],
        provider=credential.provider,
        model=model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        total_tokens=usage.total_tokens,
        raw_usage=usage.raw_usage,
    )


async def _call_anthropic(
    credential: ProviderCredential,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 1200,
) -> LLMResult:
    headers = {
        "x-api-key": _api_key(credential),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    base_url = credential.base_url or "https://api.anthropic.com"

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(
                _messages_url(base_url),
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            _raise_provider_error(exc)
        data = response.json()

    usage = parse_anthropic_usage(data)
    output = "".join(part.get("text", "") for part in data.get("content", []))
    return LLMResult(
        output=output,
        provider=credential.provider,
        model=model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        total_tokens=usage.total_tokens,
        raw_usage=usage.raw_usage,
    )
