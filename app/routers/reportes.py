"""
Router de reportes ejecutivos.

Reportes disponibles:
  - GET /api/reportes/ventas-mes?meses=12       → ventas por mes
  - GET /api/reportes/top-productos?dias=90     → productos más vendidos
  - GET /api/reportes/top-clientes?dias=90      → clientes top
  - GET /api/reportes/ranking-vendedores?dias=90 → vendedores
  - GET /api/reportes/ventas-mes/csv             → CSV export
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.security import allow_admin_asistente, allow_all_staff, get_current_user
from app.security.permissions import is_owner_scoped

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reportes", tags=["Reportes"])


def _scope_ventas(query, user):
    if is_owner_scoped(user, "read", "cotizacion"):
        return query.filter(models.OrdenVenta.vendedor_id == user.id)
    return query


def _to_mxn(monto, moneda, tc):
    if not monto:
        return 0.0
    if (moneda or "MXN") == "USD":
        return float(monto) * float(tc or 1)
    return float(monto)


@router.get("/ventas-mes", dependencies=[Depends(allow_all_staff)])
def ventas_mes(
    meses: int = Query(12, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    ahora = datetime.utcnow()
    mes_actual = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    series = []
    meses_es = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    for i in range(meses - 1, -1, -1):
        ref = mes_actual
        for _ in range(i):
            ref = (ref - timedelta(days=1)).replace(day=1)
        sig = (ref + timedelta(days=32)).replace(day=1)

        ventas_q = _scope_ventas(
            db.query(models.OrdenVenta).filter(
                models.OrdenVenta.estatus != models.EstatusOrden.COTIZACION,
                models.OrdenVenta.fecha_creacion >= ref,
                models.OrdenVenta.fecha_creacion < sig,
            ),
            current_user,
        )
        ventas = ventas_q.all()
        cot_q = _scope_ventas(
            db.query(models.OrdenVenta).filter(
                models.OrdenVenta.estatus == models.EstatusOrden.COTIZACION,
                models.OrdenVenta.fecha_creacion >= ref,
                models.OrdenVenta.fecha_creacion < sig,
            ),
            current_user,
        )
        cot = cot_q.all()

        ventas_mxn = sum(_to_mxn(o.total, o.moneda, o.tipo_cambio) for o in ventas)
        cot_mxn = sum(_to_mxn(o.total, o.moneda, o.tipo_cambio) for o in cot)

        series.append({
            "mes": ref.strftime("%Y-%m"),
            "label": f"{meses_es[ref.month - 1]} {str(ref.year)[2:]}",
            "ventas_count": len(ventas),
            "ventas_mxn": round(ventas_mxn, 2),
            "cotizaciones_count": len(cot),
            "cotizaciones_mxn": round(cot_mxn, 2),
        })
    return {"series": series, "meses": meses}


@router.get("/top-productos", dependencies=[Depends(allow_all_staff)])
def top_productos(
    dias: int = Query(90, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    desde = datetime.utcnow() - timedelta(days=dias)

    base_q = (
        db.query(
            models.Producto.id,
            models.Producto.sku_comercial,
            models.Producto.sku,
            models.Producto.nombre,
            models.Producto.marca,
            func.coalesce(func.sum(models.DetalleOrden.cantidad), 0).label("qty"),
            func.coalesce(func.sum(models.DetalleOrden.subtotal), 0).label("monto"),
            func.count(models.DetalleOrden.id).label("apariciones"),
        )
        .join(models.DetalleOrden, models.DetalleOrden.producto_id == models.Producto.id)
        .join(models.OrdenVenta, models.DetalleOrden.orden_id == models.OrdenVenta.id)
        .filter(models.OrdenVenta.fecha_creacion >= desde)
    )
    if is_owner_scoped(current_user, "read", "cotizacion"):
        base_q = base_q.filter(models.OrdenVenta.vendedor_id == current_user.id)

    rows = (
        base_q.group_by(models.Producto.id)
        .order_by(desc(func.sum(models.DetalleOrden.cantidad)))
        .limit(limit)
        .all()
    )
    return [
        {
            "producto_id": r.id,
            "sku": r.sku_comercial or r.sku,
            "nombre": r.nombre,
            "marca": r.marca,
            "cantidad_total": int(r.qty or 0),
            "apariciones": int(r.apariciones or 0),
            "monto_mxn": float(r.monto or 0),
        }
        for r in rows
    ]


@router.get("/top-clientes", dependencies=[Depends(allow_all_staff)])
def top_clientes(
    dias: int = Query(90, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    desde = datetime.utcnow() - timedelta(days=dias)

    q = (
        db.query(
            models.Cliente.id,
            models.Cliente.nombre_empresa,
            models.Cliente.saldo_actual,
            func.count(models.OrdenVenta.id).label("orden_count"),
            func.coalesce(func.sum(models.OrdenVenta.total), 0).label("total"),
        )
        .join(models.OrdenVenta, models.OrdenVenta.cliente_id == models.Cliente.id)
        .filter(
            models.OrdenVenta.estatus != models.EstatusOrden.COTIZACION,
            models.OrdenVenta.fecha_creacion >= desde,
        )
    )
    if is_owner_scoped(current_user, "read", "cotizacion"):
        q = q.filter(models.OrdenVenta.vendedor_id == current_user.id)
    rows = q.group_by(models.Cliente.id).order_by(desc(func.sum(models.OrdenVenta.total))).limit(limit).all()

    return [
        {
            "cliente_id": r.id,
            "empresa": r.nombre_empresa,
            "orden_count": int(r.orden_count or 0),
            "monto_mxn": float(r.total or 0),
            "saldo_actual": float(r.saldo_actual or 0),
        }
        for r in rows
    ]


@router.get("/ranking-vendedores", dependencies=[Depends(allow_admin_asistente)])
def ranking_vendedores(
    dias: int = Query(90, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    desde = datetime.utcnow() - timedelta(days=dias)
    rows = (
        db.query(
            models.Usuario.id,
            models.Usuario.nombre,
            models.Usuario.email,
            func.count(models.OrdenVenta.id).label("orden_count"),
            func.coalesce(func.sum(models.OrdenVenta.total), 0).label("total"),
        )
        .join(models.OrdenVenta, models.OrdenVenta.vendedor_id == models.Usuario.id)
        .filter(
            models.OrdenVenta.estatus != models.EstatusOrden.COTIZACION,
            models.OrdenVenta.fecha_creacion >= desde,
        )
        .group_by(models.Usuario.id)
        .order_by(desc(func.sum(models.OrdenVenta.total)))
        .limit(limit)
        .all()
    )
    return [
        {
            "usuario_id": r.id,
            "nombre": r.nombre,
            "email": r.email,
            "orden_count": int(r.orden_count or 0),
            "monto_mxn": float(r.total or 0),
        }
        for r in rows
    ]


@router.get("/ventas-mes/csv", dependencies=[Depends(allow_admin_asistente)])
def ventas_mes_csv(
    meses: int = 12,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    data = ventas_mes(meses=meses, db=db, current_user=current_user)
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["mes", "label", "ventas_count", "ventas_mxn", "cotizaciones_count", "cotizaciones_mxn"])
    for s in data["series"]:
        w.writerow([s["mes"], s["label"], s["ventas_count"], s["ventas_mxn"], s["cotizaciones_count"], s["cotizaciones_mxn"]])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ventas_por_mes.csv"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Sub-proyecto H — Reportes de servicio / operación
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/conversion-cotizaciones", dependencies=[Depends(allow_all_staff)])
def conversion_cotizaciones(
    dias: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Tasa de conversión cotización → VTA en los últimos N días.

    Considera "convertida" cualquier orden con estatus != COTIZACION y != CANCELADA.
    Tiempo medio = diferencia entre fecha_creacion y actualizado_en (proxy de cuándo
    cambió de estatus). Si actualizado_en es NULL, se ignora del cálculo de tiempo."""
    desde = datetime.utcnow() - timedelta(days=dias)
    q = db.query(models.OrdenVenta).filter(models.OrdenVenta.fecha_creacion >= desde)
    q = _scope_ventas(q, current_user)
    ordenes = q.all()

    total = len(ordenes)
    convertidas = [o for o in ordenes if o.estatus != models.EstatusOrden.COTIZACION
                   and o.estatus != models.EstatusOrden.CANCELADA]
    canceladas = [o for o in ordenes if o.estatus == models.EstatusOrden.CANCELADA]
    activas = [o for o in ordenes if o.estatus == models.EstatusOrden.COTIZACION]

    # Tiempo medio de conversión
    tiempos = []
    for o in convertidas:
        if o.fecha_creacion and getattr(o, "actualizado_en", None):
            delta = o.actualizado_en - o.fecha_creacion
            tiempos.append(delta.total_seconds() / 86400.0)
    tiempo_medio_dias = round(sum(tiempos) / len(tiempos), 1) if tiempos else None

    monto_convertido = sum(_to_mxn(o.total, o.moneda, o.tipo_cambio) for o in convertidas)
    monto_activo = sum(_to_mxn(o.total, o.moneda, o.tipo_cambio) for o in activas)

    return {
        "dias": dias,
        "total_cotizaciones": total,
        "convertidas": len(convertidas),
        "canceladas": len(canceladas),
        "activas": len(activas),
        "tasa_conversion_pct": round(100.0 * len(convertidas) / total, 1) if total else 0,
        "tasa_cancelacion_pct": round(100.0 * len(canceladas) / total, 1) if total else 0,
        "tiempo_medio_conversion_dias": tiempo_medio_dias,
        "monto_convertido_mxn": round(monto_convertido, 2),
        "monto_pipeline_activo_mxn": round(monto_activo, 2),
    }


