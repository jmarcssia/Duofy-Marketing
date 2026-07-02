"""Carrega a lista de modelos LLM oferecidos no briefing de Pesquisa (config/research_models.yml)."""

from __future__ import annotations

import logging

import yaml

from app.agent_config import read_config_text

logger = logging.getLogger(__name__)


def load_research_models() -> list[dict]:
    """Retorna [{"label", "model_id"}] apenas dos modelos habilitados. Lista vazia se o YAML sumir."""
    try:
        data = yaml.safe_load(read_config_text("research_models.yml")) or {}
    except Exception as exc:  # arquivo ausente/ilegível não deve derrubar a API
        logger.warning("research_models.yml indisponivel: %s", exc)
        return []
    out: list[dict] = []
    for item in data.get("models", []):
        model_id = (item or {}).get("model_id")
        label = (item or {}).get("label")
        if not model_id or not label:
            continue
        if item.get("enabled", True):
            out.append({"label": str(label), "model_id": str(model_id)})
    return out


def allowed_research_model_ids() -> set[str]:
    """Conjunto de model_ids válidos para override de pesquisa (whitelist)."""
    return {m["model_id"] for m in load_research_models()}
