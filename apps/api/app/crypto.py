from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from app.settings import get_settings


def _fernet() -> Fernet:
    # C2: usa um segredo dedicado (FERNET_SECRET_KEY) se definido; senao cai no JWT_SECRET_KEY
    # para retrocompatibilidade (chaves ja cifradas continuam decifraveis). Com o segredo
    # dedicado, rotacionar o JWT nao derruba as chaves de provedor.
    settings = get_settings()
    secret = settings.fernet_secret_key or settings.jwt_secret_key
    digest = hashlib.sha256(secret.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    return f"{value[:4]}...{value[-4:]}" if len(value) > 8 else "********"
