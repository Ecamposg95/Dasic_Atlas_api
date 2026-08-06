"""Dashboard de cuentas por cobrar (CRM Fase 6).

Endpoints:
  GET  /api/cuentas-por-cobrar/vencimientos?dias=7
  POST /api/cuentas-por-cobrar/marcar-vencidos       (admin; job manual)
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.security import allow_admin, allow_all_staff
from app.services.cuentas_por_cobrar import (
    calcular_aging,
    listar_vencimientos,
    marcar_vencidos,
    top_deudores,
)
from app.models.enums import TipoMovimiento
from app.core.fechas import hoy_negocio


router = APIRouter(prefix="/api/cuentas-por-cobrar", tags=["Cuentas por cobrar"])


@router.get("/resumen", dependencies=[Depends(allow_all_staff)])
def resumen_cxc(db: Session = Depends(get_db)):
    """Métricas globales: total por cobrar, vencido, por vencer (7/30 días).

    Calcula los 4 buckets con un único `SELECT … SUM(CASE …)` en lugar de
    cargar todas las transacciones en memoria. Mantiene la misma semántica
    de buckets que la versión Python (delta<0 vencido, 0≤delta≤7 por vencer
    7d, 8≤delta≤30 por vencer 30d).
    """
    hoy = hoy_negocio()
    saldo_expr = models.TransaccionCliente.monto - func.coalesce(
        models.TransaccionCliente.monto_pagado, 0
    )
    venc = models.TransaccionCliente.fecha_vencimiento

    row = (
        db.query(
            func.coalesce(func.sum(saldo_expr), 0).label("total_pendiente"),
            func.coalesce(
                func.sum(case((venc < hoy, saldo_expr), else_=0)), 0
            ).label("total_vencido"),
            func.coalesce(
                func.sum(case((venc.between(hoy, hoy + timedelta(days=7)), saldo_expr), else_=0)),
                0,
            ).label("total_7"),
            func.coalesce(
                func.sum(
                    case(
                        (venc.between(hoy + timedelta(days=8), hoy + timedelta(days=30)), saldo_expr),
                        else_=0,
                    )
                ),
                0,
            ).label("total_30"),
            func.count().label("n_cargos_abiertos"),
        )
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.estatus_pago != "pagado")
        .filter(saldo_expr > 0)
        .one()
    )

    return {
        "total_pendiente": float(row.total_pendiente or 0),
        "total_vencido": float(row.total_vencido or 0),
        "por_vencer_7d": float(row.total_7 or 0),
        "por_vencer_30d": float(row.total_30 or 0),
        "n_cargos_abiertos": int(row.n_cargos_abiertos or 0),
    }


@router.get("/vencimientos", dependencies=[Depends(allow_all_staff)])
def vencimientos(
    dias: int = Query(7, ge=0, le=365),
    db: Session = Depends(get_db),
):
    return {"items": listar_vencimientos(db, dias=dias)}


@router.post("/marcar-vencidos", dependencies=[Depends(allow_admin)])
def marcar_vencidos_endpoint(db: Session = Depends(get_db)):
    """Job manual: marca cargos con fecha_vencimiento < hoy como 'vencido'.
    Idempotente — solo afecta los que no estaban ya pagados/vencidos."""
    n = marcar_vencidos(db)
    return {"ok": True, "actualizados": n}


@router.get("/aging", dependencies=[Depends(allow_all_staff)])
def aging_report(db: Session = Depends(get_db)):
    """Reporte de antigüedad de saldos (aging buckets 0-30 / 31-60 / 61-90 / 90+).

    Considera todos los CARGOs con saldo pendiente > 0. El ``dias_atraso`` de
    cada cargo se calcula igual que en ``/vencimientos``: si
    ``fecha_vencimiento`` existe y es anterior a hoy →
    ``(hoy − fecha_vencimiento).days``, si no → 0.

    Response::

        {
          "buckets": [
            {"rango": "0-30",  "dias_min": 0,  "dias_max": 30,   "monto": float, "count": int},
            {"rango": "31-60", "dias_min": 31, "dias_max": 60,   "monto": float, "count": int},
            {"rango": "61-90", "dias_min": 61, "dias_max": 90,   "monto": float, "count": int},
            {"rango": "90+",   "dias_min": 91, "dias_max": None, "monto": float, "count": int}
          ],
          "total": float,
          "total_count": int
        }
    """
    return calcular_aging(db)


@router.get("/top-deudores", dependencies=[Depends(allow_all_staff)])
def top_deudores_endpoint(
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Top N clientes por saldo abierto real (calculado de CARGOs, no del cache).

    Response: lista de hasta ``limit`` items::

        [
          {
            "cliente_id": int,
            "nombre_empresa": str,
            "saldo": float,
            "dias_max_atraso": int,
            "n_cargos_abiertos": int
          },
          ...
        ]
    """
    return top_deudores(db, limit=limit)
