"""Testa as skills dos agentes FORA da UI (F4).

Roda o agente real (research/cocreation/guardian) contra o banco, imprime a saída em Markdown/JSON,
o feedback do Guardião e o custo estimado. Útil para ajustar prompt/skill rapidamente e depois
aplicar a skill oficial no sistema.

⚠️ Faz chamadas REAIS de IA (use gpt-4o-mini, profundidade rápida). Requer o banco semeado
(marca/agente/provider com chave). Exemplos:

    python -m scripts.test_agent_skill --skill research   --brand postos_combustiveis \\
        --briefing "Concorrência em gestão de postos" --depth quick
    python -m scripts.test_agent_skill --skill cocreation --brand deathcare \\
        --briefing "Autoridade em gestão de funerárias" --channel Instagram --format Carrossel
    python -m scripts.test_agent_skill --skill guardian   --output-id 70
"""

from __future__ import annotations

import argparse
import asyncio
import json

from sqlalchemy import func, select

from app.db import AsyncSessionLocal
from app.models import ModelCall, Output
from app.schemas import CreationRequest, ResearchRunRequest


async def _cost_since(db, start_id: int) -> tuple[int, float]:
    row = (
        await db.execute(
            select(
                func.count(ModelCall.id),
                func.coalesce(func.sum(ModelCall.estimated_cost_usd), 0.0),
            ).where(ModelCall.id > start_id)
        )
    ).one()
    return int(row[0] or 0), float(row[1] or 0.0)


async def _max_model_call_id(db) -> int:
    return int((await db.execute(select(func.coalesce(func.max(ModelCall.id), 0)))).scalar_one())


async def _print_guardian(db, output: Output) -> None:
    from app.quality_guardian import latest_review_feedback

    fb = await latest_review_feedback(db, output)
    print("\n===== FEEDBACK DO GUARDIÃO =====")
    print(fb or "(sem avaliação — verifique o log do Guardião automático)")


async def main() -> None:
    p = argparse.ArgumentParser(description="Testa skill de agente fora da UI (F4).")
    p.add_argument("--skill", required=True, choices=["research", "cocreation", "guardian"])
    p.add_argument("--brand", default=None)
    p.add_argument("--briefing", default="", help="tema/pergunta")
    p.add_argument("--channel", default="Instagram")
    p.add_argument("--format", default="Carrossel")
    p.add_argument("--depth", default="quick")
    p.add_argument("--research-output-id", type=int, default=None)
    p.add_argument("--output-id", type=int, default=None)
    args = p.parse_args()

    async with AsyncSessionLocal() as db:
        start_id = await _max_model_call_id(db)

        if args.skill == "research":
            from app.research_service import run_market_research

            out = await run_market_research(
                db, ResearchRunRequest(brand_slug=args.brand, theme=args.briefing, depth=args.depth)
            )
            from app.output_workflow import current_version

            print("===== PESQUISA (Markdown) =====")
            cur = await current_version(db, out)
            print(cur.content if cur else "(sem versão)")
            await _print_guardian(db, out)

        elif args.skill == "cocreation":
            from app.cocreation_service import generate_content_package

            out, ver, pkg, warns = await generate_content_package(
                db, CreationRequest(
                    brand_slug=args.brand, theme=args.briefing,
                    channel=args.channel, format=args.format, depth=args.depth,
                    research_output_id=args.research_output_id,
                )
            )
            print("===== COCRIAÇÃO (JSON) =====")
            print(json.dumps(pkg.model_dump(), ensure_ascii=False, indent=2))
            if warns:
                print("\nAVISOS:", warns)
            await _print_guardian(db, out)

        elif args.skill == "guardian":
            from app.quality_guardian import review_output_quality

            oid = args.output_id or args.research_output_id
            output = await db.get(Output, oid) if oid else None
            if output is None:
                print("Informe --output-id de um Output existente.")
                return
            review = await review_output_quality(db, output, force=True)
            await db.commit()
            print("===== GUARDIÃO (estruturado) =====")
            print(json.dumps({
                "score": review.score, "status": review.status, "passed": review.passed,
                "critical_failures": review.critical_failures,
                "required_fixes": review.required_fixes,
                "optional_improvements": review.optional_improvements,
                "summary": review.summary,
            }, ensure_ascii=False, indent=2))

        calls, cost = await _cost_since(db, start_id)
        print(f"\n===== CUSTO ESTIMADO: US$ {cost:.5f} ({calls} chamada(s) de modelo) =====")


if __name__ == "__main__":
    asyncio.run(main())
