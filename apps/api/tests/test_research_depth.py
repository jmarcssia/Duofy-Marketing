from app.research_service import _evidence_excerpt


def test_evidence_excerpt_respects_limit():
    text = "palavra " * 1000  # ~8000 chars
    assert len(_evidence_excerpt(text, 3000)) <= 3000
    assert len(_evidence_excerpt(text, 1800)) <= 1800
