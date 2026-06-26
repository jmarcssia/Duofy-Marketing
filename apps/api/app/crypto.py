from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from app.settings import get_settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(get_settings().jwt_secret_key.encode()).digest()
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
