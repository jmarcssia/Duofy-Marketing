from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from app.db import AsyncSessionLocal
from app.models import ModelCall


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    raw_usage: dict[str, Any] | None


def estimate_tokens_from_text(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return max(1, int(len(stripped.split()) * 1.35))


def parse_openai_usage(data: dict[str, Any]) -> TokenUsage:
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    input_tokens = usage.get("prompt_tokens") or usage.get("input_tokens")
    output_tokens = usage.get("completion_tokens") or usage.get("output_tokens")
    total_tokens = usage.get("total_tokens")
    return TokenUsage(
        input_tokens=int(input_tokens) if input_tokens is not None else None,
        output_tokens=int(output_tokens) if output_tokens is not None else None,
        total_tokens=int(total_tokens) if total_tokens is not None else None,
        raw_usage=usage or None,
    )


def parse_anthropic_usage(data: dict[str, Any]) -> TokenUsage:
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    input_tokens = usage.get("input_tokens")
    output_tokens = usage.get("output_tokens")
    total = None
    if input_tokens is not None or output_tokens is not None:
        total = int(input_tokens or 0) + int(output_tokens or 0)
    return TokenUsage(
        input_tokens=int(input_tokens) if input_tokens is not None else None,
        output_tokens=int(output_tokens) if output_tokens is not None else None,
        total_tokens=total,
        raw_usage=usage or None,
    )


def _repo_roots() -> list[Path]:
    current = Path.cwd()
    return [current, *current.parents]


def _pricing_config() -> dict[str, Any]:
    for root in _repo_roots():
        candidate = root / "config" / "rules" / "model_pricing.yaml"
        if candidate.exists():
            data = yaml.safe_load(candidate.read_text(encoding="utf-8")) or {}
            return data if isinstance(data, dict) else {}
    return {}


def estimate_cost_usd(
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    raw_usage: dict[str, Any] | None,
) -> float | None:
    if raw_usage:
        for key in ("cost", "total_cost", "cost_usd", "estimated_cost"):
            value = raw_usage.get(key)
            if isinstance(value, int | float):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    pass

    config = _pricing_config()
    model_prices = (config.get("models") or {}).get(model)
    provider_prices = (config.get("defaults") or {}).get(provider)
    prices = model_prices or provider_prices
    if not prices:
        return None

    input_price = float(prices.get("input_per_1m") or 0)
    output_price = float(prices.get("output_per_1m") or 0)
    input_cost = ((input_tokens or 0) / 1_000_000) * input_price
    output_cost = ((output_tokens or 0) / 1_000_000) * output_price
    return round(input_cost + output_cost, 8)


async def record_model_call(
    *,
    task_type: str,
    task_id: int | None,
    agent_slug: str | None,
    brand_slug: str | None,
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    total_tokens: int | None,
    estimated_cost_usd: float | None,
    latency_ms: int | None,
    status: str,
    error: str | None,
    raw_usage: dict[str, Any] | None,
) -> None:
    async with AsyncSessionLocal() as db:
        db.add(
            ModelCall(
                task_type=task_type,
                task_id=task_id,
                agent_slug=agent_slug,
                brand_slug=brand_slug,
                provider=provider,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                estimated_cost_usd=estimated_cost_usd,
                latency_ms=latency_ms,
                status=status,
                error=error,
                raw_usage=raw_usage,
            )
        )
        await db.commit()


def latency_ms(started_at: datetime, ended_at: datetime) -> int:
    return max(0, int((ended_at - started_at).total_seconds() * 1000))
