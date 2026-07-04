"""Cobertura de app.crypto (lacuna do ESTADO) + C2 (desacoplar Fernet do JWT)."""

from __future__ import annotations

import pytest
from cryptography.fernet import InvalidToken

from app import crypto
from app.settings import Settings


def _settings(**over) -> Settings:
    # app_env='test' -> sem hardening de segredos; permite defaults nos campos nao usados.
    return Settings(app_env="test", **over)


def test_encrypt_decrypt_roundtrip(monkeypatch) -> None:
    monkeypatch.setattr(crypto, "get_settings", lambda: _settings(jwt_secret_key="a" * 40))
    enc = crypto.encrypt_secret("sk-provider-123")
    assert enc != "sk-provider-123"
    assert crypto.decrypt_secret(enc) == "sk-provider-123"


def test_fernet_uses_dedicated_secret_when_set(monkeypatch) -> None:
    """C2: com FERNET_SECRET_KEY, o valor cifrado NÃO decifra só com o JWT — está desacoplado."""
    monkeypatch.setattr(
        crypto, "get_settings",
        lambda: _settings(jwt_secret_key="jwt-" + "x" * 36, fernet_secret_key="fern-" + "y" * 36),
    )
    enc = crypto.encrypt_secret("top-secret")
    # Agora sem o segredo dedicado (só o JWT): não deve decifrar (chave diferente).
    monkeypatch.setattr(crypto, "get_settings", lambda: _settings(jwt_secret_key="jwt-" + "x" * 36))
    with pytest.raises(InvalidToken):
        crypto.decrypt_secret(enc)


def test_fernet_falls_back_to_jwt_when_unset(monkeypatch) -> None:
    """Retrocompat: sem FERNET_SECRET_KEY, usa o JWT (chaves já cifradas continuam válidas)."""
    monkeypatch.setattr(crypto, "get_settings", lambda: _settings(jwt_secret_key="j" * 40))
    enc = crypto.encrypt_secret("valor")
    assert crypto.decrypt_secret(enc) == "valor"


def test_mask_secret() -> None:
    assert crypto.mask_secret(None) is None
    assert crypto.mask_secret("") is None
    assert crypto.mask_secret("curto") == "********"
    assert crypto.mask_secret("sk-abcdef1234") == "sk-a...1234"
