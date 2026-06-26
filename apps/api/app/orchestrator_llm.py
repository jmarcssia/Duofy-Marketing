from __future__ import annotations

from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_openai import ChatOpenAI

from app.crypto import decrypt_secret
from app.metrics import (
    estimate_cost_usd,
    record_model_call,
)
from app.models import ProviderCredential

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class ModelCallTracker(AsyncCallbackHandler):
    def __init__(
        self,
        *,
        task_id: int | None,
        agent_slug: str | None,
        brand_slug: str | None,
        provider: str,
        model: str,
    ) -> None:
        self.task_id = task_id
        self.agent_slug = agent_slug
        self.brand_slug = brand_slug
        self.provider = provider
        self.model = model

    async def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        usage = (response.llm_output or {}).get("token_usage", {}) or {}
        input_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")
        estimated = estimate_cost_usd(
            provider=self.provider,
            model=self.model,
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
            raw_usage=usage,
        )
        await record_model_call(
            task_type="orchestrator",
            task_id=self.task_id,
            agent_slug=self.agent_slug,
            brand_slug=self.brand_slug,
            provider=self.provider,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated,
            latency_ms=None,
            status="completed",
            error=None,
            raw_usage=usage or None,
        )

    async def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        await record_model_call(
            task_type="orchestrator",
            task_id=self.task_id,
            agent_slug=self.agent_slug,
            brand_slug=self.brand_slug,
            provider=self.provider,
            model=self.model,
            input_tokens=None,
            output_tokens=None,
            total_tokens=None,
            estimated_cost_usd=None,
            latency_ms=None,
            status="failed",
            error=str(error),
            raw_usage=None,
        )


def build_orchestrator_chat_model(
    credential: ProviderCredential,
    model: str,
    *,
    task_id: int,
    brand_slug: str | None,
) -> ChatOpenAI:
    api_key = decrypt_secret(credential.api_key_encrypted)
    base_url = credential.base_url or OPENROUTER_BASE_URL
    tracker = ModelCallTracker(
        task_id=task_id,
        agent_slug="orchestrator",
        brand_slug=brand_slug,
        provider=credential.provider,
        model=model,
    )
    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0.3,
        max_tokens=1200,
        callbacks=[tracker],
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Duofy V1 Local",
        },
    )
