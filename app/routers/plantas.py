"""Router de base instalada: Plantas y Activos instalados por cliente.

Lectura/creación/edición para todo el staff; borrado restringido a
admin/asistente. El borrado de una planta se bloquea (409) si tiene
activos — sin cascade a propósito.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.models.instalaciones import ActivoInstalado, Planta
from app.schemas.instalaciones import (
    ActivoCreate,
    ActivoOut,
    ActivoUpdate,
    PlantaCreate,
    PlantaOut,
    PlantaUpdate,
)
from app.security import allow_admin_asistente, allow_all_staff

router = APIRouter(prefix="/api", tags=["Base instalada"])


# ---------------------------------------------------------------------------
# Helpers 404
# ---------------------------------------------------------------------------
def _cliente_or_404(db: Session, cliente_id: int) -> models.Cliente:
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


def _planta_or_404(db: Session, planta_id: int) -> Planta:
    planta = db.query(Planta).filter(Planta.id == planta_id).first()
    if not planta:
        raise HTTPException(status_code=404, detail="Planta no encontrada")
    return planta


def _activo_or_404(db: Session, activo_id: int) -> ActivoInstalado:
    activo = (
        db.query(ActivoInstalado).filter(ActivoInstalado.id == activo_id).first()
    )
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo


def _validar_planta_de_cliente(
    db: Session, planta_id: int, cliente_id: int
) -> Planta:
    """400 si la planta no existe o no pertenece al cliente indicado."""
    planta = db.query(Planta).filter(Planta.id == planta_id).first()
    if not planta or planta.cliente_id != cliente_id:
        raise HTTPException(
            status_code=400,
            detail="planta_id no pertenece al cliente indicado",
        )
    return planta


def _activo_out(activo: ActivoInstalado, planta_nombre: Optional[str]) -> ActivoOut:
    base = ActivoOut.model_validate(activo)
    base.planta_nombre = planta_nombre
    return base


# ---------------------------------------------------------------------------
# Plantas
# ---------------------------------------------------------------------------
@router.get(
    "/clientes/{cliente_id}/plantas",
    response_model=list[PlantaOut],
    dependencies=[Depends(allow_all_staff)],
)
def listar_plantas(cliente_id: int, db: Session = Depends(get_db)):
    _cliente_or_404(db, cliente_id)
    return (
        db.query(Planta)
        .filter(Planta.cliente_id == cliente_id)
        .order_by(Planta.nombre)
        .all()
    )


@router.post(
    "/clientes/{cliente_id}/plantas",
    response_model=PlantaOut,
    status_code=201,
    dependencies=[Depends(allow_all_staff)],
)
def crear_planta(
    cliente_id: int,
    payload: PlantaCreate,
    db: Session = Depends(get_db),
):
    _cliente_or_404(db, cliente_id)
    planta = Planta(cliente_id=cliente_id, **payload.model_dump())
    db.add(planta)
    db.commit()
    db.refresh(planta)
    return planta


@router.patch(
    "/plantas/{planta_id}",
    response_model=PlantaOut,
    dependencies=[Depends(allow_all_staff)],
)
def actualizar_planta(
    planta_id: int,
    payload: PlantaUpdate,
    db: Session = Depends(get_db),
):
    planta = _planta_or_404(db, planta_id)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(planta, field, value)

    db.commit()
    db.refresh(planta)
    return planta


@router.delete(
    "/plantas/{planta_id}",
    status_code=204,
    dependencies=[Depends(allow_admin_asistente)],
)
def eliminar_planta(planta_id: int, db: Session = Depends(get_db)):
    planta = _planta_or_404(db, planta_id)

    activos_count = (
        db.query(func.count(ActivoInstalado.id))
        .filter(ActivoInstalado.planta_id == planta.id)
        .scalar()
    )
    if activos_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"La planta tiene {activos_count} activo(s); "
                "reasígnalos o elimínalos antes de borrarla"
            ),
        )

    db.delete(planta)
    db.commit()


# ---------------------------------------------------------------------------
# Activos instalados
# ---------------------------------------------------------------------------
@router.get(
    "/clientes/{cliente_id}/activos",
    response_model=list[ActivoOut],
    dependencies=[Depends(allow_all_staff)],
)
def listar_activos(
    cliente_id: int,
    planta_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _cliente_or_404(db, cliente_id)

    # Join a plantas para resolver planta_nombre sin N+1.
    q = (
        db.query(ActivoInstalado, Planta.nombre)
        .outerjoin(Planta, ActivoInstalado.planta_id == Planta.id)
        .filter(ActivoInstalado.cliente_id == cliente_id)
    )
    if planta_id is not None:
        q = q.filter(ActivoInstalado.planta_id == planta_id)

    rows = q.order_by(ActivoInstalado.nombre).all()
    return [_activo_out(activo, planta_nombre) for activo, planta_nombre in rows]


@router.post(
    "/clientes/{cliente_id}/activos",
    response_model=ActivoOut,
    status_code=201,
    dependencies=[Depends(allow_all_staff)],
)
def crear_activo(
    cliente_id: int,
    payload: ActivoCreate,
    db: Session = Depends(get_db),
):
    _cliente_or_404(db, cliente_id)

    planta_nombre = None
    if payload.planta_id is not None:
        planta = _validar_planta_de_cliente(db, payload.planta_id, cliente_id)
        planta_nombre = planta.nombre

    activo = ActivoInstalado(cliente_id=cliente_id, **payload.model_dump())
    db.add(activo)
    db.commit()
    db.refresh(activo)
    return _activo_out(activo, planta_nombre)


@router.patch(
    "/activos/{activo_id}",
    response_model=ActivoOut,
    dependencies=[Depends(allow_all_staff)],
)
def actualizar_activo(
    activo_id: int,
    payload: ActivoUpdate,
    db: Session = Depends(get_db),
):
    activo = _activo_or_404(db, activo_id)

    data = payload.model_dump(exclude_unset=True)
    if data.get("planta_id") is not None:
        _validar_planta_de_cliente(db, data["planta_id"], activo.cliente_id)

    for field, value in data.items():
        setattr(activo, field, value)

    db.commit()
    db.refresh(activo)
    return _activo_out(
        activo, activo.planta.nombre if activo.planta is not None else None
    )


@router.delete(
    "/activos/{activo_id}",
    status_code=204,
    dependencies=[Depends(allow_admin_asistente)],
)
def eliminar_activo(activo_id: int, db: Session = Depends(get_db)):
    activo = _activo_or_404(db, activo_id)
    db.delete(activo)
    db.commit()
