from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models import Agent, Brand, ProviderCredential, Setting, User
from app.security import hash_password
from app.settings import get_settings


def _config_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "config" / "seeds"
        if candidate.exists():
            return candidate
    raise RuntimeError("config/seeds directory not found")


def _load_yaml(name: str) -> dict[str, Any]:
    with (_config_dir() / name).open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


async def seed_admin() -> None:
    settings = get_settings()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == settings.admin_email.lower()))
        user = result.scalar_one_or_none()
        if user is None:
            db.add(
                User(
                    email=settings.admin_email.lower(),
                    name=settings.admin_name,
                    password_hash=hash_password(settings.admin_password),
                    role="admin",
                    is_active=True,
                )
            )
        else:
            user.name = settings.admin_name
            user.role = "admin"
            user.is_active = True
        await db.commit()


async def seed_brands() -> None:
    payload = _load_yaml("brands.yaml")
    async with AsyncSessionLocal() as db:
        for item in payload["brands"]:
            result = await db.execute(select(Brand).where(Brand.slug == item["slug"]))
            brand = result.scalar_one_or_none()
            if brand is None:
                db.add(Brand(**item, is_active=True))
            else:
                brand.name = item["name"]
                brand.niche = item["niche"]
                brand.description = item["description"]
                brand.is_active = True
        await db.commit()


async def seed_agents() -> None:
    payload = _load_yaml("agents.yaml")
    async with AsyncSessionLocal() as db:
        for item in payload["agents"]:
            result = await db.execute(select(Agent).where(Agent.slug == item["slug"]))
            agent = result.scalar_one_or_none()
            if agent is None:
                db.add(Agent(**item, is_active=True))
            else:
                agent.name = item["name"]
                agent.default_model = item["default_model"]
                agent.is_active = True
        await db.commit()


async def seed_settings() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Setting).where(Setting.key == "phase"))
        setting = result.scalar_one_or_none()
        if setting is None:
            db.add(Setting(key="phase", value="2"))
        else:
            setting.value = "2"
        await db.commit()


async def seed_providers() -> None:
    providers = [
        {
            "provider": "openrouter",
            "display_name": "OpenRouter",
            "base_url": "https://openrouter.ai/api/v1",
            "default_model": "openai/gpt-4o-mini",
        },
        {
            "provider": "anthropic",
            "display_name": "Anthropic",
            "base_url": "https://api.anthropic.com",
            "default_model": "claude-3-5-sonnet-latest",
        },
        {
            "provider": "openai",
            "display_name": "OpenAI",
            "base_url": "https://api.openai.com/v1",
            "default_model": "gpt-4o-mini",
        },
        {
            "provider": "openai_embeddings",
            "display_name": "OpenAI Embeddings",
            "base_url": "https://api.openai.com/v1",
            "default_model": "text-embedding-3-small",
        },
        {
            "provider": "apify",
            "display_name": "Apify",
            "base_url": "https://api.apify.com/v2",
            "default_model": None,
        },
    ]
    async with AsyncSessionLocal() as db:
        for item in providers:
            result = await db.execute(
                select(ProviderCredential).where(
                    ProviderCredential.provider == item["provider"]
                )
            )
            credential = result.scalar_one_or_none()
            if credential is None:
                db.add(ProviderCredential(**item, is_enabled=False))
            else:
                credential.display_name = item["display_name"]
                credential.base_url = item["base_url"]
                credential.default_model = item["default_model"]
        await db.commit()


async def main() -> None:
    await seed_admin()
    await seed_brands()
    await seed_agents()
    await seed_settings()
    await seed_providers()
    print("Seed completed: admin, brands, agents and settings are ready.")


if __name__ == "__main__":
    asyncio.run(main())