@router.get("/top-servicios", dependencies=[Depends(allow_all_staff)])
def top_servicios(
    dias: int = Query(90, ge=1, le=365),
    limite: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Top servicios cotizados en los últimos N días (cuenta + monto MXN).

    Cuenta líneas con `servicio_id` no nulo o `tipo_linea` con prefijo 'servicio'."""
    desde = datetime.utcnow() - timedelta(days=dias)
    q = (
        db.query(models.DetalleOrden, models.OrdenVenta)
        .join(models.OrdenVenta, models.DetalleOrden.orden_id == models.OrdenVenta.id)
        .filter(models.OrdenVenta.fecha_creacion >= desde)
    )
    q = _scope_ventas(q, current_user)
    rows = q.all()

    agg: dict[str, dict] = {}
    for det, orden in rows:
        es_servicio = bool(det.servicio_id) or (det.tipo_linea or "").startswith("servicio")
        if not es_servicio:
            continue
        nombre = (det.servicio.nombre if det.servicio else None) or det.descripcion_libre or "—"
        key = (det.servicio_id, nombre.lower().strip())
        bucket = agg.setdefault(str(key), {
            "servicio_id": det.servicio_id,
            "nombre": nombre,
            "cantidad_lineas": 0,
            "cantidad_total": 0,
            "monto_mxn": 0.0,
        })
        bucket["cantidad_lineas"] += 1
        bucket["cantidad_total"] += int(det.cantidad or 0)
        bucket["monto_mxn"] += _to_mxn(det.subtotal, orden.moneda, orden.tipo_cambio)

    items = sorted(agg.values(), key=lambda x: x["monto_mxn"], reverse=True)[:limite]
    return {
        "dias": dias,
        "items": [{**it, "monto_mxn": round(it["monto_mxn"], 2)} for it in items],
        "total_lineas_servicio": sum(it["cantidad_lineas"] for it in agg.values()),
        "monto_total_servicios_mxn": round(sum(it["monto_mxn"] for it in agg.values()), 2),
    }


@router.get("/fantasmas-por-proveedor", dependencies=[Depends(allow_all_staff)])
def fantasmas_por_proveedor(
    db: Session = Depends(get_db),
):
    """Fantasmas pendientes agrupados por proveedor sugerido. Útil para
    priorizar negociaciones y cotizaciones a proveedor."""
    q = db.query(models.ProductoFantasma).filter(
        models.ProductoFantasma.estado == "PENDIENTE"
    )
    rows = q.all()

    por_prov: dict[Optional[int], dict] = {}
    for f in rows:
        key = f.proveedor_sugerido_id
        bucket = por_prov.setdefault(key, {
            "proveedor_id": key,
            "proveedor_nombre": (f.proveedor_sugerido.nombre_empresa if f.proveedor_sugerido else "Sin asignar"),
            "cantidad": 0,
            "veces_solicitado_total": 0,
            "items": [],
        })
        bucket["cantidad"] += 1
        bucket["veces_solicitado_total"] += f.veces_solicitado or 0
        bucket["items"].append({
            "id": f.id,
            "descripcion": f.descripcion_original,
            "veces_solicitado": f.veces_solicitado,
            "costo_referencia": float(f.costo_referencia),
            "moneda": f.moneda_referencia,
        })

    return {
        "grupos": sorted(por_prov.values(), key=lambda x: x["veces_solicitado_total"], reverse=True),
        "total_pendientes": sum(g["cantidad"] for g in por_prov.values()),
    }


@router.get("/vencimientos-proximos", dependencies=[Depends(allow_all_staff)])
def vencimientos_proximos(
    dias: int = Query(14, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Cotizaciones activas que vencen en los próximos N días (default 14)."""
    ahora = datetime.utcnow()
    horizonte = ahora + timedelta(days=dias)
    q = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.estatus == models.EstatusOrden.COTIZACION,
            models.OrdenVenta.fecha_vencimiento.isnot(None),
            models.OrdenVenta.fecha_vencimiento >= ahora,
            models.OrdenVenta.fecha_vencimiento <= horizonte,
        )
    )
    q = _scope_ventas(q, current_user)
    rows = q.order_by(models.OrdenVenta.fecha_vencimiento.asc()).all()

    items = []
    for o in rows:
        dias_restantes = (o.fecha_vencimiento - ahora).days
        items.append({
            "id": o.id,
            "folio": o.folio,
            "cliente_nombre": (o.cliente.nombre_empresa if o.cliente else None),
            "vendedor_nombre": (o.vendedor.nombre if o.vendedor else None),
            "moneda": o.moneda,
            "total": float(o.total or 0),
            "total_mxn": round(_to_mxn(o.total, o.moneda, o.tipo_cambio), 2),
            "fecha_vencimiento": o.fecha_vencimiento.isoformat() if o.fecha_vencimiento else None,
            "dias_restantes": dias_restantes,
        })
    monto_total_mxn = round(sum(it["total_mxn"] for it in items), 2)
    return {
        "dias_horizonte": dias,
        "total_cotizaciones": len(items),
        "monto_total_mxn": monto_total_mxn,
        "items": items,
    }


