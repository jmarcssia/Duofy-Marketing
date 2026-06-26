from __future__ import annotations

import re

MOJIBAKE_MARKERS = (
    "\u00c3",
    "\u00c2",
    "\u00e2\u0080",
    "\u00e2\u20ac",
    "\u00e2\u009d",
    "\u00e2\u2020",
    "\u00e2\u009c",
    "\ufffd",
    "\u25a1",
)

DIRECT_REPLACEMENTS = {
    "\u00c3\u00a1": "\u00e1",
    "\u00c3\u00a0": "\u00e0",
    "\u00c3\u00a2": "\u00e2",
    "\u00c3\u00a3": "\u00e3",
    "\u00c3\u00a9": "\u00e9",
    "\u00c3\u00aa": "\u00ea",
    "\u00c3\u00ad": "\u00ed",
    "\u00c3\u00b3": "\u00f3",
    "\u00c3\u00b4": "\u00f4",
    "\u00c3\u00b5": "\u00f5",
    "\u00c3\u00ba": "\u00fa",
    "\u00c3\u00a7": "\u00e7",
    "\u00c3\u0081": "\u00c1",
    "\u00c3\u0089": "\u00c9",
    "\u00c3\u0093": "\u00d3",
    "\u00c3\u0087": "\u00c7",
    "\u00c3\u0192\u00c2\u00a1": "\u00e1",
    "\u00c3\u0192\u00c2\u00a0": "\u00e0",
    "\u00c3\u0192\u00c2\u00a2": "\u00e2",
    "\u00c3\u0192\u00c2\u00a3": "\u00e3",
    "\u00c3\u0192\u00c2\u00a9": "\u00e9",
    "\u00c3\u0192\u00c2\u00aa": "\u00ea",
    "\u00c3\u0192\u00c2\u00ad": "\u00ed",
    "\u00c3\u0192\u00c2\u00b3": "\u00f3",
    "\u00c3\u0192\u00c2\u00b4": "\u00f4",
    "\u00c3\u0192\u00c2\u00b5": "\u00f5",
    "\u00c3\u0192\u00c2\u00ba": "\u00fa",
    "\u00c3\u0192\u00c2\u00a7": "\u00e7",
    "\u00c3\u0192\u00c2\u0081": "\u00c1",
    "\u00c3\u0192\u00c2\u0089": "\u00c9",
    "\u00c3\u0192\u00c2\u0093": "\u00d3",
    "\u00c3\u0192\u00c2\u0087": "\u00c7",
    "\u00e2\u0080\u0094": "\u2014",
    "\u00e2\u20ac\u201d": "\u2014",
    "\u00e2\u0080\u0093": "\u2013",
    "\u00e2\u20ac\u201c": "\u2013",
    "\u00e2\u0080\u00a2": "\u2022",
    "\u00e2\u20ac\u00a2": "\u2022",
    "\u00e2\u0080\u009c": "\u201c",
    "\u00e2\u20ac\u0153": "\u201c",
    "\u00e2\u0080\u009d": "\u201d",
    "\u00e2\u20ac\u009d": "\u201d",
    "\u00e2\u0080\u0099": "\u2019",
    "\u00e2\u20ac\u2122": "\u2019",
    "\u00e2\u0080\u0098": "\u2018",
    "\u00e2\u20ac\u02dc": "\u2018",
    "\u00e2\u0080\u00a6": "\u2026",
    "\u00e2\u20ac\u00a6": "\u2026",
    "\u00e2\u0086\u0092": "\u2192",
    "\u00e2\u2020\u2019": "\u2192",
    "\u00e2\u009c\u0093": "\u2713",
    "\u00e2\u009d": "",
    "\u00c2 ": " ",
    "\u00c2": "",
    "\ufffd": "",
    "\u25a1": "",
}


def has_mojibake(value: str) -> bool:
    return any(marker in value for marker in MOJIBAKE_MARKERS)


def repair_text(value: str) -> str:
    """Repair common UTF-8/Windows-1252 mojibake without calling an LLM."""
    if not value:
        return value

    repaired = value
    for _ in range(4):
        repaired = _replace_known_sequences(repaired)
        for encoding in ("cp1252", "latin1"):
            repaired = _try_roundtrip(repaired, encoding)

    repaired = _replace_known_sequences(repaired)
    repaired = re.sub(r"[ \t]+\n", "\n", repaired)
    repaired = re.sub(r"\n{4,}", "\n\n\n", repaired)
    return repaired


def _replace_known_sequences(value: str) -> str:
    repaired = value
    for broken, fixed in DIRECT_REPLACEMENTS.items():
        repaired = repaired.replace(broken, fixed)
    return repaired


def _try_roundtrip(value: str, encoding: str) -> str:
    if not has_mojibake(value):
        return value
    try:
        candidate = value.encode(encoding).decode("utf-8")
    except UnicodeError:
        return value
    if _mojibake_score(candidate) <= _mojibake_score(value):
        return candidate
    return value


def _mojibake_score(value: str) -> int:
    return sum(value.count(marker) for marker in MOJIBAKE_MARKERS)
