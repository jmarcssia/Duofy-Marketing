from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader

CHUNK_SIZE = 900
CHUNK_OVERLAP = 140


def extract_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(content)
    if suffix == ".docx":
        return _extract_docx(content)
    # Markdown/YAML/TXT são fontes preferenciais de conhecimento (regras, tom, personas,
    # playbooks). Tratados como texto puro — o conteúdo já é legível/estruturado.
    if suffix in {".txt", ".md", ".markdown", ".yaml", ".yml"}:
        return _decode_text(content)
    raise ValueError("Formato nao suportado. Use PDF, DOCX, TXT, MD, Markdown ou YAML.")


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + CHUNK_SIZE, len(normalized))
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(normalized):
            break
        start = max(0, end - CHUNK_OVERLAP)
    return chunks


def estimate_tokens(text: str) -> int:
    return max(1, len(text.split()))


def _extract_pdf(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    pages = [page.extract_text() or "" for page in reader.pages]
    return normalize_text("\n\n".join(pages))


def _extract_docx(content: bytes) -> str:
    document = DocxDocument(BytesIO(content))
    paragraphs = [paragraph.text for paragraph in document.paragraphs]
    return normalize_text("\n\n".join(paragraphs))


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return normalize_text(content.decode(encoding))
        except UnicodeDecodeError:
            continue
    return normalize_text(content.decode("utf-8", errors="ignore"))
