from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.dependencies import get_current_user, get_user_by_email
from app.models import User
from app.schemas import LoginRequest, LoginResponse, LogoutResponse, UserRead
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_read(user: User) -> UserRead:
    return UserRead(id=user.id, email=user.email, name=user.name, role=user.role)


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
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

    return LoginResponse(access_token=create_access_token(user), user=_user_read(user))


@router.post("/logout", response_model=LogoutResponse)
async def logout() -> LogoutResponse:
    return LogoutResponse(status="ok")


@router.get("/me", response_model=UserRead)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserRead:
    return _user_read(current_user)
