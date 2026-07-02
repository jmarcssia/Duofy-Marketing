"""Importa o Banco de Temas a partir de um CSV (separador ';') para ContentTheme.

O CSV do calendário Duofy tem as colunas:
PROGRAMA/WEBINAR/PODCAST ; TEMA ; TITULO ; PRODUTO ; PÚBLICO ; TIPO ; RESP ; STATUS

Um "tema" é qualquer linha com TÍTULO ou TEMA preenchidos. Linhas vazias ou de
cabeçalho de grupo (só a 1ª coluna) são ignoradas.
"""

from __future__ import annotations

import csv
import io

from sqlalchemy import select

from app.models import ContentTheme


def _brand_from_produto(produto: str) -> str | None:
    up = (produto or "").upper()
    if "POSTO" in up:
        return "postos_combustiveis"
    if "DEATH" in up or "LIFECARE" in up:
        return "deathcare"
    if "DUOFY" in up or "TOTVS" in up:
        return "duofy_solucoes"
    return None


def _decode(raw: bytes | str) -> str:
    if isinstance(raw, str):
        return raw
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_themes_csv(raw: bytes | str) -> list[dict]:
    text = _decode(raw)
    reader = csv.reader(io.StringIO(text), delimiter=";")
    themes: list[dict] = []
    for i, row in enumerate(reader):
        cells = [(c or "").strip() for c in row]
        cells += [""] * (8 - len(cells))  # garante 8 colunas
        programa, tema, titulo, produto, publico, tipo, resp, status = cells[:8]
        # cabeçalho
        if i == 0 and titulo.upper() == "TITULO":
            continue
        title = titulo or tema
        if not title:
            continue
        themes.append({
            "title": title[:255],
            "theme": tema[:2000],
            "brand_slug": _brand_from_produto(produto),
            "audience": publico or None,
            "kind": tipo or programa or None,
            "owner": resp or None,
            "status": status or None,
        })
    return themes


async def import_themes(session, themes: list[dict]) -> dict:
    """Insere temas, deduplicando por título (não recria os já existentes)."""
    existing = set((await session.execute(select(ContentTheme.title))).scalars().all())
    inserted = 0
    for t in themes:
        title = t["title"]
        if title in existing:
            continue
        existing.add(title)
        session.add(ContentTheme(
            title=title,
            theme=t.get("theme") or "",
            brand_slug=t.get("brand_slug"),
            audience=t.get("audience"),
            kind=t.get("kind"),
            owner=t.get("owner"),
            status=t.get("status"),
        ))
        inserted += 1
    await session.commit()
    return {"parsed": len(themes), "inserted": inserted, "skipped": len(themes) - inserted}
