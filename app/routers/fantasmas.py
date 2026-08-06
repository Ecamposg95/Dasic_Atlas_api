"""Endpoints para gestión de productos fantasma apilados."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.security import allow_all_staff, get_current_user
from app.security.jwt import allow_admin
from app.models.enums import TipoMovimientoStock
from app.routers.catalogos import siguiente_sku_para
from app.services.stock_service import aplicar_movimiento

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fantasmas", tags=["Fantasmas"])


def _serialize_fantasma_row(f) -> dict:
    """Defensiva contra rows con FK rotos o campos NULL inesperados."""
    try:
        proveedor_nombre = f.proveedor_sugerido.nombre_empresa if f.proveedor_sugerido else None
    except Exception as e:  # noqa: BLE001
        logger.warning("fantasma %s: error cargando proveedor_sugerido: %s", f.id, e)
        proveedor_nombre = None
    try:
        marca_nombre = f.marca_rel.nombre if f.marca_id and f.marca_rel else (f.marca or None)
    except Exception:  # noqa: BLE001
        marca_nombre = f.marca or None
    return {
        "id": f.id,
        "descripcion": f.descripcion_original or "",
        "sku_libre": f.sku_libre,
        "costo_referencia": float(f.costo_referencia) if f.costo_referencia is not None else 0.0,
        "moneda": f.moneda_referencia or "MXN",
        "proveedor_sugerido_id": f.proveedor_sugerido_id,
        "proveedor_sugerido_nombre": proveedor_nombre,
        "marca": marca_nombre,
        "marca_id": f.marca_id,
        "clave_prod_serv": f.clave_prod_serv,
        "clave_unidad_sat": f.clave_unidad_sat,
        "observaciones": f.observaciones,
        "estado": f.estado or "PENDIENTE",
        "veces_solicitado": f.veces_solicitado or 0,
        "creado_en": f.creado_en.isoformat() if f.creado_en else None,
        "ultimo_visto_en": f.ultimo_visto_en.isoformat() if f.ultimo_visto_en else None,
        "promovido_a_producto_id": f.promovido_a_producto_id,
    }


@router.get("/", dependencies=[Depends(allow_all_staff)])
def listar_fantasmas(
    estado: Optional[str] = None,
    proveedor_id: Optional[int] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(get_db),
):
    if page < 1 or page_size < 1 or page_size > 500:
        raise HTTPException(400, "page o page_size inválido")

    try:
        query = db.query(models.ProductoFantasma)
        if estado:
            query = query.filter(models.ProductoFantasma.estado == estado.upper())
        if proveedor_id:
            query = query.filter(models.ProductoFantasma.proveedor_sugerido_id == proveedor_id)
        if q:
            like = f"%{q.lower()}%"
            query = query.filter(
                or_(
                    models.ProductoFantasma.descripcion_normalizada.ilike(like),
                    models.ProductoFantasma.sku_libre.ilike(like),
                )
            )

        rows = (
            query
            .order_by(desc(models.ProductoFantasma.ultimo_visto_en))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [_serialize_fantasma_row(f) for f in rows]
    except Exception as e:  # noqa: BLE001
        # Logueamos el traceback completo a Railway logs Y devolvemos el detail al navegador
        # para que el desarrollador no tenga que adivinar la causa raíz.
        logger.exception("Error listando fantasmas (page=%s, page_size=%s, estado=%s)", page, page_size, estado)
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)[:500]}",
        ) from e

    return {"page": page, "page_size": page_size, "items": items}


@router.get("/{id}", dependencies=[Depends(allow_all_staff)])
def detalle_fantasma(id: int, db: Session = Depends(get_db)):
    f = db.query(models.ProductoFantasma).filter(models.ProductoFantasma.id == id).first()
    if not f:
        raise HTTPException(404, "Fantasma no encontrado")
    # Cotizaciones donde aparece
    detalles = (
        db.query(models.DetalleOrden)
        .filter(models.DetalleOrden.fantasma_id == id)
        .all()
    )
    cotizaciones = []
    for d in detalles:
        if d.orden:
            cotizaciones.append({
                "id": d.orden.id,
                "folio": d.orden.folio,
                "estatus": d.orden.estatus.value if hasattr(d.orden.estatus, "value") else str(d.orden.estatus),
                "cantidad": d.cantidad,
            })
    return {
        "id": f.id,
        "descripcion": f.descripcion_original,
        "sku_libre": f.sku_libre,
        "costo_referencia": float(f.costo_referencia),
        "moneda": f.moneda_referencia,
        "proveedor_sugerido_id": f.proveedor_sugerido_id,
        "estado": f.estado,
        "veces_solicitado": f.veces_solicitado,
        "creado_en": f.creado_en.isoformat() if f.creado_en else None,
        "ultimo_visto_en": f.ultimo_visto_en.isoformat() if f.ultimo_visto_en else None,
        "cotizaciones": cotizaciones,
    }


@router.patch("/{id}", dependencies=[Depends(allow_all_staff)])
def actualizar_fantasma(
    id: int,
    payload: schemas.ProductoFantasmaUpdate,
    db: Session = Depends(get_db),
):
    f = db.query(models.ProductoFantasma).filter(models.ProductoFantasma.id == id).first()
    if not f:
        raise HTTPException(404, "Fantasma no encontrado")
    if f.estado in ("PROMOVIDO", "DESCARTADO"):
        raise HTTPException(409, f"Fantasma en estado {f.estado} es solo lectura")

    try:
        if payload.descripcion_original is not None:
            f.descripcion_original = payload.descripcion_original
            f.descripcion_normalizada = (payload.descripcion_original or "").strip().lower()
        if payload.sku_libre is not None:
            f.sku_libre = payload.sku_libre
        if payload.costo_referencia is not None:
            f.costo_referencia = payload.costo_referencia
        if payload.moneda_referencia is not None:
            f.moneda_referencia = payload.moneda_referencia.upper()
        if payload.proveedor_sugerido_id is not None:
            f.proveedor_sugerido_id = payload.proveedor_sugerido_id
        if payload.marca is not None:
            f.marca = payload.marca or None
        if payload.marca_id is not None:
            f.marca_id = payload.marca_id
        if payload.clave_prod_serv is not None:
            f.clave_prod_serv = payload.clave_prod_serv or None
        if payload.clave_unidad_sat is not None:
            f.clave_unidad_sat = payload.clave_unidad_sat or None
        if payload.observaciones is not None:
            f.observaciones = payload.observaciones or None
        db.commit()
        db.refresh(f)
        return {"id": f.id, "estado": f.estado}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("fantasmas.actualizar_fantasma falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.post("/{id}/descartar", dependencies=[Depends(allow_admin)])
def descartar_fantasma(id: int, db: Session = Depends(get_db)):
    f = db.query(models.ProductoFantasma).filter(models.ProductoFantasma.id == id).first()
    if not f:
        raise HTTPException(404, "Fantasma no encontrado")
    if f.estado in ("PROMOVIDO", "DESCARTADO"):
        raise HTTPException(409, f"Fantasma ya está en estado {f.estado}")

    try:
        f.estado = "DESCARTADO"
        db.commit()
        return {"id": f.id, "estado": f.estado}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("fantasmas.descartar_fantasma falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.get("/{id}/sugerir-sku", dependencies=[Depends(allow_all_staff)])
def sugerir_sku_fantasma(id: int, db: Session = Depends(get_db)):
    """Sugiere un SKU para promover: usa sku_libre si existe; si no y hay
    marca con abreviatura, genera {ABREV}-NNNN; si no, cadena vacía."""
    f = db.query(models.ProductoFantasma).filter(models.ProductoFantasma.id == id).first()
    if not f:
        raise HTTPException(404, "Fantasma no encontrado")
    if f.sku_libre:
        return {"sku_sugerido": f.sku_libre}
    abrev = None
    if f.marca_id and f.marca_rel and f.marca_rel.abreviatura:
        abrev = f.marca_rel.abreviatura
    if abrev:
        return {"sku_sugerido": siguiente_sku_para(db, abrev)}
    return {"sku_sugerido": ""}


@router.post("/{id}/promover", dependencies=[Depends(allow_admin)])
def promover_fantasma(
    id: int,
    payload: schemas.PromoverFantasmaInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Convierte un fantasma a Producto del catálogo. Copia los campos del
    fantasma (incl. marca/SAT), valida SKU único y registra la entrada de
    stock vía kardex (aplicar_movimiento) si cantidad > 0. Marca el fantasma
    como PROMOVIDO y deja referencia al producto creado."""
    f = db.query(models.ProductoFantasma).filter(models.ProductoFantasma.id == id).first()
    if not f:
        raise HTTPException(404, "Fantasma no encontrado")
    if f.estado in ("PROMOVIDO", "DESCARTADO"):
        raise HTTPException(409, f"Fantasma ya está en estado {f.estado}")

    sku = (payload.sku or "").strip()
    if not sku:
        raise HTTPException(400, "El SKU es obligatorio para promover")
    if payload.cantidad < 0:
        raise HTTPException(400, "La cantidad no puede ser negativa")
    existe = db.query(models.Producto).filter(models.Producto.sku == sku).first()
    if existe:
        raise HTTPException(409, f"Ya existe un producto con el SKU {sku}")

    try:
        nuevo = models.Producto(
            sku=sku,
            nombre=f.descripcion_original[:150],
            descripcion=f.descripcion_original,
            costo_compra=f.costo_referencia,
            moneda_compra=f.moneda_referencia,
            marca=f.marca,
            marca_id=f.marca_id,
            clave_prod_serv=f.clave_prod_serv,
            clave_unidad_sat=f.clave_unidad_sat,
            stock_actual=0,
            proveedor_principal_id=f.proveedor_sugerido_id,
        )
        if payload.stock_minimo is not None:
            nuevo.stock_minimo = payload.stock_minimo
        db.add(nuevo)
        db.flush()

        if payload.cantidad > 0:
            aplicar_movimiento(
                db,
                producto=nuevo,
                tipo=TipoMovimientoStock.ENTRADA.value,
                cantidad=int(payload.cantidad),
                referencia_tipo="promocion_fantasma",
                referencia_id=f.id,
                motivo=f"Promoción fantasma → {sku}",
                usuario=current_user,
            )

        f.estado = "PROMOVIDO"
        f.promovido_a_producto_id = nuevo.id
        db.commit()
        return {
            "fantasma_id": f.id,
            "producto_id": nuevo.id,
            "sku": nuevo.sku,
            "stock_inicial": int(payload.cantidad),
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("fantasmas.promover_fantasma falló (fantasma_id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")
