from __future__ import annotations

import re

# Marcadores de mojibake: SEQUENCIAS inequivocas (UTF-8 lido como cp1252/latin1).
# NUNCA listar U+00C3 ou U+00C2 isolados: sao letras PT-BR validas e geravam
# falso-positivo no Guardiao e corrupcao no repair (apagavam a inicial de
# "Ancora"/"Ambito"). Removidas as regras destrutivas. Ver tests/test_text_repair.py.
MOJIBAKE_MARKERS = (
    '\xc3\xa1',
    '\xc3\xa0',
    '\xc3\xa2',
    '\xc3\xa3',
    '\xc3\xa9',
    '\xc3\xaa',
    '\xc3\xad',
    '\xc3\xb3',
    '\xc3\xb4',
    '\xc3\xb5',
    '\xc3\xba',
    '\xc3\xa7',
    '\xc3\x81',
    '\xc3\x89',
    '\xc3\x93',
    '\xc3\x87',
    '\xe2\x80',
    '\xe2\u20ac',
    '\xe2\x9d',
    '\xe2\u2020',
    '\xe2\x9c',
    '\xc2\xa0',
    '\ufffd',
    '\u25a1',
)

DIRECT_REPLACEMENTS = {
    '\xc3\xa1': '\xe1',
    '\xc3\xa0': '\xe0',
    '\xc3\xa2': '\xe2',
    '\xc3\xa3': '\xe3',
    '\xc3\xa9': '\xe9',
    '\xc3\xaa': '\xea',
    '\xc3\xad': '\xed',
    '\xc3\xb3': '\xf3',
    '\xc3\xb4': '\xf4',
    '\xc3\xb5': '\xf5',
    '\xc3\xba': '\xfa',
    '\xc3\xa7': '\xe7',
    '\xc3\x81': '\xc1',
    '\xc3\x89': '\xc9',
    '\xc3\x93': '\xd3',
    '\xc3\x87': '\xc7',
    '\xc3\u0192\xc2\xa1': '\xe1',
    '\xc3\u0192\xc2\xa0': '\xe0',
    '\xc3\u0192\xc2\xa2': '\xe2',
    '\xc3\u0192\xc2\xa3': '\xe3',
    '\xc3\u0192\xc2\xa9': '\xe9',
    '\xc3\u0192\xc2\xaa': '\xea',
    '\xc3\u0192\xc2\xad': '\xed',
    '\xc3\u0192\xc2\xb3': '\xf3',
    '\xc3\u0192\xc2\xb4': '\xf4',
    '\xc3\u0192\xc2\xb5': '\xf5',
    '\xc3\u0192\xc2\xba': '\xfa',
    '\xc3\u0192\xc2\xa7': '\xe7',
    '\xc3\u0192\xc2\x81': '\xc1',
    '\xc3\u0192\xc2\x89': '\xc9',
    '\xc3\u0192\xc2\x93': '\xd3',
    '\xc3\u0192\xc2\x87': '\xc7',
    '\xe2\x80\x94': '\u2014',
    '\xe2\u20ac\u201d': '\u2014',
    '\xe2\x80\x93': '\u2013',
    '\xe2\u20ac\u201c': '\u2013',
    '\xe2\x80\xa2': '\u2022',
    '\xe2\u20ac\xa2': '\u2022',
    '\xe2\x80\x9c': '\u201c',
    '\xe2\u20ac\u0153': '\u201c',
    '\xe2\x80\x9d': '\u201d',
    '\xe2\u20ac\x9d': '\u201d',
    '\xe2\x80\x99': '\u2019',
    '\xe2\u20ac\u2122': '\u2019',
    '\xe2\x80\x98': '\u2018',
    '\xe2\u20ac\u02dc': '\u2018',
    '\xe2\x80\xa6': '\u2026',
    '\xe2\u20ac\xa6': '\u2026',
    '\xe2\x86\x92': '\u2192',
    '\xe2\u2020\u2019': '\u2192',
    '\xe2\x9c\x93': '\u2713',
    '\xe2\x9d': '',
    '\xc2\xa0': ' ',
    '\ufffd': '',
    '\u25a1': '',
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
