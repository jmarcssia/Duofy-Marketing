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


def read_brand_profile(brand_slug: str | None) -> str | None:
    """Lê o perfil de voz da marca em config/brands/<slug>.md.

    Retorna ``None`` de forma graciosa quando o slug é vazio ou não há perfil,
    para que a montagem do prompt nunca quebre por falta de arquivo.
    """
    if not brand_slug:
        return None
    try:
        return read_config_text("brands", f"{brand_slug}.md")
    except LLMConfigurationError:
        return None


def brand_voice_section(brand_slug: str | None) -> str:
    """Bloco formatado da voz de marca para anexar a qualquer system prompt.

    Retorna string vazia quando não há perfil — seguro para concatenar sempre.
    """
    profile = read_brand_profile(brand_slug)
    if not profile:
        return ""
    return "\n".join(
        [
            "",
            "## Perfil da marca ativa",
            (
                "Use o tom, persona, vocabulário e CTAs abaixo. Em conflito sobre "
                "produto, a memória/RAG e a documentação oficial prevalecem. Nunca "
                "invente produto, número, preço, case ou parceria."
            ),
            "",
            profile.strip(),
        ]
    )


def agent_system_prompt(
    agent: Agent,
    extra_rules: list[str] | None = None,
    *,
    brand_slug: str | None = None,
) -> str:
    rules = extra_rules or []
    sections = [
        read_agent_prompt(agent.slug),
        "",
        "Contexto operacional da execução:",
        f"- Data atual do sistema: {datetime.now(UTC).date().isoformat()}.",
        "- Responda em português do Brasil.",
        "- Use somente dados reais, memória recuperada e fontes declaradas.",
        "- Declare limitações quando houver lacuna factual.",
        *[f"- {rule}" for rule in rules],
    ]

    voice = brand_voice_section(brand_slug)
    if voice:
        sections.append(voice)

    return "\n".join(sections)
