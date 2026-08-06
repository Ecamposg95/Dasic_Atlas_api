"""
Recordatorios de seguimiento — /api/recordatorios

Endpoints para crear, listar, completar, posponer y eliminar recordatorios
de seguimiento asociados a cotizaciones/órdenes. Mono-tenant (sin
organization_id). Owner-scoping: VENTAS solo ve/gestiona los suyos;
ADMIN/GERENTE ven todos.
"""

import logging
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.security import allow_all_staff, get_current_user
from app.security.permissions import is_owner_scoped
from app.schemas.recordatorios import RecordatorioCreate, RecordatorioPosponer
from app.core.fechas import hoy_negocio, rango_del_dia

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/recordatorios",
    tags=["Recordatorios"],
    dependencies=[Depends(allow_all_staff)],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_VISTAS = {"vencidos", "hoy", "proximos", "pendientes", "todos"}
_VALID_TIPOS = {"llamada", "email", "whatsapp", "visita", "otro"}
_VALID_ESTADOS = {"pendiente", "completado", "pospuesto"}


def _enrich(rec: "models.Recordatorio", hoy: date) -> dict:
    """Convierte una fila ORM en dict enriquecido con folio/cliente/dias."""
    orden = rec.orden
    folio = orden.folio if orden else None
    # Cliente: derivado de la orden; si es un recordatorio libre, del cliente directo.
    if orden and orden.cliente:
        cliente = orden.cliente.nombre_empresa
    elif rec.cliente:
        cliente = rec.cliente.nombre_empresa
    else:
        cliente = None
    usuario_nombre = rec.usuario.nombre if rec.usuario else None
    dias = (rec.fecha_proximo_contacto.date() - hoy).days
    return {
        "id": rec.id,
        "orden_id": rec.orden_id,
        "cliente_id": rec.cliente_id,
        "usuario_id": rec.usuario_id,
        "fecha_proximo_contacto": rec.fecha_proximo_contacto,
        "tipo_accion": rec.tipo_accion,
        "descripcion": rec.descripcion,
        "estado": rec.estado,
        "creado_en": rec.creado_en,
        "completado_en": rec.completado_en,
        "folio": folio,
        "cliente": cliente,
        "usuario_nombre": usuario_nombre,
        "dias": dias,
    }


def _check_owner_or_403(
    rec: "models.Recordatorio",
    current_user: "models.Usuario",
) -> None:
    """Bloquea operaciones de VENTAS sobre recordatorios que no son suyos."""
    if is_owner_scoped(current_user, "read", "cotizacion"):
        if rec.usuario_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tienes permiso para modificar este recordatorio")


# ---------------------------------------------------------------------------
# POST / — crear recordatorio
# ---------------------------------------------------------------------------

