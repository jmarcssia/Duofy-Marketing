"""Carrega regras de maquina por agente de config/rules/agent_rules.yaml."""

from __future__ import annotations

import logging

import yaml

from app.agent_config import read_config_text

logger = logging.getLogger(__name__)

_DEFAULT_MIN_SOURCES = {"quick": 3, "deep": 5}


def get_agent_rules(agent_slug: str) -> dict:
    try:
        data = yaml.safe_load(read_config_text("rules", "agent_rules.yaml")) or {}
    except Exception as exc:  # noqa: BLE001 - config ausente cai para vazio
        logger.warning("agent_rules.yaml indisponivel: %s", exc)
        return {}
    rules = data.get(agent_slug)
    return rules if isinstance(rules, dict) else {}


def min_sources_for(agent_slug: str, depth: str) -> int:
    rules = get_agent_rules(agent_slug)
    table = rules.get("min_sources") if isinstance(rules.get("min_sources"), dict) else {}
    value = table.get(depth)
    if isinstance(value, int) and 1 <= value <= 50:
        return value
    return _DEFAULT_MIN_SOURCES.get(depth, 3)


def required_sections_for(agent_slug: str, channel: str | None = None) -> list[str]:
    rules = get_agent_rules(agent_slug)
    req = rules.get("required_sections")
    if isinstance(req, list):
        return [str(s) for s in req]
    if isinstance(req, dict):
        # content_agent: por canal com fallback "default"
        key = (channel or "").lower()
        for candidate in (key, "default"):
            if isinstance(req.get(candidate), list):
                return [str(s) for s in req[candidate]]
    return []


def forbidden_terms_for(agent_slug: str) -> list[str]:
    rules = get_agent_rules(agent_slug)
    terms = rules.get("forbidden")
    return [str(t) for t in terms] if isinstance(terms, list) else []


def citation_required_for(agent_slug: str) -> bool:
    return bool(get_agent_rules(agent_slug).get("citation_required", False))
