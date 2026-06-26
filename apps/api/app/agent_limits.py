from __future__ import annotations

import json
import logging

import yaml

from app.agent_config import read_config_text
from app.routers.admin import _setting_value

logger = logging.getLogger(__name__)

AGENT_TOKEN_BUDGETS_KEY = "agent_token_budgets"
RESEARCH_DEPTH_LIMITS_KEY = "research_depth_limits"

_FALLBACK_BUDGET = 1500
_FALLBACK_DEPTH = {"sources": 8, "excerpt": 1800}


def _config() -> dict:
    try:
        return yaml.safe_load(read_config_text("rules", "agent_limits.yaml")) or {}
    except Exception as exc:  # noqa: BLE001 - config ausente/inválida cai para fallback
        logger.warning("agent_limits.yaml indisponível: %s", exc)
        return {}


def _db_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


async def get_token_budget(db, agent_slug: str) -> int:
    cfg = _config().get("token_budgets", {})
    db_map = _db_json(await _setting_value(db, AGENT_TOKEN_BUDGETS_KEY))
    for source in (db_map, cfg):
        raw = source.get(agent_slug, source.get("default"))
        if isinstance(raw, int) and 256 <= raw <= 32000:
            return raw
    return _FALLBACK_BUDGET


async def get_research_depth_limits(db, depth: str) -> dict:
    cfg = _config().get("research_depth", {})
    db_map = _db_json(await _setting_value(db, RESEARCH_DEPTH_LIMITS_KEY))
    for source in (db_map, cfg):
        entry = source.get(depth) or source.get("quick")
        if isinstance(entry, dict):
            sources = entry.get("sources")
            excerpt = entry.get("excerpt")
            valid_sources = isinstance(sources, int) and 1 <= sources <= 30
            valid_excerpt = isinstance(excerpt, int) and 500 <= excerpt <= 20000
            if valid_sources and valid_excerpt:
                return {"sources": sources, "excerpt": excerpt}
    return dict(_FALLBACK_DEPTH)
