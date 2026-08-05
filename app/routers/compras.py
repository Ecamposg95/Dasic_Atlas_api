import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, text
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from jinja2 import Environment, BaseLoader

from app import models
from app import schemas
from app.core.config import get_settings
from app.db import get_db
from app.models.enums import TipoMovimientoStock
from app.security import allow_admin_asistente, get_current_user
from app.services.stock_service import aplicar_movimiento
from pydantic import BaseModel
from app.core.runtime_config import get_iva_rate
from app.services.formato import fmt_cantidad


def _iva_rate() -> Decimal:
    return Decimal(str(get_settings().iva_rate))


def _iva_pct_label() -> str:
    return f"{get_settings().iva_rate * 100:g}%"

router = APIRouter(prefix="/api/compras", tags=["Proveedores y Gastos"])

# --- PLANTILLA PDF PROFESIONAL (CORREGIDA) ---
PDF_TEMPLATE_COMPRA = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Orden de Compra #{{ orden.id }}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 0; margin: 0; }
        .container { width: 100%; max-width: 800px; margin: 0 auto; padding: 20px; }
        
        /* HEADER */
        .header-table { width: 100%; margin-bottom: 30px; }
        .company-name { font-size: 28px; font-weight: bold; color: #1e3a8a; margin: 0; } /* Azul Dasic */
        .company-info { font-size: 12px; color: #666; line-height: 1.4; }
        .invoice-title { font-size: 24px; font-weight: bold; text-align: right; color: #333; }
        .invoice-details { text-align: right; font-size: 13px; margin-top: 5px; }
        
        /* PROVEEDOR BOX */
        .box-section { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 30px; display: flex; justify-content: space-between; }
        .box-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 5px; }
        .box-content { font-size: 14px; font-weight: bold; color: #333; }
        .box-sub { font-size: 12px; color: #555; }

        /* TABLA PRODUCTOS */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        .items-table th { background-color: #1e3a8a; color: white; padding: 10px; text-align: left; font-weight: bold; text-transform: uppercase; font-size: 11px; }
        .items-table td { padding: 10px; border-bottom: 1px solid #eee; }
        .items-table tr:nth-child(even) { background-color: #f8fafc; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        
        /* TOTALES */
        .totals-section { width: 40%; margin-left: auto; font-size: 14px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .total-final { font-size: 18px; font-weight: bold; color: #1e3a8a; border-top: 2px solid #1e3a8a; padding-top: 10px; margin-top: 5px; }

        /* FIRMAS Y FOOTER */
        .signatures { margin-top: 80px; display: flex; justify-content: space-between; padding: 0 50px; }
        .sig-line { width: 200px; border-top: 1px solid #333; text-align: center; font-size: 12px; padding-top: 5px; }
        .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
</head>
<body onload="window.print()">
    <div class="container">
        
        <table class="header-table">
            <tr>
                <td width="60%">
                    <div style="font-size: 40px; color: #1e3a8a; font-weight:900;">DASIC</div> 
                    <div class="company-name">ERP System</div>
                    <div class="company-info">
                       Development of Automation System and Industrial Control<br>
                        Av. Industrial 123, Ciudad de México<br>
                        RFC: DAS-220101-ABC<br>
                        contacto@dasic.mx | (55) 1234-5678
                    </div>
                </td>
                <td width="40%" style="vertical-align: top;">
                    <div class="invoice-title">ORDEN DE COMPRA</div>
                    <div class="invoice-details">
                        <strong>Folio:</strong> {{ orden.folio or ("OC-%04d" | format(orden.id)) }}<br>
                        <strong>Fecha Emisión:</strong> {{ orden.fecha.strftime('%d/%m/%Y') }}<br>
                        <strong>Moneda:</strong> {{ orden.moneda or "MXN" }}<br>
                        <strong>Estado:</strong> {{ orden.estatus | upper }}
                    </div>
                </td>
            </tr>
        </table>

        <div class="box-section">
            <div style="width: 48%;">
                <div class="box-title">PROVEEDOR</div>
                <div class="box-content">{{ orden.proveedor.nombre_empresa }}</div>
                <div class="box-sub">Atn: {{ orden.proveedor.contacto_nombre }}</div>
                <div class="box-sub">{{ orden.proveedor.email }}</div>
                <div class="box-sub">{{ orden.proveedor.telefono }}</div>
            </div>
            <div style="width: 48%;">
                <div class="box-title">ENVIAR A (ALMACÉN)</div>
                <div class="box-content">Almacén General DASIC</div>
                <div class="box-sub">Calle Principal #45</div>
                <div class="box-sub">Recibo de Mercancía: Lunes a Viernes</div>
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th width="15%">SKU</th>
                    <th width="45%">Descripción</th>
                    <th width="10%" class="text-center">Cant.</th>
                    <th width="15%" class="text-right">Costo Unit.</th>
                    <th width="15%" class="text-right">Importe</th>
                </tr>
            </thead>
            <tbody>
                {% for item in orden.detalles %}
                <tr>
                    <td style="font-weight:bold; color:#555;">{{ item.producto.sku }}</td>
                    <td>{{ item.producto.nombre }}</td>
                    <td class="text-center">{{ fmt_cantidad(item.cantidad) }}</td>
                    <td class="text-right">${{ "{:,.2f}".format(item.costo_unitario) }}</td>
                    <td class="text-right font-bold">${{ "{:,.2f}".format(item.costo_unitario * item.cantidad) }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>

        <div class="totals-section">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>${{ "{:,.2f}".format(orden.total) }}</span>
            </div>
            <div class="total-row" style="color: #666;">
                <span>IVA ({{ iva_pct_label }}) (Estimado):</span>
                <span>${{ "{:,.2f}".format(iva) }}</span>
            </div>
            <div class="total-row total-final">
                <span>TOTAL:</span>
                <span>${{ "{:,.2f}".format(gran_total) }}</span>
            </div>
        </div>

        <div class="signatures">
            <div class="sig-line">
                Autorizado por<br><strong>Gerencia de Compras</strong>
            </div>
            <div class="sig-line">
                Recibido por<br><strong>Almacén</strong>
            </div>
        </div>

        <div class="footer">
            Documento generado electrónicamente por DASIC ERP System.
        </div>
    </div>
</body>
</html>
"""

# --- SCHEMAS ---
class DetalleCompraInput(BaseModel):
    producto_id: int
    cantidad: int
    costo_unitario: Decimal

class CompraInput(BaseModel):
    proveedor_id: int
    detalles: List[DetalleCompraInput]
    folio_factura: str = "PENDIENTE"


# --- SCHEMAS para editor de OC (Fase 5) ---
from typing import Literal, Optional  # noqa: E402
from pydantic import Field  # noqa: E402


class OCLineaIn(BaseModel):
    """Línea editable de OC. Producto del catálogo o fantasma."""
    producto_id: Optional[int] = None
    sku_libre: Optional[str] = Field(None, max_length=80)
    descripcion_libre: Optional[str] = Field(None, max_length=255)
    cantidad: int = Field(..., gt=0)
    costo_unitario: Decimal = Field(..., ge=0)
    moneda_origen: Optional[Literal["MXN", "USD"]] = None


class OCEditorIn(BaseModel):
    proveedor_id: int = Field(..., gt=0)
    cotizacion_id: Optional[int] = None
    moneda: Literal["MXN", "USD"] = "MXN"
    tipo_cambio: Decimal = Field(default=Decimal("1"), gt=0)
    detalles: List[OCLineaIn] = Field(..., min_length=1)


class OCDesdeCotizacionInput(BaseModel):
    proveedor_id: int
    afecta_stock: bool = False  # default: solo persiste OC, no toca stock


def _generar_folio_oc(db: Session, vendedor: "models.Usuario | None" = None) -> str:
    """Folio OC formato DASIC: OC-YYMM<seq> (consecutivo global por mes).

    Usa advisory_xact_lock para serializar el cómputo del consecutivo y
    evitar colisión entre OCs creadas concurrentemente en el mismo mes.
    Mismo patrón que `ventas._generar_folio`: MAX sobre el folio (gap-tolerant)
    en lugar de COUNT (gap-blind, reusa folios si se borra una OC del mes).
    """
    ahora = datetime.utcnow()
    yymm = ahora.strftime("%y%m")
    prefijo = "OC"

    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
        {"k": f"folio:{prefijo}:{yymm}"},
    )

    patron = f"{prefijo}-{yymm}%"
    ultimo = (
        db.query(func.max(models.OrdenCompra.folio))
        .filter(models.OrdenCompra.folio.like(patron))
        .scalar()
    )
    consecutivo = 1
    if ultimo:
        m = re.match(rf"{re.escape(prefijo)}-{re.escape(yymm)}(\d+)", ultimo)
        if m:
            consecutivo = int(m.group(1)) + 1
    return f"{prefijo}-{yymm}{consecutivo:03d}"

# --- ENDPOINTS ---

@router.get("/proveedores", response_model=List[schemas.ProveedorResponse], dependencies=[Depends(allow_admin_asistente)])
def listar_proveedores(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Proveedor)
        .order_by(models.Proveedor.nombre_empresa.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

@router.post("/proveedores", response_model=schemas.ProveedorResponse, dependencies=[Depends(allow_admin_asistente)])
def crear_proveedor(proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    try:
        nuevo = models.Proveedor(**proveedor.model_dump())
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)
        return nuevo
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.crear_proveedor falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

# Listar Historial (alias en "/" para compat con clientes con caché viejo)
@router.get("/", dependencies=[Depends(allow_admin_asistente)])
@router.get("/historial", dependencies=[Depends(allow_admin_asistente)])
def listar_historial_compras(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    estatus: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.OrdenCompra)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.OrdenCompra.folio.ilike(like),
            models.OrdenCompra.proveedor.has(
                models.Proveedor.nombre_empresa.ilike(like)
            ),
        ))
    if estatus:
        query = query.filter(models.OrdenCompra.estatus == estatus)
    ordenes = (
        query
        .order_by(desc(models.OrdenCompra.fecha))
        .offset(skip)
        .limit(limit)
        .all()
    )

    resultado = []
    for o in ordenes:
        resultado.append({
            "id": o.id,
            "folio": o.folio,
            "fecha": o.fecha,
            "proveedor": o.proveedor.nombre_empresa,
            "total": o.total,
            "moneda": o.moneda or "MXN",
            "estatus": o.estatus,
            "cotizacion_id": o.cotizacion_id,
        })
    return resultado


@router.get("/cotizacion/{quote_id}/borrador", dependencies=[Depends(allow_admin_asistente)])
def borrador_orden_compra_desde_cotizacion(
    quote_id: int,
    db: Session = Depends(get_db),
):
    quote = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == quote_id).first()
    if not quote:
        raise HTTPException(404, "Cotización no encontrada")
    if quote.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Solo se puede generar borrador desde cotizaciones")

    detalles = []
    omitidas = []
    total_estimado = Decimal("0")
    symbol = "US$" if quote.moneda == "USD" else "$"

    for item in quote.detalles:
        producto = item.producto

        # Saltar líneas sin producto del catálogo: servicios, fantasmas, o
        # FK huérfana. No tienen sentido en una OC a proveedor.
        if producto is None:
            tipo = item.tipo_linea or ("servicio" if not item.producto_id else "huerfano")
            omitidas.append({
                "sku": item.sku_libre or "—",
                "descripcion": item.descripcion_libre or "Línea sin producto del catálogo",
                "cantidad": item.cantidad,
                "motivo": f"{tipo}: no se incluye en OC a proveedor",
            })
            continue

        costo_unitario = Decimal(producto.costo_compra or 0)
        if (producto.moneda_compra or "MXN").upper() != quote.moneda:
            if quote.moneda == "USD":
                costo_unitario = costo_unitario / Decimal(quote.tipo_cambio or 1)
            else:
                costo_unitario = costo_unitario * Decimal(quote.tipo_cambio or 1)

        importe = (costo_unitario * item.cantidad).quantize(Decimal("0.01"))
        total_estimado += importe
        detalles.append(
            {
                "producto_id": producto.id,
                "sku": producto.sku_comercial or producto.sku,
                "nombre": producto.nombre,
                "cantidad": item.cantidad,
                "costo_unitario": costo_unitario.quantize(Decimal("0.01")),
                "importe": importe,
                "moneda": symbol,
            }
        )

    return {
        "cotizacion": {
            "id": quote.id,
            "folio": quote.folio,
            "cliente": quote.cliente.nombre_empresa,
            "observaciones": quote.observaciones,
        },
        "moneda": symbol,
        "total_estimado": total_estimado.quantize(Decimal("0.01")),
        "detalles": detalles,
        "omitidas": omitidas,
        "nota": "Borrador de orden de compra. No genera stock ni cuentas por pagar.",
    }

@router.get(
    "/cotizacion/{quote_id}/grouping",
    dependencies=[Depends(allow_admin_asistente)],
)
def grouping_para_oc(quote_id: int, db: Session = Depends(get_db)):
    """Preview del agrupamiento de líneas de cotización por proveedor sugerido.
    Devuelve un bucket por proveedor y un bucket 'sin_asignar' para líneas sin
    proveedor. Los servicios se excluyen del flujo de OC."""
    quote = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == quote_id).first()
    if not quote:
        raise HTTPException(404, "Cotización no encontrada")
    if quote.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Sólo cotizaciones generan OCs")

    grupos: dict = {}

    for det in quote.detalles:
        # Servicios se EXCLUYEN del flujo de OC
        if det.servicio_id:
            continue

        # Determinar proveedor sugerido
        proveedor_id = None
        if det.producto is not None:
            proveedor_id = (
                det.proveedor_sugerido_id
                or det.producto.proveedor_principal_id
                or det.producto.proveedor_alterno_id
            )
        elif det.fantasma_id:
            fantasma = db.query(models.ProductoFantasma).filter(
                models.ProductoFantasma.id == det.fantasma_id
            ).first()
            if fantasma:
                proveedor_id = det.proveedor_sugerido_id or fantasma.proveedor_sugerido_id
        else:
            # Ad-hoc sin fantasma_id (línea libre pura)
            proveedor_id = det.proveedor_sugerido_id

        key = proveedor_id  # None = sin_asignar
        if key not in grupos:
            prov = None
            if key:
                prov = db.query(models.Proveedor).filter(models.Proveedor.id == key).first()
            grupos[key] = {
                "proveedor_id": key,
                "proveedor_nombre": prov.nombre_empresa if prov else "Sin asignar",
                "lineas": [],
            }

        grupos[key]["lineas"].append({
            "detalle_id": det.id,
            "es_fantasma": det.fantasma_id is not None or (det.producto_id is None and det.servicio_id is None),
            "fantasma_id": det.fantasma_id,
            "sku": (det.producto.sku_comercial if det.producto else None) or det.sku_libre or "—",
            "descripcion": (
                det.producto.nombre if det.producto
                else (det.descripcion_libre or "")
            ),
            "cantidad": det.cantidad,
            "costo_unitario": float(det.costo_base_linea or 0),
            "moneda_origen": det.moneda_origen_linea or "MXN",
        })

    return {
        "quote_id": quote.id,
        "quote_folio": quote.folio,
        "moneda_cotizacion": quote.moneda,
        "tipo_cambio": float(quote.tipo_cambio or 1),
        "grupos": list(grupos.values()),
    }


class _OCLineaInput(BaseModel):
    detalle_id: int
    cantidad: Optional[int] = None  # si None, usa cantidad original del detalle


class _OCGrupoInput(BaseModel):
    proveedor_id: Optional[int] = None  # None = bucket "sin asignar" (se ignora)
    lineas: list[_OCLineaInput]


class _ConfirmarOCsInput(BaseModel):
    grupos: list[_OCGrupoInput]


@router.post(
    "/cotizacion/{quote_id}/confirmar",
    dependencies=[Depends(allow_admin_asistente)],
)
def confirmar_ocs_desde_cotizacion(
    quote_id: int,
    payload: _ConfirmarOCsInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Persiste UNA OC por cada grupo con proveedor_id no-null. Las líneas pueden
    incluir fantasmas (se marca fantasma.estado = EN_OC). Estatus inicial = 'borrador'
    (no afecta stock ni cuentas por pagar). El grupo sin proveedor_id se ignora."""
    quote = (
        db.query(models.OrdenVenta)
        .filter(models.OrdenVenta.id == quote_id)
        .with_for_update()
        .first()
    )
    if not quote:
        raise HTTPException(404, "Cotización no encontrada")
    if quote.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Sólo cotizaciones generan OCs")

    ocs_creadas = []
    try:
        for grupo in payload.grupos:
            if not grupo.proveedor_id:
                continue  # bucket "sin asignar" — el usuario lo cierra manualmente
            if not grupo.lineas:
                continue

            proveedor = db.query(models.Proveedor).filter(
                models.Proveedor.id == grupo.proveedor_id
            ).first()
            if not proveedor:
                raise HTTPException(404, f"Proveedor {grupo.proveedor_id} no encontrado")

            folio = _generar_folio_oc(db, current_user)
            oc = models.OrdenCompra(
                proveedor_id=proveedor.id,
                fecha=datetime.utcnow(),
                total=Decimal("0"),
                estatus="borrador",
                folio=folio,
                moneda=quote.moneda,
                tipo_cambio=quote.tipo_cambio,
                cotizacion_id=quote.id,
            )
            db.add(oc)
            db.flush()

            total = Decimal("0")
            fantasmas_marcados: set = set()

            for linea_in in grupo.lineas:
                det = db.query(models.DetalleOrden).filter(
                    models.DetalleOrden.id == linea_in.detalle_id,
                    models.DetalleOrden.orden_id == quote.id,
                ).first()
                if not det:
                    raise HTTPException(
                        400,
                        f"Línea {linea_in.detalle_id} no pertenece a la cotización {quote.id}",
                    )
                if det.servicio_id:
                    continue  # servicios no se ordenan

                cantidad = linea_in.cantidad or det.cantidad
                # Costo OC = costo vivo del catálogo (fallback snapshot), NETO de
                # descuento_proveedor, convertido a DOF puro (sin spread). Coincide
                # con "Costo OC (DOF)" del cotizador (RowExpanded / CotProveedor!I6).
                if det.producto_id and det.producto and det.producto.costo_compra:
                    costo_origen_oc = Decimal(det.producto.costo_compra)
                    origen = (det.producto.moneda_compra or det.moneda_origen_linea or "MXN").upper()
                else:
                    costo_origen_oc = Decimal(det.costo_base_linea or 0)
                    origen = (det.moneda_origen_linea or "MXN").upper()
                descprov = Decimal(det.descuento_proveedor or 0)
                costo_origen_oc = costo_origen_oc * (Decimal("1") - descprov / Decimal("100"))
                costo_unitario = _convertir_costo_compra(
                    costo_origen_oc, origen, quote.moneda, Decimal(quote.tipo_cambio or 1)
                ).quantize(Decimal("0.01"))

                importe = (costo_unitario * cantidad).quantize(Decimal("0.01"))
                total += importe

                db.add(models.DetalleCompra(
                    orden_compra_id=oc.id,
                    producto_id=det.producto_id,
                    cantidad=cantidad,
                    costo_unitario=costo_unitario,
                    sku_libre=det.sku_libre if not det.producto_id else None,
                    descripcion_libre=det.descripcion_libre if not det.producto_id else None,
                    moneda_origen_linea=det.moneda_origen_linea,
                    costo_base_linea=det.costo_base_linea,
                    marca=det.marca,
                    clave_prod_serv=det.clave_prod_serv,
                    clave_unidad_sat=det.clave_unidad_sat,
                ))

                if det.fantasma_id:
                    fantasmas_marcados.add(det.fantasma_id)

            oc.total = total

            # Marcar fantasmas como EN_OC
            for fid in fantasmas_marcados:
                fantasma = db.query(models.ProductoFantasma).filter(
                    models.ProductoFantasma.id == fid
                ).first()
                if fantasma and fantasma.estado == "PENDIENTE":
                    fantasma.estado = "EN_OC"

            ocs_creadas.append({
                "id": oc.id,
                "folio": oc.folio,
                "proveedor_id": proveedor.id,
                "proveedor_nombre": proveedor.nombre_empresa,
                "total": float(oc.total),
                "lineas_count": len(grupo.lineas),
                "fantasmas_marcados": len(fantasmas_marcados),
            })

        db.commit()
        return {"ocs_creadas": ocs_creadas, "total_ocs": len(ocs_creadas)}

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.confirmar_ocs_desde_cotizacion falló (quote_id=%s)", quote_id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.post("/cotizacion/{quote_id}/orden", dependencies=[Depends(allow_admin_asistente)])
def crear_oc_desde_cotizacion(
    quote_id: int,
    payload: OCDesdeCotizacionInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Persiste una OC vinculada a una cotización. Por defecto NO afecta stock
    ni cuentas por pagar (estatus=borrador). Si afecta_stock=True, suma stock
    y registra el cargo al proveedor."""
    quote = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == quote_id).first()
    if not quote:
        raise HTTPException(404, "Cotización no encontrada")
    if quote.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Sólo cotizaciones generan OC")

    # Lock pesimista solo si se va a mutar saldo_actual del proveedor; en
    # borrador no toca el saldo y no necesita serializar.
    proveedor_q = db.query(models.Proveedor).filter(models.Proveedor.id == payload.proveedor_id)
    if payload.afecta_stock:
        proveedor_q = proveedor_q.with_for_update()
    proveedor = proveedor_q.first()
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")

    folio = _generar_folio_oc(db, current_user)
    estatus = "recibido" if payload.afecta_stock else "borrador"

    try:
        oc = models.OrdenCompra(
            proveedor_id=proveedor.id,
            fecha=datetime.utcnow(),
            total=Decimal("0"),
            estatus=estatus,
            folio=folio,
            moneda=quote.moneda,
            tipo_cambio=quote.tipo_cambio,
            cotizacion_id=quote.id,
        )
        db.add(oc)
        db.flush()

        total = Decimal("0")
        for item in quote.detalles:
            if not item.producto_id:
                # Productos fantasma/servicios: no se pueden ordenar al proveedor.
                continue
            producto = item.producto
            if producto is None:
                # FK apuntando a producto borrado (orphan). Saltar sin tronar.
                continue
            # Costo OC = costo vivo del catálogo (fallback snapshot), NETO de
            # descuento_proveedor, convertido a DOF puro (sin spread). Coincide
            # con "Costo OC (DOF)" del cotizador (RowExpanded / CotProveedor!I6).
            if producto.costo_compra:
                costo_origen_oc = Decimal(producto.costo_compra)
                origen = (producto.moneda_compra or item.moneda_origen_linea or "MXN").upper()
            else:
                costo_origen_oc = Decimal(item.costo_base_linea or 0)
                origen = (item.moneda_origen_linea or "MXN").upper()
            descprov = Decimal(item.descuento_proveedor or 0)
            costo_origen_oc = costo_origen_oc * (Decimal("1") - descprov / Decimal("100"))
            costo_unitario = _convertir_costo_compra(
                costo_origen_oc, origen, quote.moneda, Decimal(quote.tipo_cambio or 1)
            ).quantize(Decimal("0.01"))
            importe = (costo_unitario * item.cantidad).quantize(Decimal("0.01"))
            total += importe

            db.add(models.DetalleCompra(
                orden_compra_id=oc.id,
                producto_id=producto.id,
                cantidad=item.cantidad,
                costo_unitario=costo_unitario,
            ))
            if payload.afecta_stock:
                # ENTRADA auditada con lock pesimista. Antes era mutación directa.
                aplicar_movimiento(
                    db,
                    producto=producto,
                    tipo=TipoMovimientoStock.ENTRADA.value,
                    cantidad=item.cantidad,
                    referencia_tipo="oc",
                    referencia_id=oc.id,
                    motivo=f"OC {oc.folio} con afecta_stock=True (desde cotización {quote.folio})",
                    usuario=current_user,
                )
                producto.costo_compra = costo_unitario  # metadato, no stock

        oc.total = total

        if payload.afecta_stock and total > 0:
            db.add(models.TransaccionProveedor(
                proveedor_id=proveedor.id,
                tipo=models.TipoMovimiento.CARGO,
                monto=total,
                descripcion=f"OC {folio} (desde cotización {quote.folio})",
            ))
            proveedor.saldo_actual += total

        db.commit()
        db.refresh(oc)
        return {
            "id": oc.id,
            "folio": oc.folio,
            "estatus": oc.estatus,
            "moneda": oc.moneda,
            "total": oc.total,
            "cotizacion_id": oc.cotizacion_id,
            "afecta_stock": payload.afecta_stock,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.crear_oc_desde_cotizacion falló (quote_id=%s)", quote_id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.post("/registrar-entrada", dependencies=[Depends(allow_admin_asistente)])
def registrar_compra(
    compra: CompraInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    # Lock pesimista: registrar_compra siempre muta saldo_actual al final.
    proveedor = (
        db.query(models.Proveedor)
        .filter(models.Proveedor.id == compra.proveedor_id)
        .with_for_update()
        .first()
    )
    if not proveedor: raise HTTPException(404, "Proveedor no encontrado")

    try:
        total = Decimal(0)
        nueva_orden = models.OrdenCompra(proveedor_id=proveedor.id, fecha=datetime.now(), total=0)
        db.add(nueva_orden)
        db.flush()

        for item in compra.detalles:
            prod = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
            if prod:
                # ENTRADA auditada con lock. Antes mutaba prod.stock_actual directo.
                aplicar_movimiento(
                    db,
                    producto=prod,
                    tipo=TipoMovimientoStock.ENTRADA.value,
                    cantidad=item.cantidad,
                    referencia_tipo="compra_directa",
                    referencia_id=nueva_orden.id,
                    motivo=f"compra directa a proveedor #{proveedor.id}",
                    usuario=current_user,
                )
                prod.costo_compra = item.costo_unitario  # metadato, no stock
                total += item.costo_unitario * item.cantidad
                db.add(models.DetalleCompra(
                    orden_compra_id=nueva_orden.id, producto_id=prod.id,
                    cantidad=item.cantidad, costo_unitario=item.costo_unitario
                ))
        
        nueva_orden.total = total
        
        # Deuda
        db.add(models.TransaccionProveedor(
            proveedor_id=proveedor.id, tipo=models.TipoMovimiento.CARGO, monto=total,
            descripcion=f"Compra OC #{nueva_orden.id} - {compra.folio_factura}"
        ))
        proveedor.saldo_actual += total
        db.commit()
        return {"mensaje": "Ok", "id": nueva_orden.id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.registrar_compra falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

@router.post("/registrar-pago", dependencies=[Depends(allow_admin_asistente)])
def pagar_proveedor(
    proveedor_id: int,
    monto: Decimal,
    ref: str = "Pago",
    db: Session = Depends(get_db),
):
    # Lock pesimista para serializar pagos concurrentes (evita lost-update
    # en saldo_actual cuando dos pagos llegan al mismo proveedor).
    prov = (
        db.query(models.Proveedor)
        .filter(models.Proveedor.id == proveedor_id)
        .with_for_update()
        .first()
    )
    if not prov: raise HTTPException(404, "Proveedor no encontrado")

    try:
        db.add(models.TransaccionProveedor(
            proveedor_id=prov.id,
            tipo=models.TipoMovimiento.ABONO,
            monto=monto,
            descripcion=f"PAGO: {ref}",
        ))
        prov.saldo_actual -= monto
        db.commit()
        return {"mensaje": "Pago registrado", "nuevo_saldo": prov.saldo_actual}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.pagar_proveedor falló (proveedor_id=%s)", proveedor_id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

@router.get("/{id}/imprimir", response_class=HTMLResponse, dependencies=[Depends(allow_admin_asistente)])
def imprimir_oc(id: int, db: Session = Depends(get_db)):
    orden = db.query(models.OrdenCompra).filter(models.OrdenCompra.id == id).first()
    if not orden: raise HTTPException(404)
    
    iva = orden.total * get_iva_rate(db)
    gran_total = orden.total + iva

    env = Environment(loader=BaseLoader())
    return env.from_string(PDF_TEMPLATE_COMPRA).render(
        orden=orden,
        iva=iva,
        gran_total=gran_total,
        iva_pct_label=_iva_pct_label(),
        fmt_cantidad=fmt_cantidad,
    )


class RecepcionLineaInput(BaseModel):
    detalle_compra_id: int
    cantidad: int  # cuánto llegó AHORA (delta), no el acumulado


class RecepcionParcialInput(BaseModel):
    lineas: List[RecepcionLineaInput]
    fecha: Optional[datetime] = None


def _aplicar_recepcion(db: Session, orden, deltas: dict, fecha, usuario) -> dict:
    """Aplica recepción incremental sobre las líneas de la OC.

    deltas: {detalle_compra_id: cantidad_que_llego_ahora}. Por cada línea con
    delta>0 valida que cantidad_recibida+delta<=cantidad, acumula
    cantidad_recibida, fija fecha_recepcion, y para líneas de CATÁLOGO
    (producto_id no nulo) emite ENTRADA por el delta. Las líneas fantasma
    (producto_id nulo) solo registran (sin stock; el stock entra al promover).
    Recalcula el estatus de la OC. Retorna {procesados, estatus}."""
    procesados = 0
    for det in orden.detalles:
        delta = int(deltas.get(det.id, 0) or 0)
        if delta <= 0:
            continue
        if (det.cantidad_recibida or 0) + delta > det.cantidad:
            raise HTTPException(400, f"La línea {det.id} excede la cantidad pedida ({det.cantidad})")
        if det.producto_id:
            producto = db.get(models.Producto, det.producto_id)
            if producto:
                aplicar_movimiento(
                    db,
                    producto=producto,
                    tipo=TipoMovimientoStock.ENTRADA.value,
                    cantidad=delta,
                    referencia_tipo="oc",
                    referencia_id=orden.id,
                    motivo=f"Recepción OC {orden.folio or '#'+str(orden.id)}",
                    usuario=usuario,
                )
        det.cantidad_recibida = (det.cantidad_recibida or 0) + delta
        det.fecha_recepcion = fecha or datetime.utcnow()
        procesados += 1

    completas = all((d.cantidad_recibida or 0) >= d.cantidad for d in orden.detalles)
    alguna = any((d.cantidad_recibida or 0) > 0 for d in orden.detalles)
    if completas:
        orden.estatus = "recibido"
    elif alguna:
        orden.estatus = "recibida_parcial"
    return {"procesados": procesados, "estatus": orden.estatus}


@router.post("/{id}/recibir", dependencies=[Depends(allow_admin_asistente)])
def recibir_oc(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Recibe TODO lo pendiente de la OC (delta = cantidad - cantidad_recibida
    por línea) reutilizando _aplicar_recepcion. Idempotente: si ya está todo
    recibido, no hay deltas. Marca la OC como recibida/parcial según resultado."""
    orden = db.query(models.OrdenCompra).filter(models.OrdenCompra.id == id).first()
    if not orden:
        raise HTTPException(404, "OC no encontrada")
    if orden.estatus == "recibido":
        raise HTTPException(400, "La OC ya fue recibida")
    if orden.estatus not in ("borrador", "enviada", "confirmada", "recibida_parcial"):
        raise HTTPException(400, f"Estatus '{orden.estatus}' no permite recepción")
    if not orden.detalles:
        raise HTTPException(400, "OC sin detalles, nada que recibir")

    deltas = {
        d.id: (d.cantidad - (d.cantidad_recibida or 0))
        for d in orden.detalles
        if (d.cantidad - (d.cantidad_recibida or 0)) > 0
    }
    if not deltas:
        raise HTTPException(400, "No hay cantidades pendientes por recibir")

    try:
        res = _aplicar_recepcion(db, orden, deltas, None, current_user)
        db.commit()
        return {
            "ok": True,
            "folio": orden.folio,
            "productos_ingresados": res["procesados"],
            "estatus": res["estatus"],
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.recibir_oc falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.post("/{id}/recibir-parcial", dependencies=[Depends(allow_admin_asistente)])
def recibir_oc_parcial(
    id: int,
    payload: RecepcionParcialInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Recepción parcial incremental: recibe las cantidades indicadas por línea
    (delta de esta recepción). Acumula cantidad_recibida y mueve stock solo para
    líneas de catálogo. La OC pasa a 'recibida_parcial' o 'recibido'."""
    orden = db.query(models.OrdenCompra).filter(models.OrdenCompra.id == id).first()
    if not orden:
        raise HTTPException(404, "OC no encontrada")
    if orden.estatus == "recibido":
        raise HTTPException(400, "La OC ya fue recibida en su totalidad")
    if orden.estatus not in ("borrador", "enviada", "confirmada", "recibida_parcial"):
        raise HTTPException(400, f"Estatus '{orden.estatus}' no permite recepción")

    deltas = {l.detalle_compra_id: l.cantidad for l in payload.lineas if l.cantidad and l.cantidad > 0}
    if not deltas:
        raise HTTPException(400, "No se indicaron cantidades a recibir")

    try:
        res = _aplicar_recepcion(db, orden, deltas, payload.fecha, current_user)
        db.commit()
        return {
            "ok": True,
            "folio": orden.folio,
            "estatus": res["estatus"],
            "procesados": res["procesados"],
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.recibir_oc_parcial falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


# --- EDITOR DE OC (Fase 5) ---

def _convertir_costo_compra(costo: Decimal, moneda_origen: str, moneda_oc: str, tc: Decimal) -> Decimal:
    """Convierte costo entre monedas usando el TC de la OC. TC = MXN por USD."""
    o = (moneda_origen or "MXN").upper()
    d = (moneda_oc or "MXN").upper()
    if o == d:
        return costo
    if o == "USD" and d == "MXN":
        return costo * (tc or Decimal("1"))
    if o == "MXN" and d == "USD":
        return costo / (tc or Decimal("1"))
    return costo


def _serializar_oc(oc: models.OrdenCompra) -> dict:
    return {
        "id": oc.id,
        "folio": oc.folio,
        "fecha": oc.fecha.isoformat() if oc.fecha else None,
        "estatus": oc.estatus,
        "proveedor_id": oc.proveedor_id,
        "proveedor": oc.proveedor.nombre_empresa if oc.proveedor else None,
        "cotizacion_id": oc.cotizacion_id,
        "moneda": oc.moneda,
        "tipo_cambio": float(oc.tipo_cambio or 1),
        "total": float(oc.total or 0),
        "detalles": [
            {
                "id": d.id,
                "producto_id": d.producto_id,
                "producto": (
                    {"id": d.producto.id, "sku": d.producto.sku_comercial or d.producto.sku, "nombre": d.producto.nombre}
                    if d.producto else None
                ),
                "sku_libre": d.sku_libre,
                "descripcion_libre": d.descripcion_libre,
                "moneda_origen_linea": d.moneda_origen_linea,
                "costo_base_linea": float(d.costo_base_linea or 0),
                "cantidad": d.cantidad,
                "costo_unitario": float(d.costo_unitario or 0),
                "marca": d.marca,
                "clave_prod_serv": d.clave_prod_serv,
                "clave_unidad_sat": d.clave_unidad_sat,
                "cantidad_recibida": d.cantidad_recibida or 0,
                "fecha_recepcion": d.fecha_recepcion.isoformat() if d.fecha_recepcion else None,
            }
            for d in oc.detalles
        ],
    }


@router.get("/{id}/json", dependencies=[Depends(allow_admin_asistente)])
def obtener_oc_json(id: int, db: Session = Depends(get_db)):
    oc = db.query(models.OrdenCompra).filter(models.OrdenCompra.id == id).first()
    if not oc:
        raise HTTPException(404, "OC no encontrada")
    return _serializar_oc(oc)


@router.post("/", dependencies=[Depends(allow_admin_asistente)])
def crear_oc_editor(
    payload: OCEditorIn,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Crea OC en estatus 'borrador' desde el editor (sin cotización origen
    obligatoria). Sin impacto en stock ni cuentas por pagar."""
    proveedor = db.query(models.Proveedor).filter(
        models.Proveedor.id == payload.proveedor_id
    ).first()
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")
    if not payload.detalles:
        raise HTTPException(400, "Debe haber al menos un renglón.")

    moneda = (payload.moneda or "MXN").upper()
    tc = Decimal(payload.tipo_cambio or 1)
    folio = _generar_folio_oc(db, current_user)

    try:
        oc = models.OrdenCompra(
            proveedor_id=proveedor.id,
            fecha=datetime.utcnow(),
            total=Decimal("0"),
            estatus="borrador",
            folio=folio,
            moneda=moneda,
            tipo_cambio=tc,
            cotizacion_id=payload.cotizacion_id,
        )
        db.add(oc)
        db.flush()

        total = Decimal("0")
        for det in payload.detalles:
            if det.producto_id:
                producto = db.query(models.Producto).filter(
                    models.Producto.id == det.producto_id
                ).first()
                if not producto:
                    raise HTTPException(404, f"Producto {det.producto_id} no existe")
                origen = (det.moneda_origen or producto.moneda_compra or "MXN").upper()
            else:
                if not (det.descripcion_libre or "").strip():
                    raise HTTPException(400, "Producto fantasma requiere descripción.")
                origen = (det.moneda_origen or "MXN").upper()

            costo_origen = Decimal(det.costo_unitario)
            costo_oc = _convertir_costo_compra(costo_origen, origen, moneda, tc).quantize(Decimal("0.01"))
            importe = (costo_oc * det.cantidad).quantize(Decimal("0.01"))
            total += importe

            db.add(models.DetalleCompra(
                orden_compra_id=oc.id,
                producto_id=det.producto_id,
                sku_libre=det.sku_libre,
                descripcion_libre=det.descripcion_libre,
                moneda_origen_linea=origen,
                costo_base_linea=costo_origen.quantize(Decimal("0.01")),
                cantidad=det.cantidad,
                costo_unitario=costo_oc,
            ))

        oc.total = total.quantize(Decimal("0.01"))
        db.commit()
        db.refresh(oc)
        return _serializar_oc(oc)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.crear_oc_editor falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.put("/{id}", dependencies=[Depends(allow_admin_asistente)])
def actualizar_oc_editor(
    id: int,
    payload: OCEditorIn,
    db: Session = Depends(get_db),
):
    """Edita una OC en estatus 'borrador'. Si está confirmada/recibida, rechaza."""
    oc = db.query(models.OrdenCompra).filter(models.OrdenCompra.id == id).first()
    if not oc:
        raise HTTPException(404, "OC no encontrada")
    if oc.estatus and oc.estatus.lower() not in ("borrador", "draft"):
        raise HTTPException(400, "Solo se pueden editar OCs en borrador.")

    proveedor = db.query(models.Proveedor).filter(
        models.Proveedor.id == payload.proveedor_id
    ).first()
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")

    moneda = (payload.moneda or "MXN").upper()
    tc = Decimal(payload.tipo_cambio or 1)

    try:
        oc.proveedor_id = proveedor.id
        oc.moneda = moneda
        oc.tipo_cambio = tc
        oc.cotizacion_id = payload.cotizacion_id

        # Reemplaza líneas (cascade del back_populates ya borra)
        db.query(models.DetalleCompra).filter(
            models.DetalleCompra.orden_compra_id == oc.id
        ).delete()

        total = Decimal("0")
        for det in payload.detalles:
            if det.producto_id:
                producto = db.query(models.Producto).filter(
                    models.Producto.id == det.producto_id
                ).first()
                if not producto:
                    raise HTTPException(404, f"Producto {det.producto_id} no existe")
                origen = (det.moneda_origen or producto.moneda_compra or "MXN").upper()
            else:
                if not (det.descripcion_libre or "").strip():
                    raise HTTPException(400, "Producto fantasma requiere descripción.")
                origen = (det.moneda_origen or "MXN").upper()

            costo_origen = Decimal(det.costo_unitario)
            costo_oc = _convertir_costo_compra(costo_origen, origen, moneda, tc).quantize(Decimal("0.01"))
            importe = (costo_oc * det.cantidad).quantize(Decimal("0.01"))
            total += importe

            db.add(models.DetalleCompra(
                orden_compra_id=oc.id,
                producto_id=det.producto_id,
                sku_libre=det.sku_libre,
                descripcion_libre=det.descripcion_libre,
                moneda_origen_linea=origen,
                costo_base_linea=costo_origen.quantize(Decimal("0.01")),
                cantidad=det.cantidad,
                costo_unitario=costo_oc,
            ))

        oc.total = total.quantize(Decimal("0.01"))
        db.commit()
        db.refresh(oc)
        return _serializar_oc(oc)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("compras.actualizar_oc_editor falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")
