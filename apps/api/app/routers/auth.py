from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import TOKEN_COOKIE, get_current_user, get_user_by_email
from app.models import User
from app.schemas import LoginRequest, LoginResponse, LogoutResponse, UserRead
from app.security import create_access_token, verify_password
from app.settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# C5: flag NAO-secreta e legivel por JS so para o front saber que ha sessao (o token real fica
# no cookie HttpOnly duofy_token, invisivel ao JS). Ler esta flag via XSS e inofensivo.
AUTH_FLAG_COOKIE = "duofy_auth"


def _user_read(user: User) -> UserRead:
    return UserRead(id=user.id, email=user.email, name=user.name, role=user.role)


def _set_auth_cookies(response: Response, token: str) -> None:
    settings = get_settings()
    max_age = settings.access_token_expire_minutes * 60
    secure = settings.is_production
    response.set_cookie(
        TOKEN_COOKIE, token, max_age=max_age, path="/",
        httponly=True, samesite="lax", secure=secure,
    )
    response.set_cookie(
        AUTH_FLAG_COOKIE, "1", max_age=max_age, path="/",
        httponly=False, samesite="lax", secure=secure,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(TOKEN_COOKIE, path="/")
    response.delete_cookie(AUTH_FLAG_COOKIE, path="/")


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    user = await get_user_by_email(db, payload.email)
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user)
    _set_auth_cookies(response, token)  # C5: sessao via cookie HttpOnly
    # access_token no corpo mantido p/ compat de ferramentas/CLI; o browser usa o cookie.
    return LoginResponse(access_token=token, user=_user_read(user))


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response) -> LogoutResponse:
    _clear_auth_cookies(response)
    return LogoutResponse(status="ok")


@router.get("/me", response_model=UserRead)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserRead:
    return _user_read(current_user)
