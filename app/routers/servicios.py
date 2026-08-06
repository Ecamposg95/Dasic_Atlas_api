"""Router CRUD del catálogo de Servicios.

Servicios reutilizables (mano de obra, instalación, asesoría, etc.) que se
pueden agregar a una cotización como línea independiente. Cuando se requieren
materiales, se suman como líneas adicionales de productos del catálogo.

SAT defaults aplicados en backend: clave_prod_serv=81111500, clave_unidad=E48.
"""

import logging
from typing import Optional

import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

logger = logging.getLogger(__name__)
from app.models.services import (
    SERVICIO_SAT_DEFAULT_OBJETO_IMP,
    SERVICIO_SAT_DEFAULT_PROD_SERV,
    SERVICIO_SAT_DEFAULT_UNIDAD,
)
from app.security import (
    allow_admin,
    allow_admin_asistente,
    allow_all_staff,
    get_current_user,
)

router = APIRouter(prefix="/api/servicios", tags=["Servicios"])


def _aplicar_defaults_sat(payload: dict) -> dict:
    """SAT defaults: 81111500 / E48 / 02. Si vienen vacíos los rellena."""
    if not payload.get("clave_prod_serv"):
        payload["clave_prod_serv"] = SERVICIO_SAT_DEFAULT_PROD_SERV
    else:
        payload["clave_prod_serv"] = str(payload["clave_prod_serv"]).strip()
    if not payload.get("clave_unidad_sat"):
        payload["clave_unidad_sat"] = SERVICIO_SAT_DEFAULT_UNIDAD
    else:
        payload["clave_unidad_sat"] = str(payload["clave_unidad_sat"]).strip().upper()
    if not payload.get("objeto_imp"):
        payload["objeto_imp"] = SERVICIO_SAT_DEFAULT_OBJETO_IMP
    if not payload.get("moneda"):
        payload["moneda"] = "MXN"
    else:
        payload["moneda"] = str(payload["moneda"]).strip().upper()
    if not payload.get("codigo"):
        # No autogeneramos código aquí; el frontend manda algo legible (SRV-0001).
        # Si llega vacío, devolvemos error de validación.
        pass
    else:
        payload["codigo"] = str(payload["codigo"]).strip().upper()
    return payload


def _siguiente_codigo(db: Session) -> str:
    """Sugiere el siguiente SRV-NNNN basado en el máximo numérico actual."""
    max_n = 0
    for (c,) in db.query(models.Servicio.codigo).filter(
        models.Servicio.codigo.like("SRV-%")
    ).all():
        try:
            n = int(c.split("-", 1)[1])
            if n > max_n:
                max_n = n
        except (IndexError, ValueError):
            continue
    return f"SRV-{max_n + 1:04d}"


# --- LISTAR ---
@router.get("/", dependencies=[Depends(allow_all_staff)])
def listar_servicios(
    activo: Optional[bool] = True,
    categoria: Optional[str] = None,
    q: Optional[str] = Query(None, description="Búsqueda en código/nombre/descripción"),
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
):
    if page < 1 or page_size < 1 or page_size > 200:
        raise HTTPException(400, "page o page_size inválido")

    offset = (page - 1) * page_size

    query = db.query(models.Servicio)
    if activo is not None:
        query = query.filter(models.Servicio.activo == activo)
    if categoria:
        query = query.filter(models.Servicio.categoria_servicio == categoria)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.Servicio.codigo.ilike(like),
            models.Servicio.nombre.ilike(like),
            models.Servicio.descripcion.ilike(like),
        ))

    total = query.count()
    rows = (
        query.order_by(models.Servicio.codigo)
        .offset(offset)
        .limit(page_size)
        .all()
    )
    items = [schemas.ServicioResponse.model_validate(r) for r in rows]
    return {"page": page, "page_size": page_size, "total": total, "items": items}


# --- BUSCAR (typeahead para cotizador) ---
@router.get("/buscar", response_model=list[schemas.ServicioResponse],
            dependencies=[Depends(allow_all_staff)])
