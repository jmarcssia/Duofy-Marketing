import importlib.util

import pytest

from app.export_service import (
    ExportDocument,
    build_duofy_pdf,
    markdown_to_html,
)

# WeasyPrint depende de libs nativas (Pango/Cairo) presentes só no container da API.
# Fora dele (host de dev Windows), pula APENAS os testes que geram PDF; os testes
# de markdown_to_html continuam rodando em qualquer ambiente.
_HAS_WEASYPRINT = importlib.util.find_spec("weasyprint") is not None
requires_weasyprint = pytest.mark.skipif(
    not _HAS_WEASYPRINT, reason="WeasyPrint indisponível fora do container da API"
)

WIDE_CONTENT = """## Metadados editoriais

| Campo | Valor detalhado que e propositalmente muito longo para testar transbordo |
|---|---|
| Marca | TOTVS Gestao DeathCare by Duofy — uma frente com nome bem extenso mesmo |
| Observacao | palavrasemespacoquenaopodetransbordarapaginadeformaalgumaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |

## Conteudo

Texto com **negrito**, *italico* e um [link](https://exemplo.com).

1. Primeiro item ordenado
2. Segundo item ordenado

- Bullet um
- Bullet dois
"""


def _doc() -> ExportDocument:
    return ExportDocument(
        title="Relatorio de Teste",
        subtitle="Verificacao de layout do PDF",
        metadata=[("Marca", "Duofy"), ("Tipo", "Teste")],
        content=WIDE_CONTENT,
        filename_prefix="teste",
    )


@requires_weasyprint
def test_pdf_is_valid_and_non_trivial():
    data = build_duofy_pdf(_doc())
    assert isinstance(data, bytes)
    assert data[:5] == b"%PDF-"
    assert len(data) > 2000  # tem conteudo real, nao um PDF vazio


@requires_weasyprint
def test_pdf_handles_wide_table_without_crashing():
    # tabela larga + palavra sem espaco não deve quebrar a geração
    data = build_duofy_pdf(_doc())
    assert data[:5] == b"%PDF-"


def test_markdown_ordered_list_and_inline():
    html = markdown_to_html("1. um\n2. dois\n\nTexto **forte** e *suave* e `cod`.")
    assert "<ol>" in html and "<li>um</li>" in html
    assert "<strong>forte</strong>" in html
    assert "<em>suave</em>" in html
    assert "<code>cod</code>" in html


def test_markdown_table_gets_class_md():
    html = markdown_to_html("| A | B |\n|---|---|\n| 1 | 2 |")
    assert 'class="md"' in html
    assert "<thead>" in html


def test_markdown_safe_link_only_http():
    ok = markdown_to_html("[site](https://x.com)")
    assert '<a href="https://x.com">site</a>' in ok
    bad = markdown_to_html("[x](javascript:alert(1))")
    assert "<a" not in bad  # esquema perigoso não vira link
