import pytest

from app import orchestrator_tools


class _FakeOutput:
    def __init__(self, id, status="draft"):
        self.id = id
        self.status = status


class _FakeReview:
    def __init__(self, passed=True, score=88):
        self.passed = passed
        self.score = score


@pytest.mark.anyio
async def test_create_content_tool_creates_draft_and_runs_guardian(monkeypatch):
    calls = {}

    async def fake_generate(db, payload):
        calls["payload"] = payload
        return _FakeOutput(id=51, status=payload.status)

    async def fake_review(db, output, *, force=False):
        calls["reviewed"] = (output.id, force)
        return _FakeReview(passed=True, score=88)

    logs = []

    async def fake_log(msg):
        logs.append(msg)

    monkeypatch.setattr(orchestrator_tools, "generate_content_output", fake_generate)
    monkeypatch.setattr(orchestrator_tools, "review_output_quality", fake_review)

    tools = orchestrator_tools.build_tools(
        db=object(), brand_slug="duofy_solucoes", task_id=1, log=fake_log
    )
    create_content = {t.name: t for t in tools}["create_content"]

    result = await create_content.ainvoke(
        {"channel": "LinkedIn", "format": "Post LinkedIn", "briefing": "tema x"}
    )

    assert calls["payload"].brand_slug == "duofy_solucoes"
    assert calls["payload"].channel == "LinkedIn"
    assert calls["payload"].status == "draft"
    assert calls["reviewed"] == (51, True)
    assert "51" in result
    assert "88" in result
    assert logs  # logou progresso


@pytest.mark.anyio
async def test_research_tool_maps_params(monkeypatch):
    calls = {}

    async def fake_research(db, payload):
        calls["payload"] = payload
        return _FakeOutput(id=50)

    async def fake_log(msg):
        pass

    monkeypatch.setattr(orchestrator_tools, "run_market_research", fake_research)

    tools = orchestrator_tools.build_tools(
        db=object(), brand_slug="duofy_solucoes", task_id=1, log=fake_log
    )
    research = {t.name: t for t in tools}["research_market"]

    result = await research.ainvoke({"theme": "mercado de IA"})

    assert calls["payload"].brand_slug == "duofy_solucoes"
    assert calls["payload"].theme == "mercado de IA"
    assert "50" in result
