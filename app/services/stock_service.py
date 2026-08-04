"""Operaciones de stock auditables.

Toda mutación al stock pasa por aquí. Las reservas (cotizaciones vivas)
no modifican stock_actual pero afectan disponible.

disponible = stock_actual - sum(cantidad neta de RESERVA/LIBERACION sobre cotizaciones COTIZACION)

Una reserva está "activa" si la cotización referenciada existe y está en
estatus COTIZACION (no convertida ni cancelada). La conversión transforma
RESERVA → SALIDA (vía consumir_reservas_a_salida). La cancelación emite
LIBERACION (vía liberar_reservas_cotizacion).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.models.enums import EstatusOrden, TipoMovimientoStock


def cantidad_entera_para_stock(cantidad, sku: str) -> int:
    """Valida y castea la cantidad (Decimal(12,3), snapshot comercial de la
    línea) al `int` que exige `movimientos_stock.cantidad`.

    Solo las líneas con producto de catálogo mueven/reservan stock físico
    (kardex); esa columna sigue siendo `Integer` — Task 4 solo llevó
    `DetalleOrden.cantidad`/`DetalleRemision.cantidad` a Numeric(12,3) a
    nivel de línea comercial, no el inventario físico. Si la cantidad trae
    parte fraccionaria (p.ej. "2.5" de una unidad tipo MTS), NO hay forma
    correcta de moverla en un kardex de unidades enteras — se rechaza en vez
    de redondear en silencio (redondear falsearía el stock reservado/movido).
    """
    cantidad_dec = Decimal(cantidad)
    if cantidad_dec != cantidad_dec.to_integral_value():
        raise HTTPException(
            400,
            f"La línea de {sku} mueve inventario y su cantidad debe ser entera",
        )
    return int(cantidad_dec)


def aplicar_movimiento(
    db: Session,
    *,
    producto: "models.Producto",
    tipo: str,
    cantidad: int,
    referencia_tipo: Optional[str] = None,
    referencia_id: Optional[int] = None,
    motivo: Optional[str] = None,
    usuario: Optional["models.Usuario"] = None,
) -> "models.MovimientoStock":
    # SELECT ... FOR UPDATE: serializa mutaciones concurrentes sobre el mismo
    # producto. Sin esto, dos transacciones paralelas leen el mismo stock_actual
    # y producen lost-update silencioso.
    producto = (
        db.query(models.Producto)
        .populate_existing()
        .with_for_update()
        .filter(models.Producto.id == producto.id)
        .one()
    )

    afecta_stock = tipo in (
        TipoMovimientoStock.ENTRADA.value,
        TipoMovimientoStock.SALIDA.value,
        TipoMovimientoStock.AJUSTE.value,
    )
    if afecta_stock:
        nuevo = (producto.stock_actual or 0) + cantidad
        if nuevo < 0:
            raise ValueError(
                f"Stock no puede quedar negativo para {producto.sku} "
                f"(actual={producto.stock_actual}, delta={cantidad})"
            )
        producto.stock_actual = nuevo
        stock_resultante = nuevo
    else:
        stock_resultante = producto.stock_actual or 0

    mov = models.MovimientoStock(
        producto_id=producto.id,
        tipo=tipo,
        cantidad=cantidad,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
        motivo=motivo,
        usuario_id=usuario.id if usuario else None,
        stock_resultante=stock_resultante,
    )
    db.add(mov)
    db.flush()
    return mov


def reservas_activas(db: Session, producto_id: int) -> int:
    """Suma neta (RESERVA + LIBERACION ya negativa) sobre cotizaciones aún en COTIZACION."""
    rows = (
        db.query(
            models.MovimientoStock.tipo,
            func.coalesce(func.sum(models.MovimientoStock.cantidad), 0),
        )
        .join(
            models.OrdenVenta,
            models.OrdenVenta.id == models.MovimientoStock.referencia_id,
        )
        .filter(
            models.MovimientoStock.producto_id == producto_id,
            models.MovimientoStock.referencia_tipo == "cotizacion",
            models.MovimientoStock.tipo.in_([
                TipoMovimientoStock.RESERVA.value,
                TipoMovimientoStock.LIBERACION.value,
            ]),
            models.OrdenVenta.estatus == EstatusOrden.COTIZACION,
        )
        .group_by(models.MovimientoStock.tipo)
        .all()
    )
    reservado = 0
    for _tipo, suma in rows:
        reservado += int(suma or 0)
    return max(reservado, 0)


def disponibilidad(db: Session, producto: "models.Producto") -> dict:
    reservado = reservas_activas(db, producto.id)
    en_oc_q = (
        db.query(func.coalesce(func.sum(models.DetalleCompra.cantidad), 0))
        .join(
            models.OrdenCompra,
            models.OrdenCompra.id == models.DetalleCompra.orden_compra_id,
        )
        .filter(
            models.DetalleCompra.producto_id == producto.id,
            models.OrdenCompra.estatus.in_(["borrador", "enviada", "confirmada"]),
        )
    )
    en_oc = int(en_oc_q.scalar() or 0)
    return {
        "producto_id": producto.id,
        "stock_actual": producto.stock_actual or 0,
        "reservado": reservado,
        "disponible": (producto.stock_actual or 0) - reservado,
        "en_oc_pendiente": en_oc,
    }


def reservar_para_cotizacion(
    db: Session,
    *,
    producto: "models.Producto",
    cantidad: int,
    cotizacion_id: int,
    usuario: Optional["models.Usuario"] = None,
) -> "models.MovimientoStock":
    return aplicar_movimiento(
        db,
        producto=producto,
        tipo=TipoMovimientoStock.RESERVA.value,
        cantidad=cantidad,
        referencia_tipo="cotizacion",
        referencia_id=cotizacion_id,
        usuario=usuario,
    )


def _neto_reservas_por_producto(db: Session, cotizacion_id: int) -> dict[int, int]:
    """Suma RESERVA - LIBERACION ya emitida sobre la cotización, agrupado por producto."""
    rows = (
        db.query(
            models.MovimientoStock.producto_id,
            func.coalesce(func.sum(models.MovimientoStock.cantidad), 0),
        )
        .filter(
            models.MovimientoStock.referencia_tipo == "cotizacion",
            models.MovimientoStock.referencia_id == cotizacion_id,
            models.MovimientoStock.tipo.in_([
                TipoMovimientoStock.RESERVA.value,
                TipoMovimientoStock.LIBERACION.value,
            ]),
        )
        .group_by(models.MovimientoStock.producto_id)
        .all()
    )
    return {pid: int(total or 0) for pid, total in rows}


def liberar_reservas_cotizacion(
    db: Session,
    *,
    cotizacion_id: int,
    motivo: str = "cotización cancelada/vencida",
    usuario: Optional["models.Usuario"] = None,
) -> int:
    """Emite LIBERACION por cada producto con neto positivo. Idempotente."""
    netas = _neto_reservas_por_producto(db, cotizacion_id)
    emitidas = 0
    for producto_id, neto in netas.items():
        if neto <= 0:
            continue
        producto = db.get(models.Producto, producto_id)
        if not producto:
            continue
        aplicar_movimiento(
            db,
            producto=producto,
            tipo=TipoMovimientoStock.LIBERACION.value,
            cantidad=-neto,
            referencia_tipo="cotizacion",
            referencia_id=cotizacion_id,
            motivo=motivo,
            usuario=usuario,
        )
        emitidas += 1
    return emitidas


def consumir_reservas_a_salida(
    db: Session,
    *,
    cotizacion_id: int,
    usuario: Optional["models.Usuario"] = None,
) -> int:
    """Convertir cotización a venta: por cada reserva neta, emite LIBERACION + SALIDA."""
    netas = _neto_reservas_por_producto(db, cotizacion_id)
    procesadas = 0
    for producto_id, neto in netas.items():
        if neto <= 0:
            continue
        producto = db.get(models.Producto, producto_id)
        if not producto:
            continue
        aplicar_movimiento(
            db,
            producto=producto,
            tipo=TipoMovimientoStock.LIBERACION.value,
            cantidad=-neto,
            referencia_tipo="cotizacion",
            referencia_id=cotizacion_id,
            motivo="convertida a venta",
            usuario=usuario,
        )
        aplicar_movimiento(
            db,
            producto=producto,
            tipo=TipoMovimientoStock.SALIDA.value,
            cantidad=-neto,
            referencia_tipo="venta",
            referencia_id=cotizacion_id,
            motivo="venta concretada",
            usuario=usuario,
        )
        procesadas += 1
    return procesadas
