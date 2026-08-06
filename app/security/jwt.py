from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, List

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app import models
from app.core import get_settings
from app.db import get_db
from app.services import UserService


settings = get_settings()

SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _extract_token_from_request(request: Request, token: str | None) -> str | None:
    if token:
        return token

    cookie_token = request.cookies.get(settings.token_cookie_name, "")
    if cookie_token.startswith("Bearer "):
        return cookie_token.replace("Bearer ", "", 1)
    if cookie_token:
        return cookie_token
    return None


def _decode_token_or_raise(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales invalidas",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return payload


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales invalidas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = _extract_token_from_request(request, token)
    if not token:
        raise credentials_exception

    payload = _decode_token_or_raise(token)
    email: str | None = payload.get("sub")
    if email is None:
        raise credentials_exception

    user = UserService.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception

    return user


async def get_token_payload(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> dict[str, Any]:
    token = _extract_token_from_request(request, token)
    if not token:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    return _decode_token_or_raise(token)


class RoleChecker:
    def __init__(self, allowed_roles: List[models.RolUsuario]):
        self.allowed_roles = [models.RolUsuario.from_input(role) for role in allowed_roles]

    def __call__(self, user: models.Usuario = Depends(get_current_user)):
        current_role = models.RolUsuario.from_input(user.rol)
        if current_role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="No tienes permisos")
        return user


allow_superadmin = RoleChecker([models.RolUsuario.SUPERADMIN])
allow_user_admin = RoleChecker([models.RolUsuario.SUPERADMIN, models.RolUsuario.ADMINISTRADOR])
allow_admin = allow_user_admin
allow_admin_asistente = RoleChecker(
    [
        models.RolUsuario.SUPERADMIN,
        models.RolUsuario.ADMINISTRADOR,
        models.RolUsuario.GERENTE_COMERCIAL,
    ]
)
allow_all_staff = RoleChecker(
    [
        models.RolUsuario.SUPERADMIN,
        models.RolUsuario.ADMINISTRADOR,
        models.RolUsuario.GERENTE_COMERCIAL,
        models.RolUsuario.VENTAS,
        models.RolUsuario.OPERATIVO,
    ]
)
