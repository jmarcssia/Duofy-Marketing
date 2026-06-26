from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.llm import LLMConfigurationError
from app.models import Agent


def repo_roots() -> list[Path]:
    current = Path.cwd()
    return [current, *current.parents]


def read_config_text(*relative_parts: str) -> str:
    for root in repo_roots():
        candidate = root.joinpath("config", *relative_parts)
        if candidate.exists():
            return candidate.read_text(encoding="utf-8")

    packaged = Path.cwd().joinpath(
        "DUOFY_V1_pacote_execucao_desenvolvimento",
        "duofy_v1_execucao_desenvolvimento",
        "config",
        *relative_parts,
    )
    if packaged.exists():
        return packaged.read_text(encoding="utf-8")

    raise LLMConfigurationError(
        f"Arquivo de configuracao nao encontrado: config/{'/'.join(relative_parts)}"
    )


def read_agent_prompt(agent_slug: str) -> str:
    return read_config_text("agents", f"{agent_slug}.md")


def agent_system_prompt(agent: Agent, extra_rules: list[str] | None = None) -> str:
    rules = extra_rules or []
    return "\n".join(
        [
            read_agent_prompt(agent.slug),
            "",
            "Contexto operacional da execução:",
            f"- Data atual do sistema: {datetime.now(UTC).date().isoformat()}.",
            "- Responda em português do Brasil.",
            "- Use somente dados reais, memória recuperada e fontes declaradas.",
            "- Declare limitações quando houver lacuna factual.",
            *[f"- {rule}" for rule in rules],
        ]
    )
