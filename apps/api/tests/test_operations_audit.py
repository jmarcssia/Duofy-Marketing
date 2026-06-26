from app.audit_service import compact_metadata
from app.metrics_service import metrics_report_content
from app.schemas import ReportGenerateRequest


def test_compact_metadata_removes_none_and_truncates_long_text() -> None:
    metadata = compact_metadata({"keep": "value", "drop": None, "long": "x" * 1300})

    assert metadata is not None
    assert metadata["keep"] == "value"
    assert "drop" not in metadata
    assert str(metadata["long"]).endswith("...")
    assert len(str(metadata["long"])) == 1203


def test_metrics_report_content_includes_operations_context(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.metrics_service.read_agent_prompt",
        lambda _slug: "## Missao\nAnalisar operacao.",
    )
    content = metrics_report_content(
        {
            "total_calls": 10,
            "completed_calls": 8,
            "failed_calls": 2,
            "total_tokens": 1200,
            "estimated_cost_usd": 0.42,
            "avg_latency_ms": 250,
            "by_provider": [{"key": "openrouter", "calls": 10, "tokens": 1200, "cost": 0.42}],
            "by_agent": [{"key": "content_agent", "calls": 10, "tokens": 1200, "cost": 0.42}],
        },
        ReportGenerateRequest(),
        {
            "total_quality_reviews": 4,
            "failed_quality_reviews": 1,
            "total_decisions": 3,
            "audit_events": 7,
            "recent_errors": [
                {
                    "agent_slug": "research_agent",
                    "provider": "openrouter",
                    "model": "test",
                    "error": "timeout",
                }
            ],
        },
    )

    assert "Revisoes do Guardiao: 4" in content
    assert "Eventos de auditoria: 7" in content
    assert "research_agent / openrouter / test: timeout" in content
