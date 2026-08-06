"""Generación automática de OCs a partir de una cotización.

Reglas:
- Producto del catálogo con stock_disponible < cantidad: genera faltante.
- Producto fantasma con proveedor_sugerido_id: genera línea para ese proveedor.
- Servicio: ignora.
- Productos catálogo sin proveedor (principal o alterno): warning, no se incluyen.
- Agrupa por proveedor: 1 OC borrador por proveedor, vinculada vía cotizacion_id.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.stock_service import reservas_activas, _neto_reservas_por_producto


def _proveedor_para_producto(p: "models.Producto") -> Optional[int]:
    return p.proveedor_principal_id or p.proveedor_alterno_id


def previsualizar_ocs(db: Session, cotizacion: "models.OrdenVenta") -> dict:
    por_proveedor: dict[int, dict] = {}
    sin_proveedor: list[dict] = []

    # Reservas propias de esta cotización por producto, para restarlas del total reservado
    propias = _neto_reservas_por_producto(db, cotizacion.id)

    for d in cotizacion.detalles:
        if d.tipo_linea == "servicio":
            continue

        if d.producto_id and d.producto:
            reservado_total = reservas_activas(db, d.producto.id)
            propia = max(propias.get(d.producto.id, 0), 0)
            reservado_otros = max(reservado_total - propia, 0)
            usable = max((d.producto.stock_actual or 0) - reservado_otros, 0)
            faltante = max(d.cantidad - usable, 0)
            if faltante == 0:
                continue
            prov_id = _proveedor_para_producto(d.producto)
            if not prov_id:
                sin_proveedor.append({
                    "producto_id": d.producto.id,
                    "sku": d.producto.sku_comercial or d.producto.sku,
                    "nombre": d.producto.nombre,
                    "faltante": faltante,
                })
                continue
            entry = {
                "producto_id": d.producto.id,
                "sku": d.producto.sku_comercial or d.producto.sku,
                "nombre": d.producto.nombre,
                "cantidad": faltante,
                "costo_unitario": float(d.producto.costo_compra or 0),
                "moneda": d.producto.moneda_compra or "MXN",
            }
        else:
            # Línea fantasma
            if not d.proveedor_sugerido_id:
                sin_proveedor.append({
                    "producto_id": None,
                    "sku": d.sku_libre,
                    "nombre": d.descripcion_libre,
                    "faltante": d.cantidad,
                })
                continue
            entry = {
                "producto_id": None,
                "sku": d.sku_libre,
                "nombre": d.descripcion_libre,
                "cantidad": d.cantidad,
                "costo_unitario": float(d.costo_base_linea or 0),
                "moneda": d.moneda_origen_linea or "MXN",
            }
            prov_id = d.proveedor_sugerido_id

        bucket = por_proveedor.setdefault(prov_id, {"proveedor_id": prov_id, "items": []})
        bucket["items"].append(entry)

    for prov_id, b in por_proveedor.items():
        prov = db.get(models.Proveedor, prov_id)
        b["proveedor_empresa"] = prov.nombre_empresa if prov else None
        b["subtotal"] = round(sum(i["cantidad"] * i["costo_unitario"] for i in b["items"]), 2)

    return {
        "por_proveedor": list(por_proveedor.values()),
        "sin_proveedor": sin_proveedor,
        "total_proveedores": len(por_proveedor),
    }


def generar_ocs(
    db: Session,
    cotizacion: "models.OrdenVenta",
    usuario: Optional["models.Usuario"] = None,
) -> list[dict]:
    """Persiste OCs en estado borrador, vinculadas a la cotización."""
    from app.routers.compras import _generar_folio_oc

    preview = previsualizar_ocs(db, cotizacion)
    if preview["sin_proveedor"]:
        raise HTTPException(
            status_code=400,
            detail={
                "mensaje": "Hay productos sin proveedor asignado. Asigna proveedor antes de generar OC.",
                "sin_proveedor": preview["sin_proveedor"],
            },
        )

    creadas: list[dict] = []
    for grupo in preview["por_proveedor"]:
        folio = _generar_folio_oc(db)
        moneda_grupo = grupo["items"][0]["moneda"] if grupo["items"] else "MXN"
        oc = models.OrdenCompra(
            folio=folio,
            proveedor_id=grupo["proveedor_id"],
            estatus="borrador",
            cotizacion_id=cotizacion.id,
            moneda=moneda_grupo,
            tipo_cambio=Decimal(str(cotizacion.tipo_cambio or 1)),
            total=Decimal(str(grupo["subtotal"])),
        )
        db.add(oc)
        db.flush()
        for it in grupo["items"]:
            if it["producto_id"]:
                db.add(models.DetalleCompra(
                    orden_compra_id=oc.id,
                    producto_id=it["producto_id"],
                    cantidad=it["cantidad"],
                    costo_unitario=Decimal(str(it["costo_unitario"])),
                ))
        creadas.append({
            "id": oc.id,
            "folio": folio,
            "proveedor_id": grupo["proveedor_id"],
            "items": len(grupo["items"]),
            "subtotal": grupo["subtotal"],
        })
    db.commit()
    return creadas
