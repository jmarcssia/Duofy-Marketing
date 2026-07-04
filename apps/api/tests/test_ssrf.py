"""C4 — anti-SSRF: a coleta de URLs bloqueia destinos nao publicos.

Usa IPs literais (getaddrinfo nao faz DNS real), entao os testes sao deterministicos e offline.
"""

from __future__ import annotations

import pytest

from app.research_service import UnsafeURLError, _ensure_public_url, _ip_is_public

pytestmark = pytest.mark.anyio


def test_ip_is_public_classification() -> None:
    assert _ip_is_public("8.8.8.8")
    assert _ip_is_public("93.184.216.34")
    assert not _ip_is_public("127.0.0.1")
    assert not _ip_is_public("10.0.0.1")
    assert not _ip_is_public("192.168.1.10")
    assert not _ip_is_public("172.16.5.5")
    assert not _ip_is_public("169.254.169.254")  # metadata cloud (link-local)
    assert not _ip_is_public("0.0.0.0")
    assert not _ip_is_public("::1")


async def test_blocks_loopback() -> None:
    with pytest.raises(UnsafeURLError):
        await _ensure_public_url("http://127.0.0.1:6379/")


async def test_blocks_cloud_metadata() -> None:
    with pytest.raises(UnsafeURLError):
        await _ensure_public_url("http://169.254.169.254/latest/meta-data/")


async def test_blocks_private_ranges() -> None:
    for url in ("http://10.0.0.5/x", "http://192.168.1.1/", "http://172.16.0.1/"):
        with pytest.raises(UnsafeURLError):
            await _ensure_public_url(url)


async def test_blocks_localhost_and_non_http_schemes() -> None:
    for url in ("http://localhost:8000/", "file:///etc/passwd", "gopher://evil/", "ftp://x/"):
        with pytest.raises(UnsafeURLError):
            await _ensure_public_url(url)


async def test_allows_public_ip() -> None:
    # Nao deve levantar (IP publico, sem DNS real).
    await _ensure_public_url("http://8.8.8.8/artigo")
    await _ensure_public_url("https://93.184.216.34/")