@router.get("/ordenes-pendientes-entrega", dependencies=[Depends(allow_all_staff)])
def ordenes_pendientes_entrega(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Órdenes de venta convertidas (no cotización, no cancelada) que NO tienen
    remisión registrada. Útil para operación de entrega."""
    import logging
    import traceback
    logger = logging.getLogger(__name__)

    try:
        # `ahora` debe ser AWARE: `fecha_creacion` viene de columna con
        # timezone=True, mezclar con `utcnow()` (naive) revienta con
        # "can't subtract offset-naive and offset-aware datetimes".
        ahora = datetime.now(timezone.utc)
        q = (
            db.query(models.OrdenVenta)
            .filter(
                models.OrdenVenta.estatus != models.EstatusOrden.COTIZACION,
                models.OrdenVenta.estatus != models.EstatusOrden.CANCELADA,
            )
        )
        q = _scope_ventas(q, current_user)
        ordenes = q.all()

        # Cargar remisiones existentes en un solo query. Solo cuentan como
        # entrega las remisiones en estados que entregan (EMITIDA/RECIBIDA)
        # — borradores y canceladas NO quitan la orden del pendiente
        # (mismo criterio que app/domains/remisiones/repository.py).
        from app.domains.remisiones.repository import ESTADOS_QUE_ENTREGAN

        remisiones_por_orden: dict[int, int] = {}
        for r in (
            db.query(models.Remision)
            .filter(models.Remision.estado.in_(ESTADOS_QUE_ENTREGAN))
            .all()
        ):
            remisiones_por_orden[r.orden_venta_id] = remisiones_por_orden.get(r.orden_venta_id, 0) + 1

        def _aware(dt):
            """Defensiva: normaliza a UTC si la fila vino naive desde la DB."""
            if dt is None:
                return None
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

        pendientes = [o for o in ordenes if remisiones_por_orden.get(o.id, 0) == 0]
        pendientes.sort(key=lambda o: _aware(o.fecha_creacion) or ahora, reverse=False)

        items = []
        for o in pendientes:
            try:
                fc = _aware(o.fecha_creacion)
                dias_desde = (ahora - fc).days if fc else None
                cliente_nombre = o.cliente.nombre_empresa if o.cliente else None
                estatus_val = o.estatus.value if hasattr(o.estatus, "value") else str(o.estatus)
                items.append({
                    "id": o.id,
                    "folio": o.folio,
                    "cliente_nombre": cliente_nombre,
                    "estatus": estatus_val,
                    "moneda": o.moneda,
                    "total": float(o.total or 0),
                    "total_mxn": round(_to_mxn(o.total, o.moneda, o.tipo_cambio), 2),
                    "fecha_creacion": o.fecha_creacion.isoformat() if o.fecha_creacion else None,
                    "dias_desde_venta": dias_desde,
                })
            except Exception as row_err:  # noqa: BLE001
                logger.warning("orden_pendiente_entrega: fila %s falló: %s", getattr(o, "id", "?"), row_err)
                # Saltamos esta fila para no tirar todo el reporte
                continue

        return {
            "total": len(items),
            "monto_total_mxn": round(sum(it["total_mxn"] for it in items), 2),
            "items": items,
        }
    except Exception as e:  # noqa: BLE001
        logger.exception("Error en ordenes_pendientes_entrega")
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)[:500]}",
        ) from e
