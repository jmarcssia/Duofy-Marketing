from __future__ import annotations

import re
from dataclasses import dataclass
from html import escape
from io import BytesIO
from re import sub
from textwrap import wrap

from docx import Document as DocxDocument
from docx.shared import Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.text_repair import repair_text


@dataclass(frozen=True)
class ExportDocument:
    title: str
    subtitle: str
    metadata: list[tuple[str, str]]
    content: str
    filename_prefix: str


@dataclass(frozen=True)
class ExportResult:
    content: bytes
    media_type: str
    filename: str


EXPORT_FORMATS = {"pdf", "docx", "md", "html"}


def safe_filename(value: str) -> str:
    cleaned = sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower()).strip("-")
    return cleaned[:90] or "duofy-document"


def export_document(document: ExportDocument, export_format: str) -> ExportResult:
    normalized_format = export_format.lower().strip()
    if normalized_format not in EXPORT_FORMATS:
        raise ValueError("Formato de exportacao nao suportado.")

    document = ExportDocument(
        title=repair_text(document.title),
        subtitle=repair_text(document.subtitle),
        metadata=[(repair_text(label), repair_text(value)) for label, value in document.metadata],
        content=repair_text(document.content),
        filename_prefix=document.filename_prefix,
    )
    filename = f"{safe_filename(document.filename_prefix)}.{normalized_format}"
    if normalized_format == "pdf":
        return ExportResult(
            content=build_duofy_pdf(document),
            media_type="application/pdf",
            filename=filename,
        )
    if normalized_format == "docx":
        return ExportResult(
            content=build_duofy_docx(document),
            media_type=(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            filename=filename,
        )
    if normalized_format == "html":
        return ExportResult(
            content=build_duofy_html(document).encode("utf-8"),
            media_type="text/html; charset=utf-8",
            filename=filename,
        )
    return ExportResult(
        content=build_duofy_markdown(document).encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        filename=filename,
    )


def build_duofy_markdown(document: ExportDocument) -> str:
    metadata = "\n".join(f"- **{label}:** {value}" for label, value in document.metadata)
    blocks = [f"# {document.title}", document.subtitle]
    if metadata:
        blocks.extend(["## Metadados", metadata])
    blocks.append(document.content.strip())
    return "\n\n".join(block for block in blocks if block).strip() + "\n"


def build_duofy_html(document: ExportDocument) -> str:
    metadata_rows = "\n".join(
        f"<tr><th>{escape(label)}</th><td>{escape(value)}</td></tr>"
        for label, value in document.metadata
    )
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(document.title)}</title>
  <style>
    body {{
      margin: 0;
      background: #f7f7fb;
      color: #11131a;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{
      width: min(880px, calc(100% - 48px));
      margin: 48px auto;
      background: #fff;
      border: 1px solid #e9e8ef;
      border-radius: 28px;
      box-shadow: 0 24px 70px rgba(18, 20, 30, .08);
      padding: 56px;
    }}
    .brand {{ color: #6d35ee; font-weight: 800; letter-spacing: -.04em; }}
    h1 {{ font-size: 42px; line-height: 1.05; letter-spacing: -.05em; margin: 14px 0 8px; }}
    h2 {{ font-size: 22px; letter-spacing: -.03em; margin-top: 34px; }}
    p, li, td, th {{ font-size: 15px; line-height: 1.72; }}
    .subtitle {{ color: #6b7280; margin-bottom: 26px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 22px 0 34px; }}
    th, td {{
      border: 1px solid #e9e8ef;
      padding: 12px 14px;
      text-align: left;
      vertical-align: top;
    }}
    th {{ width: 190px; background: #f4efff; }}
    blockquote {{
      margin: 18px 0;
      padding: 14px 18px;
      border-left: 4px solid #6d35ee;
      background: #f8f6ff;
    }}
    code, pre {{ font-family: "SFMono-Regular", Consolas, monospace; }}
  </style>
</head>
<body>
  <main>
    <div class="brand">Duofy</div>
    <h1>{escape(document.title)}</h1>
    <p class="subtitle">{escape(document.subtitle)}</p>
    {"<table>" + metadata_rows + "</table>" if metadata_rows else ""}
    {markdown_to_html(document.content)}
  </main>
</body>
</html>
"""


def markdown_to_html(content: str) -> str:
    html: list[str] = []
    list_items: list[str] = []
    table_rows: list[list[str]] = []

    def flush_list() -> None:
        if list_items:
            html.append("<ul>" + "".join(list_items) + "</ul>")
            list_items.clear()

    def flush_table() -> None:
        if not table_rows:
            return
        header, *rows = table_rows
        head = "".join(f"<th>{_inline_markdown(cell)}</th>" for cell in header)
        body = "".join(
            "<tr>" + "".join(f"<td>{_inline_markdown(cell)}</td>" for cell in row) + "</tr>"
            for row in rows
        )
        html.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
        table_rows.clear()

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            flush_list()
            flush_table()
            continue
        if line in {"---", "***"}:
            flush_list()
            flush_table()
            html.append("<hr>")
            continue
        if _is_markdown_table_row(line):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                continue
            flush_list()
            table_rows.append(cells)
            continue
        if line.startswith(("- ", "* ")):
            flush_table()
            list_items.append(f"<li>{_inline_markdown(line[2:].strip())}</li>")
            continue
        flush_list()
        flush_table()
        if line.startswith("### "):
            html.append(f"<h3>{_inline_markdown(line[4:])}</h3>")
        elif line.startswith("## "):
            html.append(f"<h2>{_inline_markdown(line[3:])}</h2>")
        elif line.startswith("# "):
            html.append(f"<h2>{_inline_markdown(line[2:])}</h2>")
        elif line.startswith(">"):
            html.append(f"<blockquote>{_inline_markdown(line.lstrip('>').strip())}</blockquote>")
        else:
            html.append(f"<p>{_inline_markdown(line)}</p>")
    flush_list()
    flush_table()
    return "\n".join(html)


def _inline_markdown(value: str) -> str:
    escaped = escape(value)
    escaped = sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    return escaped


def _is_markdown_table_row(line: str) -> bool:
    return line.startswith("|") and line.endswith("|") and line.count("|") >= 2


def build_duofy_docx(document: ExportDocument) -> bytes:
    docx = DocxDocument()
    styles = docx.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(10.5)
    styles["Title"].font.name = "Arial"
    styles["Title"].font.size = Pt(25)

    brand = docx.add_paragraph()
    brand_run = brand.add_run("Duofy")
    brand_run.bold = True
    brand_run.font.color.rgb = RGBColor(109, 53, 238)
    brand_run.font.size = Pt(13)

    docx.add_heading(document.title, level=0)
    subtitle = docx.add_paragraph(document.subtitle)
    subtitle.runs[0].font.color.rgb = RGBColor(107, 114, 128)

    if document.metadata:
        table = docx.add_table(rows=0, cols=2)
        table.style = "Table Grid"
        for label, value in document.metadata:
            row = table.add_row()
            row.cells[0].text = label
            row.cells[1].text = value
        docx.add_paragraph()

    pending_table: list[list[str]] = []

    def flush_docx_table() -> None:
        if not pending_table:
            return
        table = docx.add_table(rows=0, cols=len(pending_table[0]))
        table.style = "Table Grid"
        for cells in pending_table:
            row = table.add_row()
            for index, cell in enumerate(cells):
                row.cells[index].text = cell.replace("**", "")
        docx.add_paragraph()
        pending_table.clear()

    for raw_line in document.content.splitlines():
        line = raw_line.strip()
        if not line:
            flush_docx_table()
            docx.add_paragraph()
        elif line in {"---", "***"}:
            flush_docx_table()
            docx.add_paragraph()
        elif _is_markdown_table_row(line):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                continue
            pending_table.append(cells)
        elif line.startswith("### "):
            flush_docx_table()
            docx.add_heading(line[4:], level=3)
        elif line.startswith("## "):
            flush_docx_table()
            docx.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            flush_docx_table()
            docx.add_heading(line[2:], level=1)
        elif line.startswith(("- ", "* ")):
            flush_docx_table()
            docx.add_paragraph(line[2:].strip(), style="List Bullet")
        else:
            flush_docx_table()
            docx.add_paragraph(line)
    flush_docx_table()

    buffer = BytesIO()
    docx.save(buffer)
    return buffer.getvalue()


def _clean_pdf_text(value: str) -> str:
    return escape(value).replace("\u2014", "-").replace("\u2013", "-")


def _pdf_paragraphs(
    content: str,
    body_style: ParagraphStyle,
    heading_style: ParagraphStyle,
) -> list:
    flowables: list = []
    pending_table: list[list[str]] = []

    def flush_pdf_table() -> None:
        if not pending_table:
            return
        table = Table(
            [[_clean_pdf_text(cell.replace("**", "")) for cell in row] for row in pending_table],
            repeatRows=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8F6FF")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9E8EF")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E9E8EF")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        flowables.append(table)
        flowables.append(Spacer(1, 0.18 * cm))
        pending_table.clear()

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            flush_pdf_table()
            flowables.append(Spacer(1, 0.16 * cm))
            continue
        if line in {"---", "***"}:
            flush_pdf_table()
            flowables.append(Spacer(1, 0.24 * cm))
            continue
        if _is_markdown_table_row(line):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                continue
            pending_table.append(cells)
            continue
        if line.startswith("#"):
            flush_pdf_table()
            cleaned = line.strip("#").strip()
            flowables.append(Spacer(1, 0.14 * cm))
            flowables.append(Paragraph(_clean_pdf_text(cleaned), heading_style))
        elif line.startswith(("- ", "* ")):
            flush_pdf_table()
            wrapped = wrap(line[2:].strip(), width=108) or [line[2:].strip()]
            flowables.append(Paragraph(f"• {_clean_pdf_text(wrapped[0])}", body_style))
            for continuation in wrapped[1:]:
                flowables.append(
                    Paragraph(
                        f"&nbsp;&nbsp;&nbsp;{_clean_pdf_text(continuation)}",
                        body_style,
                    )
                )
        else:
            flush_pdf_table()
            flowables.append(Paragraph(_clean_pdf_text(line), body_style))
    flush_pdf_table()
    return flowables


def build_duofy_pdf(document_data: ExportDocument) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.45 * cm,
        leftMargin=1.45 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.35 * cm,
        title=document_data.title,
        author="Duofy",
    )
    styles = getSampleStyleSheet()
    brand_style = ParagraphStyle(
        "DuofyBrand",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#6D35EE"),
        spaceAfter=8,
    )
    title_style = ParagraphStyle(
        "DuofyTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=30,
        textColor=colors.HexColor("#11131A"),
        spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "DuofySubtitle",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#6B7280"),
        spaceAfter=14,
    )
    body_style = ParagraphStyle(
        "DuofyBody",
        parent=styles["BodyText"],
        fontSize=9.6,
        leading=14.4,
        textColor=colors.HexColor("#11131A"),
        spaceAfter=5,
    )
    heading_style = ParagraphStyle(
        "DuofyHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#11131A"),
        spaceBefore=5,
        spaceAfter=7,
    )

    story = [
        Paragraph("Duofy", brand_style),
        Paragraph(_clean_pdf_text(document_data.title), title_style),
        Paragraph(_clean_pdf_text(document_data.subtitle), subtitle_style),
    ]

    if document_data.metadata:
        table = Table(
            [
                [Paragraph(f"<b>{_clean_pdf_text(label)}</b>", body_style), _clean_pdf_text(value)]
                for label, value in document_data.metadata
            ],
            colWidths=[4.0 * cm, 12.5 * cm],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F6FF")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9E8EF")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E9E8EF")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.extend([table, Spacer(1, 0.45 * cm)])

    story.extend(_pdf_paragraphs(document_data.content, body_style, heading_style))
    document.build(story)
    return buffer.getvalue()
