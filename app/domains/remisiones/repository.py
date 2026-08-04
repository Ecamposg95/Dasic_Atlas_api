"""Queries puras del dominio remisiones. Sin reglas de negocio, sin HTTP."""
from decimal import Decimal
from typing import Optional

from sqlalchemy import desc, func
from sqlalchemy.orm import Session, aliased

from app import models

ESTADOS_QUE_ENTREGAN = (models.EstadoRemision.EMITIDA, models.EstadoRemision.RECIBIDA)


def entregado_por_detalle(db: Session, orden_venta_id: int) -> dict[int, Decimal]:
    rows = (
        db.query(
            models.DetalleRemision.detalle_orden_id,
            func.coalesce(func.sum(models.DetalleRemision.cantidad), 0),
        )
        .join(models.Remision, models.Remision.id == models.DetalleRemision.remision_id)
        .filter(
            models.Remision.orden_venta_id == orden_venta_id,
            models.Remision.estado.in_(ESTADOS_QUE_ENTREGAN),
            models.DetalleRemision.detalle_orden_id.isnot(None),
        )
        .group_by(models.DetalleRemision.detalle_orden_id)
        .all()
    )
    return {det_id: Decimal(str(total)) for det_id, total in rows}


def pendientes_por_detalle(db: Session, orden) -> dict[int, Decimal]:
    entregado = entregado_por_detalle(db, orden.id)
    return {
        d.id: Decimal(str(d.cantidad)) - entregado.get(d.id, Decimal("0"))
        for d in orden.detalles
    }


def listar(db: Session, *, q: Optional[str] = None, orden_venta_id: Optional[int] = None,
           estado=None, desde=None, hasta=None,
           creado_por_id: Optional[int] = None, owner_id: Optional[int] = None,
           page: int = 1, page_size: int = 100):
    """`estado` acepta un solo valor (equality) o un iterable de valores
    (IN) — este segundo caso lo usa el router para el filtro "OPERATIVO solo
    ve emitida/recibida" sin tener que abrir dos queries y fusionar
    paginación a mano."""
    query = db.query(models.Remision)
    if orden_venta_id:
        query = query.filter(models.Remision.orden_venta_id == orden_venta_id)
    if estado:
        if isinstance(estado, (list, tuple, set, frozenset)):
            query = query.filter(
                models.Remision.estado.in_([models.EstadoRemision(e) for e in estado]))
        else:
            query = query.filter(models.Remision.estado == models.EstadoRemision(estado))
    if desde is not None:
        query = query.filter(models.Remision.fecha_remision >= desde)
    if hasta is not None:
        query = query.filter(models.Remision.fecha_remision <= hasta)
    if creado_por_id:
        query = query.filter(models.Remision.creado_por_id == creado_por_id)
    if owner_id is not None:
        query = query.filter(models.Remision.creado_por_id == owner_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        cli_directo = aliased(models.Cliente)
        cli_orden = aliased(models.Cliente)
        query = (
            query
            .outerjoin(cli_directo, models.Remision.cliente.of_type(cli_directo))
            .outerjoin(models.Remision.orden_venta)
            .outerjoin(cli_orden, models.OrdenVenta.cliente.of_type(cli_orden))
            .filter(
                models.Remision.folio.ilike(like)
                | cli_directo.nombre_empresa.ilike(like)
                | cli_orden.nombre_empresa.ilike(like)
            )
            .distinct()
        )
    total = query.count()
    rows = (query.order_by(desc(models.Remision.fecha_remision))
            .offset((page - 1) * page_size).limit(page_size).all())
    return total, rows