@router.post("/", summary="Crear recordatorio de seguimiento")
def crear_recordatorio(
    payload: RecordatorioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    # Validar tipo_accion
    if payload.tipo_accion not in _VALID_TIPOS:
        raise HTTPException(
            400,
            f"tipo_accion inválido. Valores permitidos: {sorted(_VALID_TIPOS)}",
        )

    # Validar orden SOLO si viene (recordatorio libre = sin orden)
    orden = None
    if payload.orden_id is not None:
        orden = db.query(models.OrdenVenta).filter(
            models.OrdenVenta.id == payload.orden_id
        ).first()
        if not orden:
            raise HTTPException(404, "Orden/cotización no encontrada")

    # Cliente destino: explícito en el body o derivado de la orden.
    cliente_id = payload.cliente_id
    if cliente_id is not None:
        cliente = db.query(models.Cliente).filter(
            models.Cliente.id == cliente_id
        ).first()
        if not cliente:
            raise HTTPException(404, "Cliente no encontrado")
    elif orden is not None:
        cliente_id = orden.cliente_id

    # El usuario asignado es el vendedor de la orden; si no hay orden o vendedor,
    # recae en quien crea el recordatorio.
    usuario_id = (orden.vendedor_id if orden else None) or current_user.id

    rec = models.Recordatorio(
        orden_id=payload.orden_id,
        cliente_id=cliente_id,
        usuario_id=usuario_id,
        fecha_proximo_contacto=payload.fecha_proximo_contacto,
        tipo_accion=payload.tipo_accion,
        descripcion=payload.descripcion,
        estado="pendiente",
        creado_por_id=current_user.id,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    hoy = hoy_negocio()
    return _enrich(rec, hoy)


# ---------------------------------------------------------------------------
# GET / — listar por vista
# ---------------------------------------------------------------------------

@router.get("/", summary="Listar recordatorios (filtrado por vista)")
def listar_recordatorios(
    vista: str = Query("pendientes", description="vencidos|hoy|proximos|pendientes|todos"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if vista not in _VALID_VISTAS:
        raise HTTPException(
            400,
            f"vista inválida. Valores permitidos: {sorted(_VALID_VISTAS)}",
        )

    hoy = hoy_negocio()
    # Usar datetime.combine para comparaciones de rangos (evita TZ drift)
    # Patrón idéntico al usado en ventas.py (historial usa .date() directamente,
    # aquí usamos combine para rangos explícitos en la columna con TZ).
    # tzinfo=UTC: la columna es DateTime(timezone=True); comparar con naive
    # delega la coerción al TZ del server (frágil fuera de UTC). Lo hacemos explícito.
    # Límites anclados en la zona del NEGOCIO, no en UTC: fijarlos a medianoche
    # UTC de una fecha local hacía que "hoy" abarcara de las 18:00 de ayer a las
    # 17:59 de hoy, así que un recordatorio de la tarde caía en el día siguiente.
    inicio_hoy, fin_hoy = rango_del_dia(hoy)
    from datetime import timedelta
    _, fin_proximos = rango_del_dia(hoy + timedelta(days=7))

    query = db.query(models.Recordatorio)

    # Owner-scoping
    if is_owner_scoped(current_user, "read", "cotizacion"):
        query = query.filter(models.Recordatorio.usuario_id == current_user.id)

    # Filtros por vista
    if vista == "vencidos":
        query = query.filter(
            models.Recordatorio.estado == "pendiente",
            models.Recordatorio.fecha_proximo_contacto < inicio_hoy,
        )
    elif vista == "hoy":
        query = query.filter(
            models.Recordatorio.estado == "pendiente",
            models.Recordatorio.fecha_proximo_contacto >= inicio_hoy,
            models.Recordatorio.fecha_proximo_contacto <= fin_hoy,
        )
    elif vista == "proximos":
        query = query.filter(
            models.Recordatorio.estado == "pendiente",
            models.Recordatorio.fecha_proximo_contacto > fin_hoy,
            models.Recordatorio.fecha_proximo_contacto <= fin_proximos,
        )
    elif vista == "pendientes":
        query = query.filter(models.Recordatorio.estado == "pendiente")
    # "todos" → sin filtro de estado

    rows = query.order_by(models.Recordatorio.fecha_proximo_contacto.asc()).all()
    return [_enrich(r, hoy) for r in rows]


# ---------------------------------------------------------------------------
# GET /resumen — contadores para badge del dashboard
# ---------------------------------------------------------------------------

@router.get("/resumen", summary="Contadores de recordatorios pendientes")
def resumen_recordatorios(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    from datetime import timedelta

    hoy = hoy_negocio()
    inicio_hoy = datetime.combine(hoy, time.min, tzinfo=timezone.utc)
    fin_hoy = datetime.combine(hoy, time.max, tzinfo=timezone.utc)
    fin_proximos = datetime.combine(hoy + timedelta(days=7), time.max, tzinfo=timezone.utc)

    base = db.query(models.Recordatorio).filter(
        models.Recordatorio.estado == "pendiente"
    )
    if is_owner_scoped(current_user, "read", "cotizacion"):
        base = base.filter(models.Recordatorio.usuario_id == current_user.id)

    vencidos = base.filter(
        models.Recordatorio.fecha_proximo_contacto < inicio_hoy
    ).count()

    hoy_count = base.filter(
        models.Recordatorio.fecha_proximo_contacto >= inicio_hoy,
        models.Recordatorio.fecha_proximo_contacto <= fin_hoy,
    ).count()

    proximos_7d = base.filter(
        models.Recordatorio.fecha_proximo_contacto > fin_hoy,
        models.Recordatorio.fecha_proximo_contacto <= fin_proximos,
    ).count()

    pendientes_total = base.count()

    return {
        "vencidos": vencidos,
        "hoy": hoy_count,
        "proximos_7d": proximos_7d,
        "pendientes_total": pendientes_total,
    }


# ---------------------------------------------------------------------------
# PATCH /{id}/completar
# ---------------------------------------------------------------------------

@router.patch("/{recordatorio_id}/completar", summary="Marcar recordatorio como completado")
def completar_recordatorio(
    recordatorio_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.Recordatorio).filter(
        models.Recordatorio.id == recordatorio_id
    ).first()
    if not rec:
        raise HTTPException(404, "Recordatorio no encontrado")

    _check_owner_or_403(rec, current_user)

    rec.estado = "completado"
    rec.completado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rec)

    hoy = hoy_negocio()
    return _enrich(rec, hoy)


# ---------------------------------------------------------------------------
# PATCH /{id}/posponer
# ---------------------------------------------------------------------------

@router.patch("/{recordatorio_id}/posponer", summary="Posponer un recordatorio")
def posponer_recordatorio(
    recordatorio_id: int,
    payload: RecordatorioPosponer,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.Recordatorio).filter(
        models.Recordatorio.id == recordatorio_id
    ).first()
    if not rec:
        raise HTTPException(404, "Recordatorio no encontrado")

    _check_owner_or_403(rec, current_user)

    rec.fecha_proximo_contacto = payload.nueva_fecha
    rec.estado = "pendiente"
    db.commit()
    db.refresh(rec)

    hoy = hoy_negocio()
    return _enrich(rec, hoy)


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------

@router.delete("/{recordatorio_id}", summary="Eliminar recordatorio")
def eliminar_recordatorio(
    recordatorio_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    rec = db.query(models.Recordatorio).filter(
        models.Recordatorio.id == recordatorio_id
    ).first()
    if not rec:
        raise HTTPException(404, "Recordatorio no encontrado")

    _check_owner_or_403(rec, current_user)

    db.delete(rec)
    db.commit()
    return {"ok": True, "id": recordatorio_id}