def buscar_servicios(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    like = f"%{q.strip()}%"
    rows = (
        db.query(models.Servicio)
        .filter(models.Servicio.activo == True)  # noqa: E712
        .filter(or_(
            models.Servicio.codigo.ilike(like),
            models.Servicio.nombre.ilike(like),
            models.Servicio.descripcion.ilike(like),
        ))
        .order_by(models.Servicio.nombre)
        .limit(limit)
        .all()
    )
    return rows


# --- CÓDIGO SUGERIDO ---
@router.get("/utils/proximo-codigo",
            dependencies=[Depends(allow_admin_asistente)])
def proximo_codigo(db: Session = Depends(get_db)):
    return {"codigo": _siguiente_codigo(db)}


# --- CATEGORÍAS DISTINTAS ---
@router.get("/utils/categorias",
            dependencies=[Depends(allow_all_staff)])
def listar_categorias(db: Session = Depends(get_db)):
    rows = (
        db.query(
            models.Servicio.categoria_servicio,
            func.count(models.Servicio.id).label("n"),
        )
        .filter(models.Servicio.categoria_servicio.is_not(None))
        .group_by(models.Servicio.categoria_servicio)
        .order_by(models.Servicio.categoria_servicio)
        .all()
    )
    return {
        "items": [{"categoria": c, "n": int(n)} for (c, n) in rows],
        "sugeridas": ["instalacion", "mantto", "asesoria", "otro"],
    }


# --- OBTENER ---
@router.get("/{id}", response_model=schemas.ServicioResponse,
            dependencies=[Depends(allow_all_staff)])
def obtener_servicio(id: int, db: Session = Depends(get_db)):
    s = db.query(models.Servicio).filter(models.Servicio.id == id).first()
    if not s:
        raise HTTPException(404, "Servicio no encontrado")
    return s


# --- CREAR ---
@router.post("/", response_model=schemas.ServicioResponse,
             dependencies=[Depends(allow_admin_asistente)])
def crear_servicio(
    payload: schemas.ServicioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    data = _aplicar_defaults_sat(payload.model_dump())

    # Verifica unicidad de código
    existing = db.query(models.Servicio).filter(
        models.Servicio.codigo == data["codigo"]
    ).first()
    if existing:
        raise HTTPException(400, f"Ya existe un servicio con código '{data['codigo']}'.")

    try:
        nuevo = models.Servicio(**data, creado_por_id=current_user.id)
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)
        return nuevo
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("servicios.crear_servicio falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# --- ACTUALIZAR ---
@router.put("/{id}", response_model=schemas.ServicioResponse,
            dependencies=[Depends(allow_admin_asistente)])
def actualizar_servicio(
    id: int,
    payload: schemas.ServicioUpdate,
    db: Session = Depends(get_db),
):
    s = db.query(models.Servicio).filter(models.Servicio.id == id).first()
    if not s:
        raise HTTPException(404, "Servicio no encontrado")

    try:
        data = payload.model_dump(exclude_unset=True)
        # Si el body trae código nuevo, validar unicidad.
        if "codigo" in data and data["codigo"]:
            data["codigo"] = data["codigo"].strip().upper()
            clash = (
                db.query(models.Servicio)
                .filter(models.Servicio.codigo == data["codigo"])
                .filter(models.Servicio.id != id)
                .first()
            )
            if clash:
                raise HTTPException(400, f"Ya existe otro servicio con código '{data['codigo']}'.")

        if "clave_unidad_sat" in data and data["clave_unidad_sat"]:
            data["clave_unidad_sat"] = data["clave_unidad_sat"].strip().upper()
        if "clave_prod_serv" in data and data["clave_prod_serv"]:
            data["clave_prod_serv"] = data["clave_prod_serv"].strip()
        if "moneda" in data and data["moneda"]:
            data["moneda"] = data["moneda"].strip().upper()

        for k, v in data.items():
            setattr(s, k, v)
        db.commit()
        db.refresh(s)
        return s
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("servicios.actualizar_servicio falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# --- ELIMINAR ---
@router.delete("/{id}", dependencies=[Depends(allow_admin)])
def eliminar_servicio(id: int, db: Session = Depends(get_db)):
    """Elimina un servicio. Si tiene referencias en DetalleOrden lo marca
    como inactivo en lugar de borrarlo (soft delete)."""
    s = db.query(models.Servicio).filter(models.Servicio.id == id).first()
    if not s:
        raise HTTPException(404, "Servicio no encontrado")

    # Check referencias en DetalleOrden (servicio_id se agrega en Fase 4;
    # mientras tanto la columna puede no existir, así que envolvemos en try).
    # CRÍTICO: solo silenciamos OperationalError/ProgrammingError (columna no
    # existe pre-Fase 4). Otras excepciones deben propagar — si por ej. el
    # query falla por otra razón, no queremos asumir "sin referencias" y borrar
    # servicios que sí estén siendo usados.
    try:
        en_uso = (
            db.query(models.DetalleOrden.id)
            .filter(models.DetalleOrden.servicio_id == id)  # type: ignore[attr-defined]
            .first()
        )
    except (sqlalchemy.exc.OperationalError, sqlalchemy.exc.ProgrammingError):
        en_uso = None

    if en_uso:
        s.activo = False
        db.commit()
        return {"mensaje": "Servicio referenciado en cotizaciones. Se marcó como inactivo."}

    db.delete(s)
    db.commit()
    return {"mensaje": "Servicio eliminado correctamente."}


# --- HISTORIAL DE USO ---
@router.get("/{id}/historial-uso",
            dependencies=[Depends(allow_all_staff)])
def historial_uso(id: int, db: Session = Depends(get_db)):
    """Cotizaciones donde se usó este servicio. Vacío hasta Fase 4 si la
    columna `servicio_id` no existe en DetalleOrden."""
    s = db.query(models.Servicio).filter(models.Servicio.id == id).first()
    if not s:
        raise HTTPException(404, "Servicio no encontrado")
    try:
        rows = (
            db.query(models.OrdenVenta)
            .join(models.DetalleOrden, models.DetalleOrden.orden_id == models.OrdenVenta.id)
            .filter(models.DetalleOrden.servicio_id == id)  # type: ignore[attr-defined]
            .order_by(models.OrdenVenta.fecha_creacion.desc())
            .limit(50)
            .all()
        )
    except Exception:
        return {"items": [], "nota": "Historial disponible tras Fase 4."}
    return {
        "items": [
            {
                "id": o.id,
                "folio": o.folio,
                "fecha": o.fecha_creacion.isoformat() if o.fecha_creacion else None,
                "estatus": o.estatus,
                "total": float(o.total or 0),
            }
            for o in rows
        ]
    }
