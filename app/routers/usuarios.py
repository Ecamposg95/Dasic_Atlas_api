import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from app import models
from app import schemas
from app.db import get_db
from app.models.enums import RolUsuario
from app.security import get_current_user
from app.security.jwt import allow_user_admin
from app.services import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/usuarios", tags=["Administración de Usuarios"])


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = None
    rol: Optional[RolUsuario] = None
    activo: Optional[bool] = None

    @field_validator("rol", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if v is None:
            return None
        return RolUsuario.from_input(v)


class PasswordResetIn(BaseModel):
    password: str = Field(..., min_length=6, description="Mínimo 6 caracteres")

# Fase 1 RBAC: mantener gestión de usuarios sólo para el rol admin-equivalente.
@router.get("/", response_model=List[schemas.UsuarioResponse], dependencies=[Depends(allow_user_admin)])
def listar_usuarios(db: Session = Depends(get_db)):
    # Ocultamos al super admin del listado general para evitar accidentes, o lo mostramos
    return db.query(models.Usuario).all()

@router.post("/", response_model=schemas.UsuarioResponse, dependencies=[Depends(allow_user_admin)])
def crear_usuario(
    usuario: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    # Validar correo único
    if UserService.get_user_by_email(db, usuario.email):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    # Solo un superadmin puede asignar el rol superadmin
    rol_solicitado = RolUsuario.from_input(usuario.rol)
    if rol_solicitado == RolUsuario.SUPERADMIN and RolUsuario.from_input(current_user.rol) != RolUsuario.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Solo un superadmin puede asignar el rol superadmin.")

    try:
        return UserService.create_user(db, usuario)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("usuarios.crear_usuario falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

@router.put("/{user_id}", response_model=schemas.UsuarioResponse, dependencies=[Depends(allow_user_admin)])
def actualizar_usuario(
    user_id: int,
    payload: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    target = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not target:
        raise HTTPException(404, "Usuario no encontrado")

    data = payload.model_dump(exclude_unset=True)

    # Normalizar rol entrante si se está cambiando
    nuevo_rol = RolUsuario.from_input(data["rol"]) if "rol" in data else None
    nuevo_activo = data.get("activo", None)  # None = no se toca

    current_user_rol = RolUsuario.from_input(current_user.rol)
    target_rol = RolUsuario.from_input(target.rol)

    # Solo un superadmin puede asignar el rol superadmin
    if nuevo_rol == RolUsuario.SUPERADMIN and current_user_rol != RolUsuario.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Solo un superadmin puede asignar el rol superadmin.")

    # Anti-escalada: solo un superadmin puede MODIFICAR a otro superadmin
    # (un admin no puede degradar/desactivar/renombrar una cuenta superadmin).
    if target_rol == RolUsuario.SUPERADMIN and current_user_rol != RolUsuario.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Solo un superadmin puede modificar a otro superadmin.")

    # Auto-protección: un superadmin no puede degradarse ni desactivarse a sí mismo
    if target.id == current_user.id:
        if nuevo_rol is not None and nuevo_rol != RolUsuario.SUPERADMIN and current_user_rol == RolUsuario.SUPERADMIN:
            raise HTTPException(status_code=400, detail="No puedes degradarte ni desactivarte a ti mismo.")
        if nuevo_activo is False:
            raise HTTPException(status_code=400, detail="No puedes degradarte ni desactivarte a ti mismo.")

    # Protección último superadmin activo: no degradar ni desactivar si es el único
    target_is_active_superadmin = (target_rol == RolUsuario.SUPERADMIN and target.activo)
    would_demote = nuevo_rol is not None and nuevo_rol != RolUsuario.SUPERADMIN
    would_deactivate = nuevo_activo is False

    if target_is_active_superadmin and (would_demote or would_deactivate):
        active_superadmin_count = (
            db.query(models.Usuario)
            .filter(models.Usuario.rol == RolUsuario.SUPERADMIN, models.Usuario.activo.is_(True))
            .count()
        )
        if active_superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="No puedes degradar/desactivar al último superadmin activo.")

    try:
        if "email" in data and data["email"] and data["email"] != target.email:
            if UserService.get_user_by_email(db, data["email"]):
                raise HTTPException(400, "El correo ya está registrado")
        for k, v in data.items():
            setattr(target, k, v)
        db.commit()
        db.refresh(target)
        return target
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("usuarios.actualizar_usuario falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.post("/{user_id}/password", dependencies=[Depends(allow_user_admin)])
def reset_password(
    user_id: int,
    payload: PasswordResetIn,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Reset de contraseña por admin. No requiere la contraseña previa."""
    user = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    # Anti-escalada: solo un superadmin puede resetear la contraseña de otro superadmin.
    if (
        RolUsuario.from_input(user.rol) == RolUsuario.SUPERADMIN
        and RolUsuario.from_input(current_user.rol) != RolUsuario.SUPERADMIN
    ):
        raise HTTPException(status_code=403, detail="Solo un superadmin puede resetear la contraseña de otro superadmin.")

    try:
        user.password_hash = UserService.get_password_hash(payload.password)
        db.commit()
        return {
            "ok": True,
            "user_id": user.id,
            "email": user.email,
            "actualizado_por": current_user.email,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("usuarios.reset_password falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.delete("/{user_id}", dependencies=[Depends(allow_user_admin)])
def eliminar_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    user_to_delete = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user_to_delete.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    # Anti-escalada: solo un superadmin puede eliminar a otro superadmin.
    if (
        RolUsuario.from_input(user_to_delete.rol) == RolUsuario.SUPERADMIN
        and RolUsuario.from_input(current_user.rol) != RolUsuario.SUPERADMIN
    ):
        raise HTTPException(status_code=403, detail="Solo un superadmin puede eliminar a otro superadmin.")

    # Protección último superadmin activo
    if (
        RolUsuario.from_input(user_to_delete.rol) == RolUsuario.SUPERADMIN
        and user_to_delete.activo
    ):
        active_superadmin_count = (
            db.query(models.Usuario)
            .filter(models.Usuario.rol == RolUsuario.SUPERADMIN, models.Usuario.activo.is_(True))
            .count()
        )
        if active_superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="No puedes eliminar al último superadmin activo.")

    try:
        db.delete(user_to_delete)
        db.commit()
        return {"mensaje": "Usuario eliminado"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("usuarios.eliminar_usuario falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")
