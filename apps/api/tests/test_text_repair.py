from __future__ import annotations

from app.text_repair import has_mojibake, repair_text

# Caracteres legítimos PT-BR (não são mojibake)
A_CIRC = "Â"  # Â
E_ACUTE = "é"  # é
A_TILDE = "ã"  # ã
C_CED = "ç"  # ç

# Sequências REAIS de mojibake (UTF-8 lido como cp1252)
MOJ_CCED = "Ã§"  # "Ã§" -> ç
MOJ_ATIL = "Ã£"  # "Ã£" -> ã
MOJ_EACU = "Ã©"  # "Ã©" -> é
MOJ_EMDASH = "â"  # -> —
MOJ_NBSP = "Â "  # Â+nbsp -> espaço


def test_repair_preserves_legitimate_capital_a_circumflex() -> None:
    assert repair_text(f"{A_CIRC}ncora do plano") == f"{A_CIRC}ncora do plano"
    assert repair_text(f"{A_CIRC}ngulo e {A_CIRC}mbito") == f"{A_CIRC}ngulo e {A_CIRC}mbito"


def test_has_mojibake_false_for_valid_ptbr() -> None:
    assert has_mojibake(f"{A_CIRC}ncora") is False
    assert has_mojibake(f"{A_CIRC}ngulo") is False


def test_has_mojibake_true_for_real_mojibake() -> None:
    assert has_mojibake(f"informa{MOJ_CCED}{MOJ_ATIL}o") is True
    assert has_mojibake(f"plano {MOJ_EMDASH} final") is True


def test_repair_fixes_real_mojibake() -> None:
    assert repair_text(f"informa{MOJ_CCED}{MOJ_ATIL}o") == f"informa{C_CED}{A_TILDE}o"
    assert repair_text(f"reuni{MOJ_EACU}s") == f"reuni{E_ACUTE}s"
    assert repair_text(f"plano {MOJ_EMDASH} final") == "plano — final"


def test_repair_fixes_nbsp_mojibake_without_eating_letters() -> None:
    assert repair_text(f"R${MOJ_NBSP}5") == "R$ 5"
