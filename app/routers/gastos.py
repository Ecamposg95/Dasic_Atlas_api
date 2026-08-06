import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func
from decimal import Decimal
from datetime import datetime, date
from pydantic import BaseModel, Field
from typing import List, Optional

from app import models
from app.db import get_db
from app.security import allow_admin, allow_admin_asistente, allow_all_staff, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gastos", tags=["Gastos Operativos"])

# --- SCHEMAS ---
class GastoCreate(BaseModel):
    categoria: str = Field(..., min_length=1, max_length=80)
    descripcion: Optional[str] = None
    monto: Decimal = Field(..., gt=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)

class GastoUpdate(BaseModel):
    categoria: Optional[str] = Field(None, min_length=1, max_length=80)
    descripcion: Optional[str] = None
    monto: Optional[Decimal] = Field(None, gt=0)
    moneda: Optional[str] = Field(None, min_length=3, max_length=3)

class GastoResponse(BaseModel):
    id: int
    categoria: str
    descripcion: Optional[str] = None
    monto: Decimal
    moneda: str = "MXN"
    fecha: datetime
    usuario: Optional[str] = None
    usuario_id: Optional[int] = None

    class Config:
        from_attributes = True

# --- ENDPOINTS ---

@router.get("/", dependencies=[Depends(allow_admin_asistente)])
def listar_gastos(
    page: int = 1,
    page_size: int = 50,
    q: Optional[str] = None,
    categoria: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    db: Session = Depends(get_db),
):
    if page < 1 or page_size < 1 or page_size > 200:
        raise HTTPException(400, "page o page_size inválido")

    offset = (page - 1) * page_size

    query = db.query(models.Gasto)

    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.Gasto.descripcion.ilike(like),
                models.Gasto.categoria.ilike(like),
            )
        )
    if categoria:
        query = query.filter(models.Gasto.categoria == categoria)
    if fecha_desde:
        query = query.filter(func.date(models.Gasto.fecha) >= fecha_desde)
    if fecha_hasta:
        query = query.filter(func.date(models.Gasto.fecha) <= fecha_hasta)

    total = query.count()

    # Gran total del conjunto FILTRADO completo (no solo la página), por moneda.
    # La expresión debe ser EL MISMO objeto en select y group_by: dos llamadas a
    # func.coalesce generan bind params distintos ($1/$2) y Postgres rechaza el
    # GROUP BY (GroupingError). SQLite lo tolera, por eso los tests no lo cazan.
    moneda_expr = func.coalesce(models.Gasto.moneda, "MXN")
    totales_raw = (
        query.with_entities(moneda_expr, func.sum(models.Gasto.monto))
        .group_by(moneda_expr)
        .all()
    )
    totales = {"MXN": 0.0, "USD": 0.0}
    for moneda, suma in totales_raw:
        key = (moneda or "MXN").upper()
        totales[key] = float(suma or 0)

    gastos = (
        query.order_by(desc(models.Gasto.fecha))
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = []
    for g in gastos:
        nombre_user = g.usuario.nombre if g.usuario else "Sistema"
        items.append(GastoResponse(
            id=g.id,
            categoria=g.categoria,
            descripcion=g.descripcion,
            monto=g.monto,
            moneda=g.moneda or "MXN",
            fecha=g.fecha,
            usuario=nombre_user,
            usuario_id=g.usuario_id,
        ))
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "totales": totales,
        "items": items,
    }


@router.get("/categorias", dependencies=[Depends(allow_admin_asistente)])
def listar_categorias(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Gasto.categoria)
        .distinct()
        .order_by(models.Gasto.categoria)
        .all()
    )
    return [r[0] for r in rows if r[0]]


@router.post("/", response_model=GastoResponse, dependencies=[Depends(allow_admin_asistente)])
def registrar_gasto(
    gasto: GastoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    try:
        nuevo = models.Gasto(
            categoria=gasto.categoria.strip(),
            descripcion=(gasto.descripcion or "").strip() or None,
            monto=gasto.monto,
            moneda=(gasto.moneda or "MXN").upper(),
            usuario_id=current_user.id,
        )
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)
        return GastoResponse(
            id=nuevo.id, categoria=nuevo.categoria, descripcion=nuevo.descripcion,
            monto=nuevo.monto, moneda=nuevo.moneda, fecha=nuevo.fecha,
            usuario=current_user.nombre, usuario_id=current_user.id,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("gastos.registrar_gasto falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.put("/{id}", response_model=GastoResponse, dependencies=[Depends(allow_admin_asistente)])
def editar_gasto(id: int, payload: GastoUpdate, db: Session = Depends(get_db)):
    g = db.query(models.Gasto).filter(models.Gasto.id == id).first()
    if not g:
        raise HTTPException(404, "Gasto no encontrado")

    try:
        data = payload.model_dump(exclude_unset=True)
        if "moneda" in data and data["moneda"]:
            data["moneda"] = data["moneda"].upper()
        for k, v in data.items():
            setattr(g, k, v)
        db.commit()
        db.refresh(g)
        return GastoResponse(
            id=g.id, categoria=g.categoria, descripcion=g.descripcion,
            monto=g.monto, moneda=g.moneda or "MXN", fecha=g.fecha,
            usuario=g.usuario.nombre if g.usuario else "Sistema",
            usuario_id=g.usuario_id,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("gastos.editar_gasto falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.delete("/{id}", dependencies=[Depends(allow_admin)])
def eliminar_gasto(id: int, db: Session = Depends(get_db)):
    g = db.query(models.Gasto).filter(models.Gasto.id == id).first()
    if not g:
        raise HTTPException(404, "Gasto no encontrado")
    db.delete(g)
    db.commit()
    return {"mensaje": "Eliminado"}
