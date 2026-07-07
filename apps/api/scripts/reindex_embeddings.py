"""Reindexa os embeddings de document_chunks e memory_entries (F6).

Provider-agnóstico: usa `app.embeddings.embed_text`, então respeita `EMBEDDINGS_PROVIDER`.
- Com `local_sha256` (padrão) reprocessa com o embedding local atual.
- Com `local_sentence_transformers` (roadmap) gera embeddings SEMÂNTICOS reais — rode isto
  UMA vez após habilitar o provedor, senão a busca mistura vetores de espaços diferentes.

Uso:
    python -m scripts.reindex_embeddings --dry-run
    python -m scripts.reindex_embeddings --brand deathcare
    python -m scripts.reindex_embeddings --limit 100

Flags:
    --dry-run   só conta o que seria reprocessado, não escreve.
    --brand X   restringe a uma marca (slug). Omitido = todas.
    --limit N   processa no máximo N registros de cada tabela.
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import text

from app.db import AsyncSessionLocal
from app.embeddings import embed_text, vector_to_sql


async def _reindex_table(
    db, table: str, brand: str | None, limit: int | None, dry_run: bool
) -> int:
    where = "WHERE content IS NOT NULL AND content <> ''"
    params: dict = {}
    if brand:
        where += " AND brand_slug = :brand"
        params["brand"] = brand
    sql = f"SELECT id, content FROM {table} {where} ORDER BY id"
    if limit:
        sql += " LIMIT :limit"
        params["limit"] = limit
    rows = (await db.execute(text(sql), params)).fetchall()
    if dry_run:
        print(f"  [{table}] {len(rows)} registro(s) seriam reprocessados.")
        return len(rows)

    done, failed = 0, 0
    for i, row in enumerate(rows, start=1):
        try:
            vector = await embed_text(db, row.content)
            await db.execute(
                text(f"UPDATE {table} SET embedding = CAST(:v AS vector) WHERE id = :id"),
                {"v": vector_to_sql(vector), "id": row.id},
            )
            done += 1
        except Exception as exc:  # noqa: BLE001 - registra e segue
            failed += 1
            print(f"  [{table}] ERRO no id={row.id}: {exc}")
        if i % 50 == 0:
            await db.commit()
            print(f"  [{table}] {i}/{len(rows)}…")
    await db.commit()
    print(f"  [{table}] concluído: {done} ok, {failed} falha(s).")
    return done


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reindexa embeddings (F6).")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--brand", default=None)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    from app.settings import get_settings

    print(f"Provider de embeddings: {get_settings().embeddings_provider}")
    if args.dry_run:
        print("(dry-run — nada será escrito)")
    async with AsyncSessionLocal() as db:
        await _reindex_table(db, "document_chunks", args.brand, args.limit, args.dry_run)
        await _reindex_table(db, "memory_entries", args.brand, args.limit, args.dry_run)
    print("Reindexação finalizada.")


if __name__ == "__main__":
    asyncio.run(main())
