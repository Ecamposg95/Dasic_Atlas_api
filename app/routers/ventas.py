import logging
import re
from pathlib import Path as _P

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, select, text
from typing import List, Optional
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from jinja2 import Environment, BaseLoader
from pydantic import BaseModel, EmailStr, Field

from app import models
from app import schemas
from app.core.config import get_settings
from app.db import get_db, SessionLocal
from app.domains.remisiones import repository as remisiones_repository
from app.security import allow_all_staff, get_current_user
from app.security.permissions import _normalize_role, is_owner_scoped, require
from app.services.email_service import (
    EmailDeliveryError,
    send_quote_email,
    smtp_configured,
)
from app.services.ai_service import sugerir_proximo_paso
from app.services.auto_oc_service import generar_ocs, previsualizar_ocs
from app.services.cuentas_por_cobrar import crear_cargo_por_venta
from app.models.enums import TipoMovimientoStock
from app.services.stock_service import (
    aplicar_movimiento,
    cantidad_entera_para_stock,
    consumir_reservas_a_salida,
    liberar_reservas_cotizacion,
    reservar_para_cotizacion,
    reservas_activas,
)
from app.services.fantasmas_service import upsert_from_detalle
from app.services.formato import fmt_cantidad
from app.services.word_service import build_cotizacion_docx
from app.core.runtime_config import get_iva_rate, get_quote_validity_days

logger = logging.getLogger(__name__)


def _check_owner_or_403(orden: "models.OrdenVenta", current_user: "models.Usuario", action: str = "read") -> None:
    """Bloquea acciones de VENTAS sobre cotizaciones que no son suyas. Admin/Gerente pasan."""
    if is_owner_scoped(current_user, action, "cotizacion"):
        if orden.vendedor_id != current_user.id:
            raise HTTPException(status_code=404, detail="Cotización no encontrada")


def _resolve_tipo_linea(item, producto: "models.Producto | None") -> str:
    """Determina tipo_linea efectivo.

    Reglas:
      - Si item.servicio_id viene → servicio_catalogo
      - Si producto.es_servicio → servicio (legacy/ad-hoc)
      - tipo_linea=servicio explícito → servicio
      - Sin producto + descripcion_libre → producto_fantasma
      - Default → producto_catalogo
    """
    raw = (getattr(item, "tipo_linea", None) or "").lower().strip() or "producto_catalogo"
    if getattr(item, "servicio_id", None):
        return "servicio_catalogo"
    if producto and producto.es_servicio:
        return "servicio"
    if raw in ("servicio_catalogo",):
        return "servicio_catalogo"
    if raw == "servicio":
        return "servicio"
    if not producto and getattr(item, "descripcion_libre", None):
        return "producto_fantasma" if raw not in ("servicio",) else "servicio"
    return "producto_catalogo"

router = APIRouter(prefix="/api/ventas", tags=["Ventas y Cotizaciones"])


# Defaults editables de "Condiciones Comerciales". Si una cotización se crea
# sin terminos_condiciones, se persiste este texto y el usuario lo puede
# editar/eliminar/agregar líneas desde el cotizador. Sincronizado con el
# DEFAULTS_TERMINOS de cotizador.html (mantener en paralelo).
_DEFAULT_TERMINOS = (
    "Agregar el IVA correspondiente. Tiempo de entrega S.P.V.\n"
    "T.E.S.P.V. = Tiempo de Entrega Salvo Previa Venta. Todos los tiempos de entrega están expresados en días hábiles (lunes a viernes, excluyendo días festivos) y sujetos a confirmación de disponibilidad con el proveedor al momento de la orden.\n"
    "Verificar que el material cotizado cumpla con sus requerimientos técnicos.\n"
    "Todos los precios que incluyen instalación, servicios y capacitación están basados en nuestros horarios normales de trabajo (L-V 8:00-18:00 hrs) a menos de que sea estipulado de otra forma dentro de la cotización. Los cargos adicionales por horas trabajadas fuera de estos horarios u horas superiores a ocho (8) por día serán facturadas por separado.\n"
    "En caso de cancelación se cobrará el 25% del monto total.\n"
    "Los precios indicados no incluyen flete.\n"
    "Si se tiene el material en existencia y el cliente se encuentra ubicado en CDMX y/o área metropolitana se entregará en 2 a 3 días hábiles. En caso contrario el flete será cubierto por el cliente.\n"
    "Para procesar su pedido es necesario colocar una orden de compra indicando el número de cotización y aceptación de estas condiciones comerciales (más anticipo cuando aplique).\n"
    "La garantía de los productos es la que otorga cada fabricante."
)


def _iva_rate() -> Decimal:
    return Decimal(str(get_settings().iva_rate))


def _iva_pct_label(db: Session) -> str:
    # IVA efectivo de DB (PlatformConfig override), NO el de env — debe coincidir
    # con el MONTO de IVA del PDF, que usa get_iva_rate(db).
    rate = float(get_iva_rate(db)) * 100
    return f"{rate:g}%"


def _quote_validity_days() -> int:
    return get_settings().quote_validity_days


@router.get("/config/cotizador-defaults", dependencies=[Depends(allow_all_staff)])
def cotizador_defaults(db: Session = Depends(get_db)):
    """Defaults dinámicos para el frontend del cotizador (IVA, vigencia)."""
    iva = get_iva_rate(db)
    return {
        "iva_rate": float(iva),
        "iva_pct_label": f"{float(iva) * 100:g}%",
        "quote_validity_days": get_quote_validity_days(db),
    }


def _generar_folio(
    db: Session,
    tipo_orden: "models.EstatusOrden",
    vendedor: "models.Usuario",
) -> str:
    """Folio formato DASIC: C-YYMM<seq> (cotización) o V-YYMM<seq> (venta).

    El consecutivo es global por mes y por tipo (no por usuario), con padding
    mínimo de 3 dígitos. Refleja el formato real usado en los PDFs históricos
    (ej. C-2604227, OC-2604001).
    """
    ahora = datetime.utcnow()
    yymm = ahora.strftime("%y%m")
    es_cot = tipo_orden == models.EstatusOrden.COTIZACION
    prefijo = "C" if es_cot else "V"

    # Advisory lock transaccional: serializa el cómputo del consecutivo por
    # (prefijo, mes) entre llamadas concurrentes.
    lock_key = f"folio:{prefijo}:{yymm}"
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": lock_key})

    # La fuente de verdad del consecutivo es el folio mismo (no fecha_creacion,
    # que puede estar desincronizada por zonas horarias o edición manual).
    # MAX en lugar de COUNT tolera gaps por borrados o renumeraciones.
    patron = f"{prefijo}-{yymm}%"
    ultimo = (
        db.query(func.max(models.OrdenVenta.folio))
        .filter(models.OrdenVenta.folio.like(patron))
        .scalar()
    )
    # Extraer SOLO los dígitos del consecutivo. MAX lex puede regresar un folio
    # versionado tipo `C-2605001V2` (recotizar); un `int("001V2")` truena y el
    # fallback a 1 garantizaba colisión contra `C-2605001` que ya existía.
    consecutivo = 1
    if ultimo:
        m = re.match(rf"{re.escape(prefijo)}-{re.escape(yymm)}(\d+)", ultimo)
        if m:
            consecutivo = int(m.group(1)) + 1
    return f"{prefijo}-{yymm}{consecutivo:03d}"


def _normalize_currency(moneda: str | None) -> str:
    moneda_normalizada = (moneda or "MXN").upper()
    if moneda_normalizada not in {"MXN", "USD"}:
        raise HTTPException(400, "Moneda inválida. Usa MXN o USD.")
    return moneda_normalizada


def _resolve_directional_tcs(
    tipo_cambio: Decimal,
    tc_mn_a_usd: Decimal | None,
    tc_usd_a_mn: Decimal | None,
    tolerancia: Decimal = Decimal("1.0"),
) -> tuple[Decimal, Decimal]:
    """Resuelve la TASA DE VENTA única (modelo unificado, 2026-06-10).

    - Una sola tasa de venta = DOF + tolerancia se usa en AMBAS direcciones:
      USD→MN multiplica por ella, MN→USD divide por ella (inverso exacto). El
      cliente pidió que MN→USD sea el inverso de USD→MN; antes MN→USD usaba
      DOF − tolerancia. T es la tolerancia (default 1.0; configurable 0.1-1.0).
    - Si el payload manda un override PLAUSIBLE de tc_usd_a_mn, se respeta y
      tc_mn_a_usd lo espeja. Si viene None o fuera de banda, se deriva DOF + T.
    - Banda de plausibilidad [DOF·0.5, DOF·1.5]: descarta el sentinela legacy
      `0.000001` (y cualquier valor corrupto persistido) en vez de confiar en él,
      lo que antes producía `costo / 0.000001` = ×1,000,000 en MXN→USD.
    - Devuelve (tc_mn_a_usd_eff, tc_usd_a_mn_eff) con AMBOS = tasa de venta.
    """
    dof = Decimal(tipo_cambio)
    t = Decimal(tolerancia)
    lo, hi = dof * Decimal("0.5"), dof * Decimal("1.5")

    def _trust(v: Decimal | None) -> bool:
        return v is not None and lo <= Decimal(v) <= hi

    # Modelo unificado (2026-06-10): una sola TASA DE VENTA = DOF + tolerancia,
    # usada en AMBAS direcciones (× para USD→MN, ÷ para MN→USD). MN→USD es el
    # inverso EXACTO de USD→MN (antes usaba DOF − tolerancia). Se honra un override
    # plausible de tc_usd_a_mn; tc_mn_a_usd lo espeja. Espejo de
    # `resolveDirectionalTcs` (frontend).
    tc_venta = Decimal(tc_usd_a_mn) if _trust(tc_usd_a_mn) else dof + t
    return tc_venta, tc_venta


def _resolve_exchange_rate(moneda: str, tipo_cambio: Decimal | None) -> Decimal:
    """Resuelve el TC operativo de una cotización.

    Importante: el TC del payload se respeta SIEMPRE si viene > 0,
    independientemente de la moneda de la cotización. Esto es necesario
    porque una cotización en MXN puede tener productos en USD: el TC
    operativo se usa para convertir cada línea por separado en
    `_convert_cost_to_quote_currency`.

    Bug previo: se forzaba a 1.0 cuando la moneda era MXN, lo que hacía
    que productos USD dentro de cotizaciones MXN no se convirtieran y
    quedaran con costo nominal en USD (precio_unitario y subtotal MUY
    por debajo del valor real).

    Reglas:
    - Payload con tipo_cambio > 0 → se respeta (auditoría del TC usado).
    - Payload sin TC y moneda MXN → 1.0 (no hay productos USD posibles).
    - Payload sin TC y moneda USD → 400 (el TC es obligatorio).
    """
    if tipo_cambio is not None and tipo_cambio > 0:
        return Decimal(tipo_cambio)
    if moneda == "MXN":
        return Decimal("1.0")
    raise HTTPException(400, "Tipo de cambio requerido para cotizaciones en USD")


def _convert_cost_to_quote_currency(
    costo_compra: Decimal,
    moneda_compra: str,
    moneda_cotizacion: str,
    tc_mn_a_usd: Decimal,
    tc_usd_a_mn: Decimal,
) -> Decimal:
    """Convierte costo del proveedor a la moneda de cotización usando los
    TCs DIRECCIONALES (modelo Excel V_03).

    - Source y target iguales → sin conversión
    - USD → MXN: multiplica por tc_usd_a_mn (default DOF+1)
    - MXN → USD: divide por tc_mn_a_usd (default DOF-1)

    OC al proveedor usa tipo_cambio (DOF) puro vía
    `_convertir_costo_compra` en compras.py — no usa esta función.
    """
    moneda_origen = _normalize_currency(moneda_compra)
    if moneda_origen == moneda_cotizacion:
        return Decimal(costo_compra)
    if moneda_origen == "USD" and moneda_cotizacion == "MXN":
        return Decimal(costo_compra) * Decimal(tc_usd_a_mn)
    if moneda_origen == "MXN" and moneda_cotizacion == "USD":
        return Decimal(costo_compra) / Decimal(tc_mn_a_usd)
    raise HTTPException(400, "No se pudo convertir la moneda del producto")


def _currency_symbol(moneda: str) -> str:
    return "US$" if moneda == "USD" else "$"

# --- PLANTILLA PDF: layout DASIC real (cotización / nota de venta) ---
PDF_TEMPLATE_VENTA = """
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>{{ tipo_doc }} {{ orden.folio }}</title>
<style>
  /* Márgenes de página (aplican en TODAS las hojas): top da aire al contenido de
     continuación en hojas 2+; bottom evita que el contenido toque el borde. El
     footer va en flujo normal (aparece una sola vez, en la última hoja), no fijo. */
  @page { size: Letter; margin: 10mm 0; }
  /* Forzar impresión de colores y backgrounds en TODOS los navegadores.
     Sin esto, Chrome/Edge/Safari descartan fondos coloreados al imprimir. */
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; font-size: 10.5px; line-height: 1.35; }

  /* Página: flex column + footer absoluto al fondo (sin espacio en blanco
     después del footer). El bloque .cierre tiene margin-top: auto, por lo
     que se empuja hacia abajo justo antes del footer. En cotizaciones
     cortas, el gap natural queda entre la tabla y el cierre, no después
     del footer. */
  .page {
    width: 100%;
    min-height: 100vh;
    padding: 18px 32px 44px 32px;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Header DASIC — compacto y elegante */
  .brand-row { display: flex; align-items: center; gap: 14px; padding-bottom: 6px; border-bottom: 3px solid #0f3a66; }
  .brand-logo { height: 44px; width: auto; object-fit: contain; }
  .brand-name { font-size: 24px; font-weight: 900; color:#0f3a66; letter-spacing: 1px; line-height: 1; }
  .brand-tag { font-size: 9.5px; color:#475569; margin-top: 2px; letter-spacing: 0.4px; }
  .brand-rule { height: 4px; background: linear-gradient(90deg,#0f3a66,#1d6fb8 55%,#cbd5e1); margin-bottom: 12px; }

  /* Encabezado documento */
  .doc-head { display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .doc-fecha { font-size: 11px; color:#0f172a; }
  .doc-fecha .lbl { font-weight: 700; }
  .doc-fecha .val { text-decoration: underline; font-weight: 600; }
  .doc-title { color:#0f3a66; font-weight: 800; font-size: 20px; letter-spacing: 1px; }
  .doc-folio { color:#0f172a; font-weight: 700; font-size: 14px; margin-left: 6px; }

  /* Bloque cliente */
  .cliente { text-align: right; margin-bottom: 8px; }
  .cliente .row { font-size: 10.5px; color:#0f172a; line-height: 1.3; }
  .cliente .lbl { font-weight: 700; }
  .cliente .name, .cliente .email a { color: #1d6fb8; font-weight: 700; }

  /* Tabla — compacta */
  table.items { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 4px; font-size: 10px; }
  table.items thead th {
    background:#0f3a66; color:#fff; padding: 6px 5px; font-weight: 700;
    border-right: 1px solid #1d6fb8; text-transform: capitalize; font-size: 10px;
  }
  table.items thead th:last-child { border-right: none; }
  table.items tbody td { background:#f1f5f9; padding: 6px 6px; border-bottom: 2px solid #fff; vertical-align: top; line-height: 1.3; }
  table.items td.center { text-align: center; }
  table.items td.right { text-align: right; }
  .item-cat { font-weight: 700; color:#0f172a; }
  .item-desc { color:#0f172a; white-space: pre-line; }
  .item-nota { font-size: 9px; color:#64748b; font-style: italic; margin-top: 3px; padding-left: 5px; border-left: 2px solid #cbd5e1; white-space: pre-line; line-height: 1.3; }
  .item-sat { font-size: 7pt; color: #666; margin-top: 2px; }
  .item-marca { font-size: 9px; color:#334155; font-weight: 600; margin-top: 2px; }
  .tespv-tag { display: inline-block; font-size: 8.5px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 0px 3px; border-radius: 3px; margin-left: 2px; letter-spacing: 0.3px; }
  table.items tfoot td { background:#cfe2f3; font-weight: 700; padding: 6px 7px; border-bottom: 2px solid #fff; }

  /* Condiciones — ultra-compactas para garantizar 1 hoja */
  .terms-title { font-weight: 800; color:#0f172a; margin-top: 8px; margin-bottom: 2px; font-size: 10px; letter-spacing: 0.4px; }
  ul.terms { padding-left: 14px; margin: 0; color:#1e293b; font-size: 7.5px; line-height: 1.25; }
  ul.terms li { margin-bottom: 0.5px; }
  ul.terms strong { color:#0f172a; }

  /* Cierre: layout horizontal compacto (texto izq + QR der).
     margin-top: auto lo empuja hacia abajo dentro del flex column de
     la .page, así queda justo arriba del footer absoluto. */
  .cierre {
    margin-top: auto;
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    page-break-inside: avoid;
  }
  .cierre-left { flex: 1; font-size: 10.5px; color:#0f172a; }
  .cierre-left .label { font-weight: 800; letter-spacing: 1px; font-size: 11px; }
  .cierre-left .area { font-weight: 700; color:#0f3a66; margin-top: 2px; font-size: 11.5px; letter-spacing: 0.5px; }
  .cierre-left .consultor-block { margin-top: 8px; }
  .cierre-left .consultor-nombre { font-weight: 700; font-size: 10.5px; }
  .cierre-left .consultor-titulo { font-style: italic; color:#475569; font-size: 9.5px; margin-top: 1px; }
  .cierre-left .consultor-mail { font-size: 9.5px; margin-top: 1px; }
  .cierre-left .consultor-mail a { color:#1d6fb8; }
  .cierre-right { text-align: center; }
  .cierre-right .qr { width: 78px; height: 78px; display: block; margin: 0 auto; }
  .cierre-right .qr-label { font-size: 8px; color:#475569; margin-top: 2px; }
  .cierre-right .folio-text { font-family: monospace; font-weight: 700; color:#0f172a; }

  /* Footer absoluto al fondo de la hoja. Sin espacio en blanco después
     del footer. El .page tiene padding-bottom: 44px para reservar este
     espacio sin que el contenido se traslape. */
  .footer-bar {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, #0f3a66 0%, #0a2949 100%);
    color:#cbd5e1; font-size: 10px; text-align: center; padding: 8px 0; letter-spacing: 1px;
  }
  .footer-bar .web { color:#fff; font-weight: 700; }

  .print-btn {
    position: fixed; top: 14px; right: 14px;
    background:#1d6fb8; color:#fff; border: 0;
    padding: 10px 18px; border-radius: 6px;
    font-weight: 700; font-size: 13px; cursor: pointer;
    box-shadow: 0 6px 16px rgba(0,0,0,0.25);
    z-index: 1000;
    transition: transform 0.1s, background 0.1s;
  }
  .print-btn:hover { background:#155a8d; transform: translateY(-1px); }
  .print-btn:active { transform: translateY(0); }

  /* IMPRESIÓN: pagina con elegancia cuando hay muchos ítems (no fuerza 1 hoja).
     - .page en block flow para permitir saltos de página naturales.
     - thead se repite arriba de cada hoja; tfoot (totales) aparece una sola vez.
     - filas no se parten a la mitad.
     - footer en flujo normal: aparece una sola vez al final (última hoja), nunca
       encima el contenido. */
  @media print {
    .print-btn { display:none; }
    body { background:#fff; }
    html, body { height: auto; }
    .page { display: block; min-height: 0; padding-top: 0; padding-bottom: 0; }
    .footer-bar { position: static; margin-top: 14px; page-break-inside: avoid; }
    table.items { page-break-inside: auto; }
    table.items thead { display: table-header-group; }
    table.items tfoot { display: table-row-group; }
    table.items tr { page-break-inside: avoid; page-break-after: auto; }
    .cierre { page-break-inside: avoid; }
    /* Refuerzo color-adjust en los elementos con fondo */
    table.items thead th,
    table.items tbody td,
    table.items tfoot td,
    .brand-rule,
    .footer-bar,
    .tespv-tag {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()" title="Atajo: Ctrl+P">
  🖨 Imprimir / Guardar PDF
</button>
<script>
  // Atajo Ctrl+P / Cmd+P como respaldo si el botón no responde
  window.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      window.print();
    }
  });
</script>
<div class="page">

  <div class="brand-row">
    <img src="/static/img/Logo_main.png" alt="DASIC" class="brand-logo">
    <div>
      <div class="brand-name">DASIC</div>
      <div class="brand-tag">Development Of Automation System And Industrial Control</div>
    </div>
  </div>
  <div class="brand-rule"></div>

  <div class="doc-head">
    <div class="doc-fecha">
      <span class="lbl">Fecha:</span>
      <span class="val">{{ fecha_str }}</span>
    </div>
    <div>
      <span class="doc-title">{{ tipo_doc }}:</span>
      <span class="doc-folio">{{ orden.folio }}</span>
    </div>
  </div>

  <div class="cliente">
    {# Contacto destinatario: el SELECCIONADO en la cotización (orden.contacto)
       manda; si no se eligió ninguno, cae al contacto por defecto de la empresa
       (cliente.contacto_nombre/email). Antes el PDF mostraba siempre el default
       de la empresa e ignoraba el contacto elegido. #}
    {% set _nombre = orden.contacto.nombre if orden.contacto else orden.cliente.contacto_nombre %}
    {% set _email = (orden.contacto.email if (orden.contacto and orden.contacto.email) else orden.cliente.email) %}
    {% if _nombre %}
      <div class="row"><span class="lbl">Nombre:</span> <span class="name">{{ _nombre }}</span></div>
    {% endif %}
    <div class="row"><span class="lbl">Compañía:</span> {{ orden.cliente.nombre_empresa }}</div>
    {% if _email %}
      <div class="row email"><span class="lbl">E-mail:</span> <a href="mailto:{{ _email }}">{{ _email }}</a></div>
    {% endif %}
  </div>

  {# PDF unificado: si view_detalles viene del backend, usarlo; si no, orden.detalles #}
  {% set items_list = view_detalles if view_detalles is not none else orden.detalles %}
  {% set ns = namespace(has_desc=false, has_entrega=false) %}
  {% for d in items_list %}
    {% if (d.descuento_aplicado or 0) > 0 %}{% set ns.has_desc = true %}{% endif %}
    {% if d.entrega_min is not none and d.entrega_max is not none and d.entrega_unidad %}{% set ns.has_entrega = true %}{% endif %}
  {% endfor %}
  {% set cols_extra = (1 if ns.has_desc else 0) + (1 if ns.has_entrega else 0) %}
  {% set cols_label = 5 + cols_extra %}
  <table class="items">
    <thead>
      <tr>
        <th style="width: 6%;">Item</th>
        <th style="width: 16%;">Catalog #</th>
        <th>Description</th>
        <th style="width: 7%;">Qty</th>
        {% if ns.has_entrega %}<th style="width: 12%;">Entrega</th>{% endif %}
        <th style="width: 14%;">UNIT</th>
        {% if ns.has_desc %}<th style="width: 8%;">Dto%</th>{% endif %}
        <th style="width: 14%;">SubTotal</th>
      </tr>
    </thead>
    <tbody>
      {% for item in items_list %}
      <tr>
        <td class="center">{{ loop.index }}</td>
        {# En modo unificado item es un dict; en modo normal es un ORM object #}
        {% if view_detalles is not none %}
        <td><div class="item-cat">—</div></td>
        <td>
          <div class="item-desc">{{ item.descripcion or "Proyecto integral" }}</div>
        </td>
        {% else %}
        <td><div class="item-cat">{{ item.sku_libre or (item.producto.sku_comercial if item.producto else None) or (item.producto.sku if item.producto else "—") }}</div></td>
        <td>
          <div class="item-desc">{{ item.descripcion_libre or (item.producto.nombre if item.producto else None) or "Producto especial" }}</div>
          {% set _marca = item.marca or (item.producto.marca if item.producto else None) %}
          {% if item.mostrar_marca and _marca %}<div class="item-marca">Marca: {{ _marca }}</div>{% endif %}
          {% set _csat = item.clave_prod_serv or (item.producto.clave_prod_serv if item.producto else None) %}
          {% set _usat = item.clave_unidad_sat or (item.producto.clave_unidad_sat if item.producto else None) %}
          {% if _csat or _usat %}<div class="item-sat">SAT: {{ _csat or '—' }} · Unidad: {{ _usat or '—' }}</div>{% endif %}
          {% if item.observaciones_linea %}<div class="item-nota">{{ item.observaciones_linea }}</div>{% endif %}
        </td>
        {% endif %}
        <td class="center">{{ fmt_cantidad(item.cantidad) }}</td>
        {% if ns.has_entrega %}<td class="center">{% if item.entrega_min is not none and item.entrega_max is not none and item.entrega_unidad %}{% if item.entrega_min == item.entrega_max %}{{ item.entrega_min }} {{ item.entrega_unidad }} <span class="tespv-tag">T.E.S.P.V.</span>{% else %}{{ item.entrega_min }}–{{ item.entrega_max }} {{ item.entrega_unidad }} <span class="tespv-tag">T.E.S.P.V.</span>{% endif %}{% else %}—{% endif %}</td>{% endif %}
        <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(item.precio_unitario) }}</td>
        {% if ns.has_desc %}<td class="center">{% if (item.descuento_aplicado or 0) > 0 %}{{ "{:g}".format(item.descuento_aplicado|float) }}%{% else %}—{% endif %}</td>{% endif %}
        <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(item.subtotal) }}</td>
      </tr>
      {% endfor %}
    </tbody>
    <tfoot>
      {% if es_cotizacion %}
        <tr>
          <td colspan="{{ cols_label }}" class="right">subtotal({{ etiqueta_moneda_corta }})</td>
          <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(orden.total) }}</td>
        </tr>
      {% else %}
        <tr>
          <td colspan="{{ cols_label }}" class="right">SubTotal({{ etiqueta_moneda_corta }})</td>
          <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(orden.total) }}</td>
        </tr>
        <tr>
          <td colspan="{{ cols_label }}" class="right">IVA({{ iva_pct_label }})</td>
          <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(iva) }}</td>
        </tr>
        <tr>
          <td colspan="{{ cols_label }}" class="right">Total({{ etiqueta_moneda_corta }})</td>
          <td class="right">{{ simbolo_moneda }} {{ "{:,.2f}".format(gran_total) }}</td>
        </tr>
      {% endif %}
    </tfoot>
  </table>

  {% if es_cotizacion %}
  <div class="terms-title">CONDICIONES COMERCIALES:</div>
  <ul class="terms">
    {# Metadata fija (depende del estado de la cotización, no editable) #}
    <li>Los precios están expresados en <strong>{{ etiqueta_moneda }} ({{ orden.moneda }})</strong>.</li>
    <li>Condiciones de pago: {{ orden.observaciones or "según acuerdo comercial" }}.</li>

    {# Bloque editable. orden.terminos_condiciones NULL → fallback hardcoded (legacy). #}
    {% if orden.terminos_condiciones is not none %}
      {% for linea in orden.terminos_condiciones.split('\n') %}
        {% if linea.strip() %}<li>{{ linea.strip() }}</li>{% endif %}
      {% endfor %}
    {% else %}
      <li><strong>Agregar el IVA correspondiente.</strong> Tiempo de entrega S.P.V.</li>
      <li><strong>Verificar que el material cotizado cumpla con sus requerimientos técnicos.</strong></li>
      <li>Todos los precios que incluyen instalación, servicios y capacitación están basados en nuestros horarios normales de trabajo (L-V 8:00-18:00 hrs) a menos de que sea estipulado de otra forma dentro de la cotización. Los cargos adicionales por horas trabajadas fuera de estos horarios u horas superiores a ocho (8) por día serán facturadas por separado.</li>
      <li>En caso de cancelación se cobrará el 25% del monto total.</li>
      <li>Los precios indicados no incluyen flete.</li>
      <li>Si se tiene el material en existencia y el cliente se encuentra ubicado en CDMX y/o área metropolitana se entregará en 2 a 3 días hábiles. En caso contrario el flete será cubierto por el cliente.</li>
      <li>Para procesar su pedido es necesario colocar una orden de compra indicando el número de cotización y aceptación de estas condiciones comerciales (más anticipo cuando aplique).</li>
      <li>La garantía de los productos es la que otorga cada fabricante.</li>
    {% endif %}

    {# Metadata sistema #}
    <li>Vigencia de esta cotización: <strong>{{ vigencia_dias }} días a partir de la fecha de emisión.</strong></li>
  </ul>
  {% endif %}

  <div class="cierre">
    <div class="cierre-left">
      <div class="label">ATENTAMENTE</div>
      <div class="area">ÁREA COMERCIAL · DASIC INDUSTRIAL</div>
      <div class="consultor-block">
        <div class="consultor-nombre">{{ orden.vendedor.nombre if orden.vendedor else "Equipo DASIC" }}</div>
        <div class="consultor-titulo">Consultor de Ventas Industrial</div>
        {% if orden.vendedor and orden.vendedor.email %}
          <div class="consultor-mail"><a href="mailto:{{ orden.vendedor.email }}">{{ orden.vendedor.email }}</a></div>
        {% endif %}
      </div>
    </div>
    {% if qr_data_uri %}
    <div class="cierre-right">
      <img class="qr" src="{{ qr_data_uri }}" alt="QR folio {{ orden.folio }}">
      <div class="qr-label">Folio: <span class="folio-text">{{ orden.folio }}</span></div>
    </div>
    {% endif %}
  </div>

  <div class="footer-bar"><span class="web">www.dasic.mx</span></div>
</div>
</body>
</html>
"""

# --- 1. CREAR ORDEN (POST) ---
@router.post("/", response_model=schemas.OrdenVentaResponse, dependencies=[Depends(allow_all_staff)])
def crear_orden(
    orden_data: schemas.OrdenVentaCreate,
    tipo_orden: models.EstatusOrden = models.EstatusOrden.COTIZACION,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    require(current_user, "create", "cotizacion")  # operativo: 403
    cliente = (
        db.query(models.Cliente)
        .filter(
            models.Cliente.id == orden_data.cliente_id,
        )
        .first()
    )
    if not cliente: raise HTTPException(422, "Selecciona un cliente válido para guardar la cotización.")

    moneda_cotizacion = _normalize_currency(orden_data.moneda)
    tipo_cambio = _resolve_exchange_rate(moneda_cotizacion, orden_data.tipo_cambio)
    if not (Decimal("1.0") <= Decimal(tipo_cambio) <= Decimal("100.0")):
        raise HTTPException(400, "tipo_cambio fuera de rango (1.0 a 100.0)")
    tolerancia_tc = (
        Decimal(orden_data.tolerancia_tc)
        if orden_data.tolerancia_tc is not None
        else Decimal("1.0")
    )
    # _eff = valores resueltos (DOF±T) que se usan SOLO para calcular importes.
    # Lo que se PERSISTE es el override crudo nullable (abajo) — guardar el
    # resuelto congelaba el sentinela/derivado y reaparecía al reabrir la cot.
    tc_mn_a_usd_eff, tc_usd_a_mn_eff = _resolve_directional_tcs(
        tipo_cambio,
        orden_data.tc_mn_a_usd,
        orden_data.tc_usd_a_mn,
        tolerancia_tc,
    )

    try:
        folio = _generar_folio(db, tipo_orden, current_user)

        # Si el cliente no envió terminos_condiciones (None), aplicamos los
        # defaults. Si envió cualquier string (incluso ""), respetamos su
        # decisión (puede haber elegido vaciar el bloque editable).
        terminos = orden_data.terminos_condiciones
        if terminos is None:
            terminos = _DEFAULT_TERMINOS

        nueva_orden = models.OrdenVenta(
            folio=folio,
            cliente_id=cliente.id,
            contacto_id=orden_data.contacto_id,
            vendedor_id=current_user.id,
            estatus=tipo_orden,
            observaciones=orden_data.observaciones,
            moneda=moneda_cotizacion,
            tipo_cambio=tipo_cambio,
            tc_mn_a_usd=orden_data.tc_mn_a_usd,
            tc_usd_a_mn=orden_data.tc_usd_a_mn,
            tolerancia_tc=tolerancia_tc,
            fecha_vencimiento=datetime.utcnow() + timedelta(days=get_quote_validity_days(db)),
            total=0,
            terminos_condiciones=terminos,
            pdf_unificado=1 if orden_data.pdf_unificado else 0,
            concepto_unificado=orden_data.concepto_unificado,
        )
        db.add(nueva_orden)
        db.flush()

        total_orden = Decimal(0)

        # Precarga de productos y servicios para evitar N+1 dentro del loop.
        _prod_ids = {it.producto_id for it in orden_data.detalles if it.producto_id}
        _serv_ids = {getattr(it, "servicio_id", None) for it in orden_data.detalles if getattr(it, "servicio_id", None)}
        _productos_by_id = {}
        _servicios_by_id = {}
        if _prod_ids:
            _productos_by_id = {
                p.id: p for p in db.query(models.Producto).filter(models.Producto.id.in_(_prod_ids)).all()
            }
        if _serv_ids:
            _servicios_by_id = {
                s.id: s for s in db.query(models.Servicio).filter(models.Servicio.id.in_(_serv_ids)).all()
            }

        for item in orden_data.detalles:
            producto = None
            servicio = None
            costo_origen = Decimal(item.costo_unitario or 0)
            moneda_origen_linea = (item.moneda_origen or "MXN").upper()
            sku_libre = (item.sku_libre or "").strip() or None
            descripcion_libre = (item.descripcion_libre or "").strip() or None

            if getattr(item, "servicio_id", None):
                servicio = _servicios_by_id.get(item.servicio_id)
                if not servicio:
                    raise HTTPException(404, f"Servicio {item.servicio_id} no existe")
                # Snapshot del servicio en la línea (preserva nombre/costo aunque
                # el catálogo cambie después).
                sku_libre = sku_libre or servicio.codigo
                descripcion_libre = descripcion_libre or servicio.nombre
                if costo_origen <= 0:
                    costo_origen = Decimal(servicio.costo or 0)
                moneda_origen_linea = (
                    item.moneda_origen or servicio.moneda or "MXN"
                ).upper()
            elif item.producto_id:
                producto = _productos_by_id.get(item.producto_id)
                if not producto:
                    raise HTTPException(404, f"Producto {item.producto_id} no existe")

                if tipo_orden != models.EstatusOrden.COTIZACION:
                    # SALIDA auditada (kardex) + lock pesimista vía aplicar_movimiento.
                    # movimientos_stock.cantidad es Integer: cantidad (Numeric(12,3) desde
                    # Task 4) debe ser entera para poder moverse en el kardex.
                    cantidad_stock = cantidad_entera_para_stock(item.cantidad, producto.sku)
                    # El servicio valida stock no-negativo y levanta ValueError si falla.
                    try:
                        aplicar_movimiento(
                            db,
                            producto=producto,
                            tipo=TipoMovimientoStock.SALIDA.value,
                            cantidad=-cantidad_stock,
                            referencia_tipo="venta_directa",
                            referencia_id=nueva_orden.id,
                            motivo=f"venta directa {nueva_orden.folio}",
                            usuario=current_user,
                        )
                    except ValueError as exc:
                        raise HTTPException(400, f"Stock insuficiente para {producto.sku}: {exc}")

                # Producto de catálogo: la moneda origen SIEMPRE es la del catálogo,
                # nunca la del payload (evita inflación ×TC por moneda_origen falsa vía API).
                moneda_origen_linea = (producto.moneda_compra or "MXN").upper()
                # Override de costo: si el frontend manda costo_unitario > 0, es un
                # override para esta cotización. Schema acepta ge=0 pero aquí 0 (o None)
                # se interpreta como "no override" — el frontend valida cost > 0 antes
                # de enviar overrides, así que un 0 solo llega cuando no se pretende
                # override. Si no hay override, snapshot del catálogo.
                if item.costo_unitario and Decimal(item.costo_unitario) > 0:
                    costo_origen = Decimal(item.costo_unitario)
                else:
                    costo_origen = Decimal(producto.costo_compra or 0)
            else:
                if not descripcion_libre:
                    raise HTTPException(
                        400,
                        "Producto fantasma requiere descripción y costo unitario.",
                    )
                if costo_origen <= 0:
                    raise HTTPException(
                        400,
                        "Producto fantasma requiere costo unitario > 0.",
                    )

            # Guarda anti-subvaluación: si la línea requiere conversión USD↔MXN y el
            # TC es implausible (USD/MXN nunca < 5), rechazar en vez de cotizar a ×2.
            if moneda_origen_linea != moneda_cotizacion and tipo_cambio < Decimal("5"):
                raise HTTPException(
                    400,
                    f"Tipo de cambio implausible ({tipo_cambio}) para convertir líneas en "
                    f"{moneda_origen_linea} a {moneda_cotizacion}. Captura el TC de Banxico.",
                )
            costo_base = _convert_cost_to_quote_currency(
                costo_origen,
                moneda_origen_linea,
                moneda_cotizacion,
                tc_mn_a_usd_eff,
                tc_usd_a_mn_eff,
            )
            utilidad_pct = Decimal(item.utilidad or 0)
            descuento_pct = Decimal(item.descuento or 0)
            precio_unit_bruto = costo_base * (Decimal("1.0") + (utilidad_pct / Decimal("100")))
            # Redondear el subtotal por línea ANTES de acumular: así la suma de los
            # subtotales impresos en el PDF cuadra exacto con orden.total (sin descuadre
            # de centavos por redondear sólo el gran total).
            subtotal = (
                precio_unit_bruto
                * item.cantidad
                * (Decimal("1.0") - (descuento_pct / Decimal("100")))
            ).quantize(Decimal("0.01"))
            total_orden += subtotal

            # Upsert fantasma solo para líneas ad-hoc (sin producto ni servicio del catálogo)
            _fantasma_id = None
            if producto is None and servicio is None:
                _fantasma_id = upsert_from_detalle(
                    db,
                    descripcion=descripcion_libre or "",
                    sku_libre=sku_libre,
                    costo=costo_origen,
                    moneda=moneda_origen_linea,
                    proveedor_sugerido_id=getattr(item, "proveedor_sugerido_id", None),
                    marca=getattr(item, "marca", None),
                    marca_id=getattr(item, "marca_id", None),
                    clave_prod_serv=getattr(item, "clave_prod_serv", None),
                    clave_unidad_sat=getattr(item, "clave_unidad_sat", None),
                    observaciones=getattr(item, "observaciones", None),
                )

            # Snapshot SAT por línea (US-006/008): catálogo copia de Producto;
            # fantasma usa lo capturado en el modal; servicio queda sin SAT.
            # Marca por línea (US-013/014): mismo origen; mostrar_marca es el
            # flag por producto que decide si la marca sale en el PDF.
            if producto is not None:
                _clave_prod = producto.clave_prod_serv
                _clave_unidad = producto.clave_unidad_sat
                _marca = getattr(item, "marca", None) or producto.marca
            else:
                _clave_prod = getattr(item, "clave_prod_serv", None)
                _clave_unidad = getattr(item, "clave_unidad_sat", None)
                _marca = getattr(item, "marca", None)
            _mostrar_marca = bool(getattr(item, "mostrar_marca", False))

            tipo_linea = _resolve_tipo_linea(item, producto)
            # Snapshot de unidad (Task 4): lo que mandó el payload, o si no vino,
            # la del catálogo (solo aplica cuando hay producto — fantasma/servicio
            # no tienen unidad de catálogo de la cual heredar).
            _unidad = getattr(item, "unidad", None) or (producto.unidad if producto else None)
            db.add(models.DetalleOrden(
                orden_id=nueva_orden.id,
                producto_id=producto.id if producto else None,
                servicio_id=servicio.id if servicio else None,
                sku_libre=sku_libre,
                descripcion_libre=descripcion_libre,
                moneda_origen_linea=moneda_origen_linea,
                costo_base_linea=costo_origen.quantize(Decimal("0.01")),
                clave_prod_serv=_clave_prod,
                clave_unidad_sat=_clave_unidad,
                marca=_marca,
                mostrar_marca=_mostrar_marca,
                cantidad=item.cantidad,
                unidad=_unidad,
                # precio_unitario = bruto pre-descuento (lo que el cliente ve por unidad).
                # subtotal ya incluye el descuento aplicado.
                precio_unitario=precio_unit_bruto.quantize(Decimal("0.01")),
                utilidad_aplicada=utilidad_pct,
                descuento_aplicado=descuento_pct,
                descuento_proveedor=Decimal(getattr(item, "descuento_proveedor", 0) or 0),
                subtotal=subtotal.quantize(Decimal("0.01")),
                tipo_linea=tipo_linea,
                proveedor_sugerido_id=getattr(item, "proveedor_sugerido_id", None),
                fantasma_id=_fantasma_id,
                entrega_min=item.entrega_min,
                entrega_max=item.entrega_max,
                entrega_unidad=item.entrega_unidad,
                observaciones_linea=item.observaciones_linea,
            ))

            # Reserva inventario sólo si es producto del catálogo y la orden es cotización
            if (
                tipo_orden == models.EstatusOrden.COTIZACION
                and producto is not None
                and tipo_linea == "producto_catalogo"
            ):
                cantidad_stock = cantidad_entera_para_stock(item.cantidad, producto.sku)
                reservar_para_cotizacion(
                    db,
                    producto=producto,
                    cantidad=cantidad_stock,
                    cotizacion_id=nueva_orden.id,
                    usuario=current_user,
                )

        nueva_orden.total = total_orden.quantize(Decimal("0.01"))

        # Deuda (Solo si es venta directa) — usa CxC formal con vencimiento.
        if tipo_orden == models.EstatusOrden.PENDIENTE:
            total_con_iva = (total_orden * (Decimal("1.0") + get_iva_rate(db))).quantize(Decimal("0.01"))
            crear_cargo_por_venta(
                db,
                orden_venta=nueva_orden,
                monto=total_con_iva,
                descripcion=f"Venta {folio}",
            )

        db.commit()
        db.refresh(nueva_orden)
        return nueva_orden

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.crear_orden falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

# --- 2. EDITAR COTIZACIÓN (PUT) ---
@router.put("/{id}", response_model=schemas.OrdenVentaResponse, dependencies=[Depends(allow_all_staff)])
def actualizar_orden(
    id: int,
    orden_update: schemas.OrdenVentaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(models.OrdenVenta.id == id)
        .with_for_update()
        .first()
    )
    if not orden:
        raise HTTPException(404, "Orden no encontrada")

    # Ownership: VENTAS sólo edita las propias; admin/gerente pasan.
    _check_owner_or_403(orden, current_user, action="write")

    if orden.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(
            status_code=409,
            detail={"code": "WRONG_STATE",
                    "message": "Solo se editan cotizaciones en estado COTIZACION."},
        )

    if orden.enviada_at is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "ALREADY_SENT",
                    "message": "Cotización ya enviada al cliente. Crea una versión nueva.",
                    "recotizar_url": f"/api/ventas/{id}/recotizar"},
        )

    total_anterior = orden.total or Decimal(0)

    moneda_cotizacion = _normalize_currency(orden_update.moneda)
    tipo_cambio = _resolve_exchange_rate(moneda_cotizacion, orden_update.tipo_cambio)
    if not (Decimal("1.0") <= Decimal(tipo_cambio) <= Decimal("100.0")):
        raise HTTPException(400, "tipo_cambio fuera de rango (1.0 a 100.0)")
    tolerancia_tc = (
        Decimal(orden_update.tolerancia_tc)
        if orden_update.tolerancia_tc is not None
        else Decimal("1.0")
    )
    # _eff solo para cálculo de importes; se persiste el override crudo (abajo).
    tc_mn_a_usd_eff, tc_usd_a_mn_eff = _resolve_directional_tcs(
        tipo_cambio,
        orden_update.tc_mn_a_usd,
        orden_update.tc_usd_a_mn,
        tolerancia_tc,
    )

    try:
        # Actualizar cabecera
        orden.cliente_id = orden_update.cliente_id
        orden.contacto_id = orden_update.contacto_id
        orden.observaciones = orden_update.observaciones
        if orden_update.terminos_condiciones is not None:
            orden.terminos_condiciones = orden_update.terminos_condiciones
        orden.moneda = moneda_cotizacion
        orden.tipo_cambio = tipo_cambio
        orden.tc_mn_a_usd = orden_update.tc_mn_a_usd
        orden.tc_usd_a_mn = orden_update.tc_usd_a_mn
        orden.tolerancia_tc = tolerancia_tc
        if orden_update.fecha_creacion is not None:
            orden.fecha_creacion = orden_update.fecha_creacion
        if orden_update.fecha_vencimiento is not None:
            orden.fecha_vencimiento = orden_update.fecha_vencimiento
        elif orden.fecha_vencimiento is None:
            # No tenía vencimiento previo; aplicar default
            orden.fecha_vencimiento = datetime.utcnow() + timedelta(days=get_quote_validity_days(db))
        if orden_update.pdf_unificado is not None:
            orden.pdf_unificado = 1 if orden_update.pdf_unificado else 0
        if orden_update.concepto_unificado is not None:
            orden.concepto_unificado = orden_update.concepto_unificado

        # Liberar reservas previas antes de borrar y reinsertar detalles
        liberar_reservas_cotizacion(
            db,
            cotizacion_id=orden.id,
            motivo="re-edición de cotización",
            usuario=current_user,
        )

        # Borrar detalles viejos
        db.query(models.DetalleOrden).filter(
            models.DetalleOrden.orden_id == id,
        ).delete()

        total_orden = Decimal(0)

        # Precarga para evitar N+1 en el loop.
        _prod_ids_upd = {it.producto_id for it in orden_update.detalles if it.producto_id}
        _serv_ids_upd = {getattr(it, "servicio_id", None) for it in orden_update.detalles if getattr(it, "servicio_id", None)}
        _productos_by_id_upd = {}
        _servicios_by_id_upd = {}
        if _prod_ids_upd:
            _productos_by_id_upd = {
                p.id: p for p in db.query(models.Producto).filter(models.Producto.id.in_(_prod_ids_upd)).all()
            }
        if _serv_ids_upd:
            _servicios_by_id_upd = {
                s.id: s for s in db.query(models.Servicio).filter(models.Servicio.id.in_(_serv_ids_upd)).all()
            }

        # Insertar nuevos
        for item in orden_update.detalles:
            producto = None
            servicio = None
            costo_origen = Decimal(item.costo_unitario or 0)
            moneda_origen_linea = (item.moneda_origen or "MXN").upper()
            sku_libre = (item.sku_libre or "").strip() or None
            descripcion_libre = (item.descripcion_libre or "").strip() or None

            if getattr(item, "servicio_id", None):
                servicio = _servicios_by_id_upd.get(item.servicio_id)
                if not servicio:
                    raise HTTPException(404, f"Servicio {item.servicio_id} no existe")
                sku_libre = sku_libre or servicio.codigo
                descripcion_libre = descripcion_libre or servicio.nombre
                if costo_origen <= 0:
                    costo_origen = Decimal(servicio.costo or 0)
                moneda_origen_linea = (
                    item.moneda_origen or servicio.moneda or "MXN"
                ).upper()
            elif item.producto_id:
                producto = _productos_by_id_upd.get(item.producto_id)
                if not producto:
                    raise HTTPException(404, f"Producto {item.producto_id} no encontrado")
                # Producto de catálogo: la moneda origen SIEMPRE es la del catálogo,
                # nunca la del payload (evita inflación ×TC por moneda_origen falsa vía API).
                moneda_origen_linea = (producto.moneda_compra or "MXN").upper()
                # Override de costo (mismo contrato que POST): costo_unitario > 0 = override
                # para esta cotización; 0/None = snapshot del catálogo.
                if item.costo_unitario and Decimal(item.costo_unitario) > 0:
                    costo_origen = Decimal(item.costo_unitario)
                else:
                    costo_origen = Decimal(producto.costo_compra or 0)
            else:
                if not descripcion_libre:
                    raise HTTPException(400, "Producto fantasma requiere descripción.")
                if costo_origen <= 0:
                    raise HTTPException(400, "Producto fantasma requiere costo unitario > 0.")

            # Guarda anti-subvaluación: si la línea requiere conversión USD↔MXN y el
            # TC es implausible (USD/MXN nunca < 5), rechazar en vez de cotizar a ×2.
            if moneda_origen_linea != moneda_cotizacion and tipo_cambio < Decimal("5"):
                raise HTTPException(
                    400,
                    f"Tipo de cambio implausible ({tipo_cambio}) para convertir líneas en "
                    f"{moneda_origen_linea} a {moneda_cotizacion}. Captura el TC de Banxico.",
                )
            costo_base = _convert_cost_to_quote_currency(
                costo_origen,
                moneda_origen_linea,
                moneda_cotizacion,
                tc_mn_a_usd_eff,
                tc_usd_a_mn_eff,
            )
            utilidad_pct = Decimal(item.utilidad or 0)
            descuento_pct = Decimal(item.descuento or 0)
            precio_unit_bruto = costo_base * (Decimal("1.0") + (utilidad_pct / Decimal("100")))
            # Redondear el subtotal por línea ANTES de acumular: así la suma de los
            # subtotales impresos en el PDF cuadra exacto con orden.total (sin descuadre
            # de centavos por redondear sólo el gran total).
            subtotal = (
                precio_unit_bruto
                * item.cantidad
                * (Decimal("1.0") - (descuento_pct / Decimal("100")))
            ).quantize(Decimal("0.01"))
            total_orden += subtotal

            # Upsert fantasma solo para líneas ad-hoc (sin producto ni servicio del catálogo)
            _fantasma_id = None
            if producto is None and servicio is None:
                _fantasma_id = upsert_from_detalle(
                    db,
                    descripcion=descripcion_libre or "",
                    sku_libre=sku_libre,
                    costo=costo_origen,
                    moneda=moneda_origen_linea,
                    proveedor_sugerido_id=getattr(item, "proveedor_sugerido_id", None),
                    marca=getattr(item, "marca", None),
                    marca_id=getattr(item, "marca_id", None),
                    clave_prod_serv=getattr(item, "clave_prod_serv", None),
                    clave_unidad_sat=getattr(item, "clave_unidad_sat", None),
                    observaciones=getattr(item, "observaciones", None),
                )

            # Snapshot SAT por línea (US-006/008): catálogo copia de Producto;
            # fantasma usa lo capturado en el modal; servicio queda sin SAT.
            # Marca por línea (US-013/014): mismo origen; mostrar_marca es el
            # flag por producto que decide si la marca sale en el PDF.
            if producto is not None:
                _clave_prod = producto.clave_prod_serv
                _clave_unidad = producto.clave_unidad_sat
                _marca = getattr(item, "marca", None) or producto.marca
            else:
                _clave_prod = getattr(item, "clave_prod_serv", None)
                _clave_unidad = getattr(item, "clave_unidad_sat", None)
                _marca = getattr(item, "marca", None)
            _mostrar_marca = bool(getattr(item, "mostrar_marca", False))

            tipo_linea = _resolve_tipo_linea(item, producto)
            # Snapshot de unidad (Task 4): payload, o fallback al catálogo si no vino.
            _unidad = getattr(item, "unidad", None) or (producto.unidad if producto else None)
            db.add(models.DetalleOrden(
                orden_id=orden.id,
                producto_id=producto.id if producto else None,
                servicio_id=servicio.id if servicio else None,
                sku_libre=sku_libre,
                descripcion_libre=descripcion_libre,
                moneda_origen_linea=moneda_origen_linea,
                costo_base_linea=costo_origen.quantize(Decimal("0.01")),
                clave_prod_serv=_clave_prod,
                clave_unidad_sat=_clave_unidad,
                marca=_marca,
                mostrar_marca=_mostrar_marca,
                cantidad=item.cantidad,
                unidad=_unidad,
                precio_unitario=precio_unit_bruto.quantize(Decimal("0.01")),
                utilidad_aplicada=utilidad_pct,
                descuento_aplicado=descuento_pct,
                descuento_proveedor=Decimal(getattr(item, "descuento_proveedor", 0) or 0),
                subtotal=subtotal.quantize(Decimal("0.01")),
                tipo_linea=tipo_linea,
                proveedor_sugerido_id=getattr(item, "proveedor_sugerido_id", None),
                fantasma_id=_fantasma_id,
                entrega_min=item.entrega_min,
                entrega_max=item.entrega_max,
                entrega_unidad=item.entrega_unidad,
                observaciones_linea=item.observaciones_linea,
            ))

            if (
                producto is not None
                and tipo_linea == "producto_catalogo"
                and orden.estatus == models.EstatusOrden.COTIZACION
            ):
                cantidad_stock = cantidad_entera_para_stock(item.cantidad, producto.sku)
                reservar_para_cotizacion(
                    db,
                    producto=producto,
                    cantidad=cantidad_stock,
                    cotizacion_id=orden.id,
                    usuario=current_user,
                )

        orden.total = total_orden.quantize(Decimal("0.01"))

        db.add(models.QuoteEvent(
            orden_id=orden.id,
            canal="NOTE",
            direccion="INTERNAL",
            estatus="LOGGED",
            asunto="EDITED",
            cuerpo="",
            metadata_json=_cr_json.dumps({
                "total_anterior": float(total_anterior),
                "total_nuevo": float(orden.total),
            }),
            creado_por_id=current_user.id,
        ))

        db.commit()
        db.refresh(orden)
        return orden

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.actualizar_orden falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

# --- 2.5 RECOTIZAR (CREAR NUEVA VERSIÓN) ---
@router.post("/{id}/recotizar", response_model=schemas.OrdenVentaResponse, dependencies=[Depends(allow_all_staff)])
def recotizar(
    id: int,
    current_user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea una nueva versión de la cotización clonando partidas. La original
    queda archivada (no se modifica) y se devuelve la nueva versión."""
    origen = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not origen:
        raise HTTPException(404, "Cotización origen no encontrada")
    if origen.estatus not in (models.EstatusOrden.COTIZACION, models.EstatusOrden.CANCELADA):
        raise HTTPException(400, "Sólo cotizaciones se pueden recotizar")

    try:
        raiz_id = origen.cotizacion_origen_id or origen.id

        # Advisory lock transaccional: serializa el cómputo de `siguiente_version`
        # por raíz. Sin esto, dos recotizaciones concurrentes del mismo origen
        # computarían el mismo N+1 e intentarían insertar el mismo folio
        # versionado (`...V{N+1}`), causando UniqueViolation.
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"folio:recotizar:{raiz_id}"})

        siguiente_version = (
            db.query(models.OrdenVenta)
            .filter(
                ((models.OrdenVenta.cotizacion_origen_id == raiz_id) | (models.OrdenVenta.id == raiz_id)),
            )
            .count()
            + 1
        )

        # Folio versionado se deriva del folio RAÍZ (no consume slot del consecutivo
        # mensual). Si el origen ya es versionado (ej. C-2605001V2), se recorta el
        # sufijo V<n> y se reconstruye con la versión actual.
        folio_raiz = re.sub(r"V\d+$", "", origen.folio or "")
        folio_versionado = f"{folio_raiz}V{siguiente_version}"

        nueva = models.OrdenVenta(
            folio=folio_versionado,
            cliente_id=origen.cliente_id,
            contacto_id=origen.contacto_id,
            vendedor_id=current_user.id,
            estatus=models.EstatusOrden.COTIZACION,
            observaciones=origen.observaciones,
            terminos_condiciones=origen.terminos_condiciones,
            moneda=origen.moneda,
            tipo_cambio=origen.tipo_cambio,
            tc_mn_a_usd=origen.tc_mn_a_usd,
            tc_usd_a_mn=origen.tc_usd_a_mn,
            tolerancia_tc=origen.tolerancia_tc,
            total=origen.total,
            fecha_vencimiento=datetime.utcnow() + timedelta(days=get_quote_validity_days(db)),
            cotizacion_origen_id=raiz_id,
            version=siguiente_version,
            enviada_at=None,
            pdf_generado_at=None,
        )
        db.add(nueva)
        db.flush()

        for det in origen.detalles:
            db.add(models.DetalleOrden(
                orden_id=nueva.id,
                producto_id=det.producto_id,
                servicio_id=det.servicio_id,
                sku_libre=det.sku_libre,
                descripcion_libre=det.descripcion_libre,
                moneda_origen_linea=det.moneda_origen_linea,
                costo_base_linea=det.costo_base_linea,
                clave_prod_serv=det.clave_prod_serv,
                clave_unidad_sat=det.clave_unidad_sat,
                marca=det.marca,
                mostrar_marca=det.mostrar_marca,
                cantidad=det.cantidad,
                unidad=det.unidad,
                precio_unitario=det.precio_unitario,
                utilidad_aplicada=det.utilidad_aplicada,
                descuento_aplicado=det.descuento_aplicado,
                descuento_proveedor=det.descuento_proveedor or Decimal("0"),
                subtotal=det.subtotal,
                tipo_linea=det.tipo_linea,
                proveedor_sugerido_id=det.proveedor_sugerido_id,
                entrega_min=det.entrega_min,
                entrega_max=det.entrega_max,
                entrega_unidad=det.entrega_unidad,
                observaciones_linea=det.observaciones_linea,
            ))

        # Audit: registrar evento en origen y en hija
        db.add(models.QuoteEvent(
            orden_id=origen.id,
            canal="NOTE",
            direccion="INTERNAL",
            estatus="LOGGED",
            asunto="RECOTIZADA",
            cuerpo="",
            metadata_json=_cr_json.dumps({
                "accion": "origen_clonada",
                "hija_id": nueva.id,
                "hija_folio": folio_versionado,
                "version": siguiente_version,
            }),
            creado_por_id=current_user.id,
        ))
        db.add(models.QuoteEvent(
            orden_id=nueva.id,
            canal="NOTE",
            direccion="INTERNAL",
            estatus="LOGGED",
            asunto="RECOTIZADA",
            cuerpo="",
            metadata_json=_cr_json.dumps({
                "accion": "clonada_de",
                "origen_id": origen.id,
                "origen_folio": origen.folio,
                "version": siguiente_version,
            }),
            creado_por_id=current_user.id,
        ))

        db.commit()
        db.refresh(nueva)
        return nueva
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.recotizar falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.get("/{id}/versiones", dependencies=[Depends(allow_all_staff)])
def listar_versiones(
    id: int,
    db: Session = Depends(get_db),
):
    base = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not base:
        raise HTTPException(404, "Cotización no encontrada")
    raiz_id = base.cotizacion_origen_id or base.id

    versiones = (
        db.query(models.OrdenVenta)
        .filter(
            ((models.OrdenVenta.cotizacion_origen_id == raiz_id) | (models.OrdenVenta.id == raiz_id)),
        )
        .order_by(models.OrdenVenta.version.asc())
        .all()
    )
    return [
        {
            "id": v.id,
            "folio": v.folio,
            "version": v.version,
            "estatus": v.estatus,
            "total": v.total,
            "moneda": v.moneda,
            "fecha": v.fecha_creacion,
        }
        for v in versiones
    ]


# --- 3. CONVERTIR COTIZACIÓN A VENTA (POST) ---
@router.post("/{id}/convertir", dependencies=[Depends(allow_all_staff)])
def convertir_cotizacion(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden or orden.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Orden no válida para conversión")
    _check_owner_or_403(orden, current_user, action="convert")

    # Advisory lock por cotización: si dos convert simultáneos llegan al
    # mismo id, el segundo espera para no doble-decrementar stock.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
        {"k": f"convert:{orden.id}"},
    )

    try:
        # Re-verificar estatus tras el lock (otra request pudo convertir).
        db.refresh(orden)
        if orden.estatus != models.EstatusOrden.COTIZACION:
            raise HTTPException(409, "La cotización ya fue convertida o cancelada.")

        # Verificar disponible considerando reservas de OTRAS cotizaciones.
        # Para cada línea de catálogo: stock_actual - reservas_de_otras_cotizaciones >= cantidad.
        for det in orden.detalles:
            if det.producto is None:
                continue
            if det.tipo_linea == "servicio" or det.producto.es_servicio:
                continue
            propia = det.cantidad
            reservado_total = reservas_activas(db, det.producto.id)
            otras = max(reservado_total - propia, 0)
            libre = (det.producto.stock_actual or 0) - otras
            if libre < det.cantidad:
                raise HTTPException(
                    400,
                    f"Stock insuficiente para {det.producto.sku} "
                    f"(libre={libre}, requerido={det.cantidad})",
                )

        # Convertir reservas en salidas reales (descuenta stock_actual)
        consumir_reservas_a_salida(db, cotizacion_id=orden.id, usuario=current_user)

        # Cambiar Estatus y Folio (formato real: C-YYMMNNN -> V-YYMMNNN; legacy: COT- -> VTA-)
        orden.estatus = models.EstatusOrden.PENDIENTE
        if orden.folio:
            if orden.folio.startswith("C-"):
                orden.folio = "V" + orden.folio[1:]
            elif orden.folio.startswith("COT-"):
                orden.folio = orden.folio.replace("COT-", "VTA-", 1)
        
        # Generar Deuda — usando servicio CxC formal (vence en cliente.dias_credito)
        total_con_iva = (orden.total * (Decimal("1.0") + get_iva_rate(db))).quantize(Decimal("0.01"))
        crear_cargo_por_venta(
            db,
            orden_venta=orden,
            monto=total_con_iva,
            descripcion=f"Venta {orden.folio} (Desde Cotización)",
        )
        
        db.commit()
        return {"mensaje": "Convertido exitosamente", "nuevo_folio": orden.folio}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.convertir_cotizacion falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

# --- 4. LISTAR HISTORIAL ---
@router.get("/historial", dependencies=[Depends(allow_all_staff)])
def listar_historial(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    estatus: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    require(current_user, "read", "cotizacion")  # operativo: 403
    query = db.query(models.OrdenVenta)
    if is_owner_scoped(current_user, "read", "cotizacion"):
        query = query.filter(models.OrdenVenta.vendedor_id == current_user.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.OrdenVenta.folio.ilike(like),
            models.OrdenVenta.cliente.has(
                models.Cliente.nombre_empresa.ilike(like)
            ),
        ))
    if estatus and estatus.upper() != "TODOS":
        query = query.filter(
            models.OrdenVenta.estatus == estatus.lower()
        )
    ordenes = (
        query
        .order_by(desc(models.OrdenVenta.fecha_creacion))
        .offset(skip)
        .limit(limit)
        .all()
    )

    ahora = datetime.utcnow().date()

    return [{
        "id": o.id,
        "folio": o.folio,
        "fecha": o.fecha_creacion,
        "fecha_vencimiento": o.fecha_vencimiento,
        "cliente": o.cliente.nombre_empresa if o.cliente else None,
        "total": o.total,
        "moneda": o.moneda,
        "tipo_cambio": o.tipo_cambio,
        "estatus": o.estatus,
        "version": o.version or 1,
        "cotizacion_origen_id": o.cotizacion_origen_id,
        "edad_dias": max((ahora - o.fecha_creacion.date()).days, 0) if o.fecha_creacion else 0,
        "dias_restantes": (o.fecha_vencimiento.date() - ahora).days if o.fecha_vencimiento else None,
        "esta_vencida": bool(o.fecha_vencimiento and o.fecha_vencimiento.date() < ahora),
    } for o in ordenes]


@router.get("/borradores", dependencies=[Depends(allow_all_staff)])
def listar_borradores(
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Cotizaciones en COTIZACION sin enviar — pila de borradores."""
    require(current_user, "read", "cotizacion")

    if page < 1 or page_size < 1 or page_size > 200:
        raise HTTPException(400, "page o page_size inválido")

    offset = (page - 1) * page_size

    query = db.query(models.OrdenVenta).filter(
        models.OrdenVenta.estatus == models.EstatusOrden.COTIZACION,
        models.OrdenVenta.enviada_at.is_(None),
    )
    if is_owner_scoped(current_user, "read", "cotizacion"):
        query = query.filter(models.OrdenVenta.vendedor_id == current_user.id)

    total = query.count()

    rows = (
        query
        .order_by(
            desc(models.OrdenVenta.actualizado_en),
            desc(models.OrdenVenta.fecha_creacion),
        )
        .offset(offset)
        .limit(page_size)
        .all()
    )

    ahora = datetime.now(tz=timezone.utc)

    def _edad_dias(dt):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max((ahora - dt).days, 0)

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": r.id,
                "folio": r.folio,
                "cliente_id": r.cliente_id,
                "cliente_nombre": r.cliente.nombre_empresa if r.cliente else None,
                "moneda": r.moneda,
                "total": float(r.total or 0),
                "tipo_cambio": float(r.tipo_cambio or 0),
                "actualizado_en": (r.actualizado_en or r.fecha_creacion).isoformat() if (r.actualizado_en or r.fecha_creacion) else None,
                "edad_dias": _edad_dias(r.actualizado_en or r.fecha_creacion),
                "pdf_desactualizado": (
                    r.pdf_generado_at is None
                    or (r.actualizado_en is not None and r.actualizado_en > r.pdf_generado_at)
                ),
                "lineas_count": len(r.detalles),
            }
            for r in rows
        ],
    }


# --- 5. DETALLE JSON (PARA EDICIÓN) ---
@router.get("/{id}/detalle-json", dependencies=[Depends(allow_all_staff)])
def obtener_detalle_orden(
    id: int,
    db: Session = Depends(get_db),
):
    """Devuelve la cotización completa serializada para precargar el cotizador
    en modo edición. Tolera líneas con producto/servicio/fantasma/ad-hoc."""
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden:
        raise HTTPException(404)

    detalles = []
    for d in orden.detalles:
        prod = None
        if d.producto is not None:
            prod = {
                "id": d.producto.id,
                "sku": d.producto.sku_comercial or d.producto.sku or "—",
                "sku_interno": d.producto.sku,
                "nombre": d.producto.nombre,
                "marca": d.producto.marca,
                "moneda_compra": d.producto.moneda_compra,
                "costo_compra": float(d.producto.costo_compra or 0),
            }
        servicio = None
        if d.servicio is not None:
            servicio = {
                "id": d.servicio.id,
                "codigo": d.servicio.codigo,
                "nombre": d.servicio.nombre,
                "moneda": d.servicio.moneda,
                "costo": float(d.servicio.costo or 0),
                "clave_prod_serv": d.servicio.clave_prod_serv,
                "clave_unidad_sat": d.servicio.clave_unidad_sat,
            }
        detalles.append({
            "id": d.id,
            "producto": prod,
            "producto_id": d.producto_id,
            "servicio": servicio,
            "servicio_id": d.servicio_id,
            "sku_libre": d.sku_libre,
            "descripcion_libre": d.descripcion_libre,
            "moneda_origen_linea": d.moneda_origen_linea,
            "costo_base_linea": float(d.costo_base_linea or 0),
            "cantidad": d.cantidad,
            "precio_unitario": float(d.precio_unitario or 0),
            "utilidad_aplicada": float(d.utilidad_aplicada or 0),
            "descuento_aplicado": float(d.descuento_aplicado or 0),
            "descuento_proveedor": float(d.descuento_proveedor or 0),
            "subtotal": float(d.subtotal or 0),
            "tipo_linea": d.tipo_linea,
            "entrega_min": d.entrega_min,
            "entrega_max": d.entrega_max,
            "entrega_unidad": d.entrega_unidad,
            "observaciones_linea": d.observaciones_linea,
            "proveedor_sugerido_id": d.proveedor_sugerido_id,
            "fantasma_id": d.fantasma_id,
            "marca": d.marca,
            "mostrar_marca": bool(d.mostrar_marca),
            "clave_prod_serv": d.clave_prod_serv,
            "clave_unidad_sat": d.clave_unidad_sat,
        })

    pdf_desactualizado = (
        orden.pdf_generado_at is None
        or (orden.actualizado_en is not None and orden.actualizado_en > orden.pdf_generado_at)
    )

    return {
        "id": orden.id,
        "folio": orden.folio,
        "cliente_id": orden.cliente_id,
        "contacto_id": orden.contacto_id,
        "observaciones": orden.observaciones,
        "moneda": orden.moneda,
        "tipo_cambio": float(orden.tipo_cambio or 1),
        "tc_mn_a_usd": float(orden.tc_mn_a_usd) if orden.tc_mn_a_usd is not None else None,
        "tc_usd_a_mn": float(orden.tc_usd_a_mn) if orden.tc_usd_a_mn is not None else None,
        "tolerancia_tc": float(orden.tolerancia_tc) if orden.tolerancia_tc is not None else 1.0,
        "terminos_condiciones": orden.terminos_condiciones,
        "estatus": orden.estatus.value if hasattr(orden.estatus, "value") else str(orden.estatus),
        "version": orden.version or 1,
        "fecha_creacion": orden.fecha_creacion.isoformat() if orden.fecha_creacion else None,
        "actualizado_en": orden.actualizado_en.isoformat() if orden.actualizado_en else None,
        "fecha_vencimiento": orden.fecha_vencimiento.isoformat() if orden.fecha_vencimiento else None,
        "enviada_at": orden.enviada_at.isoformat() if orden.enviada_at else None,
        "pdf_generado_at": orden.pdf_generado_at.isoformat() if orden.pdf_generado_at else None,
        "pdf_desactualizado": pdf_desactualizado,
        "pdf_unificado": orden.pdf_unificado,
        "concepto_unificado": orden.concepto_unificado,
        "detalles": detalles,
    }

# --- 6. GENERAR PDF ---
@router.get("/{id}/pdf", response_class=HTMLResponse, dependencies=[Depends(allow_all_staff)])
def generar_pdf(
    id: int,
    db: Session = Depends(get_db),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden: raise HTTPException(404)

    iva = (orden.total * get_iva_rate(db)).quantize(Decimal("0.01"))
    gran_total = (orden.total + iva).quantize(Decimal("0.01"))
    es_cotizacion = orden.estatus == models.EstatusOrden.COTIZACION
    tipo_doc = "COTIZACION" if es_cotizacion else "NOTA DE VENTA"
    simbolo_moneda = _currency_symbol(orden.moneda)
    etiqueta_moneda = "Dólares Americanos" if orden.moneda == "USD" else "Moneda Nacional"
    etiqueta_moneda_corta = "USD" if orden.moneda == "USD" else "MN"

    meses_es = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
    if orden.fecha_creacion:
        f = orden.fecha_creacion
        fecha_str = f"{f.day} de {meses_es[f.month-1]} de {f.year}"
    else:
        fecha_str = ""
    vigencia_dias = (
        max((orden.fecha_vencimiento.date() - orden.fecha_creacion.date()).days, 0)
        if orden.fecha_vencimiento and orden.fecha_creacion
        else get_quote_validity_days(db)
    )

    # QR del folio embebido como data URI. Fallback silencioso si qrcode no
    # está instalado o falla la generación: el PDF se renderiza sin QR.
    qr_data_uri: str | None = None
    try:
        import base64
        import io as _io
        import qrcode  # type: ignore
        qr_img = qrcode.make(orden.folio)
        buf = _io.BytesIO()
        qr_img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        qr_data_uri = f"data:image/png;base64,{qr_b64}"
    except Exception:
        qr_data_uri = None

    orden.pdf_generado_at = datetime.now(tz=timezone.utc)
    db.commit()

    # PDF unificado (sub-proyecto D): si el flag está activo, sustituimos la
    # lista de detalles por un único concepto agregado con el total de la orden.
    if orden.pdf_unificado:
        concepto_titulo = (orden.concepto_unificado or "Proyecto integral").strip()
        lineas_resumen = []
        for d in orden.detalles:
            # Override gana sobre catálogo (descripcion_libre primero).
            desc = (
                d.descripcion_libre
                or (d.producto.nombre if d.producto else None)
                or (d.servicio.nombre if d.servicio else None)
                or "—"
            )
            # Clave SAT (prod/serv) como prefijo; snapshot del detalle gana,
            # luego catálogo (producto/servicio). Se omite si no hay clave.
            clave_sat = (
                d.clave_prod_serv
                or (d.producto.clave_prod_serv if d.producto else None)
                or (d.servicio.clave_prod_serv if d.servicio else None)
            )
            prefijo = f"[{clave_sat}] " if clave_sat else ""
            lineas_resumen.append(f"• {prefijo}{desc} (x{fmt_cantidad(d.cantidad)})")
        descripcion_unificada = concepto_titulo + "\n\n" + "\n".join(lineas_resumen)
        view_detalles = [{
            "es_unificado": True,
            "descripcion": descripcion_unificada,
            "sku_libre": None,
            "cantidad": 1,
            "precio_unitario": float(orden.total),
            "subtotal": float(orden.total),
            "descuento_aplicado": 0,
            "entrega_min": None,
            "entrega_max": None,
            "entrega_unidad": None,
            "observaciones_linea": None,
        }]
    else:
        view_detalles = None  # usa orden.detalles directamente en la plantilla

    env = Environment(loader=BaseLoader())
    return env.from_string(PDF_TEMPLATE_VENTA).render(
        orden=orden,
        iva=iva,
        gran_total=gran_total,
        tipo_doc=tipo_doc,
        es_cotizacion=es_cotizacion,
        simbolo_moneda=simbolo_moneda,
        etiqueta_moneda=etiqueta_moneda,
        etiqueta_moneda_corta=etiqueta_moneda_corta,
        vigencia_dias=vigencia_dias,
        fecha_str=fecha_str,
        iva_pct_label=_iva_pct_label(db),
        qr_data_uri=qr_data_uri,
        view_detalles=view_detalles,
        fmt_cantidad=fmt_cantidad,
    )


@router.get("/{id}/word", dependencies=[Depends(allow_all_staff)])
def generar_word(id: int, db: Session = Depends(get_db)):
    """Genera la cotización como .docx editable (descarga). Reutiliza el mismo
    cálculo de totales que /pdf. No muta pdf_generado_at (eso es del PDF)."""
    orden = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == id).first()
    if not orden:
        raise HTTPException(404)

    iva = (orden.total * get_iva_rate(db)).quantize(Decimal("0.01"))
    total = (orden.total + iva).quantize(Decimal("0.01"))
    es_cotizacion = orden.estatus == models.EstatusOrden.COTIZACION
    tipo_doc = "COTIZACION" if es_cotizacion else "NOTA DE VENTA"
    simbolo = _currency_symbol(orden.moneda)

    meses_es = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    if orden.fecha_creacion:
        f = orden.fecha_creacion
        fecha_str = f"{f.day} de {meses_es[f.month - 1]} de {f.year}"
    else:
        fecha_str = ""
    vigencia_dias = (
        max((orden.fecha_vencimiento.date() - orden.fecha_creacion.date()).days, 0)
        if orden.fecha_vencimiento and orden.fecha_creacion
        else get_quote_validity_days(db)
    )

    data = build_cotizacion_docx(
        orden=orden,
        iva=iva,
        total=total,
        simbolo=simbolo,
        tipo_doc=tipo_doc,
        fecha_str=fecha_str,
        vigencia_dias=vigencia_dias,
    )
    filename = f"cotizacion_{orden.folio or orden.id}.docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Bloque 5: Tracking, correo, WhatsApp, IA
# ---------------------------------------------------------------------------

class _SendEmailIn(BaseModel):
    to: EmailStr
    cc: Optional[List[EmailStr]] = None
    subject: Optional[str] = Field(default=None, max_length=200)
    mensaje: Optional[str] = Field(default=None, max_length=4000)
    incluir_pdf_link: bool = True


class _WhatsappLogIn(BaseModel):
    direccion: str = Field(default="OUTBOUND", pattern="^(OUTBOUND|INBOUND)$")
    destinatario: Optional[str] = Field(default=None, max_length=80)
    mensaje: str = Field(..., min_length=1, max_length=4000)


def _quote_summary(orden: "models.OrdenVenta") -> dict:
    ahora = datetime.utcnow().date()
    edad = max((ahora - orden.fecha_creacion.date()).days, 0) if orden.fecha_creacion else 0
    dias_restantes = (
        (orden.fecha_vencimiento.date() - ahora).days if orden.fecha_vencimiento else None
    )
    detalles_resumen = "; ".join(
        f"{(d.producto.sku_comercial if d.producto else (d.sku_libre or 'FANTASMA'))} x{fmt_cantidad(d.cantidad)}"
        for d in (orden.detalles or [])[:8]
    )
    return {
        "folio": orden.folio,
        "cliente": orden.cliente.nombre_empresa if orden.cliente else "",
        "total": float(orden.total or 0),
        "moneda": orden.moneda,
        "estatus": orden.estatus.value if hasattr(orden.estatus, "value") else str(orden.estatus),
        "edad_dias": edad,
        "dias_restantes": dias_restantes,
        "detalles_resumen": detalles_resumen,
    }


@router.post("/{id}/enviar-correo", dependencies=[Depends(allow_all_staff)])
def enviar_correo(
    id: int,
    payload: _SendEmailIn,
    current_user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")

    asunto = (payload.subject or f"Cotización {orden.folio} - DASIC").strip()
    cuerpo = (payload.mensaje or "").strip()
    if not cuerpo:
        cuerpo = (
            f"Hola,\n\nAdjuntamos cotización {orden.folio} por un total de "
            f"{orden.moneda} {orden.total}.\n"
            "Cualquier duda quedamos atentos.\n\n— Equipo DASIC"
        )

    # Capturar datos necesarios en variables locales antes de cerrar la sesión
    orden_id = orden.id
    current_user_id = current_user.id

    # Crear evento con estatus inicial pendiente y commit ANTES del SMTP
    evento = models.QuoteEvent(
        orden_id=orden_id,
        canal="EMAIL",
        direccion="OUTBOUND",
        estatus="PENDING",
        asunto=asunto,
        cuerpo=cuerpo,
        destinatario=str(payload.to),
        creado_por_id=current_user_id,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    evento_id = evento.id

    # Cerrar sesión DB para liberar la conexión del pool ANTES del SMTP (~20s)
    db.close()

    estatus = "DRY_RUN"
    error_detail: Optional[str] = None
    try:
        if smtp_configured():
            estatus = send_quote_email(
                to=str(payload.to),
                subject=asunto,
                body=cuerpo,
                cc=[str(c) for c in (payload.cc or [])] or None,
            )
        else:
            estatus = "DRY_RUN"
    except EmailDeliveryError as exc:
        estatus = "FAILED"
        error_detail = str(exc)

    # Abrir nueva sesión para actualizar el estatus del evento + timestamps de la orden tras el SMTP
    db2 = SessionLocal()
    try:
        ev = db2.query(models.QuoteEvent).filter(models.QuoteEvent.id == evento_id).first()
        if ev:
            ev.estatus = estatus

        if estatus == "SENT":
            orden2 = (
                db2.query(models.OrdenVenta)
                .filter(models.OrdenVenta.id == orden_id)
                .first()
            )
            if orden2:
                ahora = datetime.now(tz=timezone.utc)
                orden2.pdf_generado_at = ahora
                if orden2.enviada_at is None:
                    orden2.enviada_at = ahora

        db2.commit()
    finally:
        db2.close()

    if estatus == "FAILED":
        raise HTTPException(502, detail=f"SMTP falló: {error_detail}")

    return {
        "evento_id": evento_id,
        "estatus": estatus,
        "smtp_configurado": smtp_configured(),
    }


@router.post("/{id}/whatsapp-log", dependencies=[Depends(allow_all_staff)])
def whatsapp_log(
    id: int,
    payload: _WhatsappLogIn,
    current_user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")

    evento = models.QuoteEvent(
        orden_id=orden.id,
        canal="WHATSAPP",
        direccion=payload.direccion,
        estatus="LOGGED",
        cuerpo=payload.mensaje,
        destinatario=payload.destinatario,
        creado_por_id=current_user.id,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return {"evento_id": evento.id, "estatus": "LOGGED"}


@router.post("/{id}/ia-resumen", dependencies=[Depends(allow_all_staff)])
def ia_resumen(
    id: int,
    current_user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")

    # Capturar todos los datos necesarios antes de cerrar la sesión
    orden_id = orden.id
    folio = orden.folio
    current_user_id = current_user.id
    summary = _quote_summary(orden)

    # Cerrar sesión DB para liberar la conexión del pool ANTES de la llamada a Anthropic (~2-5s)
    db.close()

    resultado = sugerir_proximo_paso(summary)

    # Abrir nueva sesión para persistir el evento IA
    db2 = SessionLocal()
    try:
        evento = models.QuoteEvent(
            orden_id=orden_id,
            canal="IA",
            direccion="INTERNAL",
            estatus=resultado.get("modo", "HEURISTICO"),
            asunto=f"IA - próximo paso {folio}",
            cuerpo=resultado.get("resumen", ""),
            creado_por_id=current_user_id,
        )
        db2.add(evento)
        db2.commit()
        db2.refresh(evento)
        evento_id = evento.id
    finally:
        db2.close()

    return {
        "evento_id": evento_id,
        "modo": resultado.get("modo"),
        "model": resultado.get("model"),
        "resumen": resultado.get("resumen"),
    }


@router.get("/{id}/eventos", dependencies=[Depends(allow_all_staff)])
def listar_eventos(
    id: int,
    db: Session = Depends(get_db),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(
            models.OrdenVenta.id == id,
        )
        .first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")

    eventos = (
        db.query(models.QuoteEvent)
        .filter(
            models.QuoteEvent.orden_id == orden.id,
        )
        .order_by(desc(models.QuoteEvent.creado_en))
        .limit(50)
        .all()
    )
    return [
        {
            "id": ev.id,
            "canal": ev.canal,
            "direccion": ev.direccion,
            "estatus": ev.estatus,
            "asunto": ev.asunto,
            "cuerpo": ev.cuerpo,
            "destinatario": ev.destinatario,
            "creado_en": ev.creado_en,
            "creado_por": ev.creado_por.nombre if ev.creado_por else None,
        }
        for ev in eventos
    ]


@router.get("/{id}/avance-entrega", dependencies=[Depends(allow_all_staff)])
def avance_entrega(
    id: int,
    current_user: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Avance de entrega por partida de una orden de venta, usando el mismo
    `repository` de remisiones (Task 5/7): cuánto se cotizó vs. cuánto ya se
    entregó (remisiones EMITIDA/RECIBIDA) por línea, más el historial de
    remisiones asociadas a la orden.

    `partidas` (el agregado cotizado/entregado/pendiente) se queda SIN
    owner-scoping — mismo criterio que `obtener_detalle_orden` (línea
    ~1549, "detalle-json"), que tampoco filtra por `vendedor_id`: el repo ya
    trata la cartera de cotizaciones/órdenes como de lectura compartida
    entre VENTAS.

    `remisiones` (el historial con folio/fecha/estado — identifica quién
    entregó qué) SÍ se filtra (fix round 1 de Task 7, finding reproducido:
    sin esto, cualquier VENTAS veía el historial de remisiones de una orden
    ajena, y OPERATIVO veía remisiones en borrador):
      - OPERATIVO: nunca ve BORRADOR/CANCELADA (mismo "consulta emitidas"
        que en `domains/remisiones/router.py`).
      - VENTAS (`read:own` en remision): si la ORDEN es suya, ve todas las
        remisiones de la orden (igual que en el router de remisiones —
        dueño de la orden ve remisiones ajenas creadas sobre ella). Si la
        orden es ajena, solo ve las remisiones que él mismo creó.
    """
    orden = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == id).first()
    if not orden:
        raise HTTPException(404, "Orden de venta no encontrada")

    entregado = remisiones_repository.entregado_por_detalle(db, orden.id)
    partidas = []
    for d in orden.detalles:
        cotizado = Decimal(str(d.cantidad))
        entreg = entregado.get(d.id, Decimal("0"))
        pendiente = cotizado - entreg
        if entreg == 0:
            estado_partida = "NO_ENTREGADA"
        elif pendiente <= 0:
            estado_partida = "ENTREGADA"
        else:
            estado_partida = "PARCIAL"
        partidas.append({
            "detalle_orden_id": d.id,
            "cotizado": float(cotizado),
            "entregado": float(entreg),
            "pendiente": float(pendiente),
            "estado": estado_partida,
        })

    remisiones_query = db.query(models.Remision).filter(models.Remision.orden_venta_id == orden.id)

    rol = _normalize_role(getattr(current_user, "rol", None))
    if rol == models.RolUsuario.OPERATIVO:
        remisiones_query = remisiones_query.filter(
            models.Remision.estado.in_([models.EstadoRemision.EMITIDA, models.EstadoRemision.RECIBIDA])
        )
    elif is_owner_scoped(current_user, "read", "remision") and orden.vendedor_id != current_user.id:
        remisiones_query = remisiones_query.filter(models.Remision.creado_por_id == current_user.id)

    remisiones = remisiones_query.order_by(desc(models.Remision.fecha_remision)).all()

    return {
        "partidas": partidas,
        "remisiones": [
            {
                "id": r.id,
                "folio": r.folio,
                "fecha": r.fecha_remision.isoformat() if r.fecha_remision else None,
                "estado": r.estado.value,
            }
            for r in remisiones
        ],
    }


# --- 7. CANCELAR COTIZACIÓN (libera reservas) ---
@router.post("/{id}/cancelar", dependencies=[Depends(allow_all_staff)])
def cancelar_cotizacion(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    orden = (
        db.query(models.OrdenVenta)
        .filter(models.OrdenVenta.id == id)
        .first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")
    if orden.estatus != models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "Sólo se cancelan cotizaciones abiertas")
    _check_owner_or_403(orden, current_user, action="cancel")

    try:
        liberadas = liberar_reservas_cotizacion(
            db,
            cotizacion_id=orden.id,
            motivo="cancelación manual",
            usuario=current_user,
        )
        orden.estatus = models.EstatusOrden.CANCELADA
        db.commit()
        return {"ok": True, "folio": orden.folio, "productos_liberados": liberadas}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.cancelar_cotizacion falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


# --- 8. AUTO-OC: sugerir + generar ---
@router.post("/{id}/sugerir-oc", dependencies=[Depends(allow_all_staff)])
def sugerir_oc(id: int, db: Session = Depends(get_db)):
    orden = (
        db.query(models.OrdenVenta).filter(models.OrdenVenta.id == id).first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")
    return previsualizar_ocs(db, orden)


@router.post("/{id}/generar-oc", dependencies=[Depends(allow_all_staff)])
def generar_oc_endpoint(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    orden = (
        db.query(models.OrdenVenta).filter(models.OrdenVenta.id == id).first()
    )
    if not orden:
        raise HTTPException(404, "Cotización no encontrada")
    try:
        return {"ocs": generar_ocs(db, orden, usuario=current_user)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("ventas.generar_oc_endpoint falló (id=%s)", id)
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


# ============================================================
# CR (Cotizador Robusto): endpoints inteligentes
# ============================================================
import json as _cr_json
from sqlalchemy import func as _cr_func
from pydantic import BaseModel as _CRBase


@router.get("/auto-utilidad", dependencies=[Depends(allow_all_staff)])
def auto_utilidad(
    cliente_id: Optional[int] = None,
    producto_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Sugerencia inteligente de % de utilidad.

    Prioridad: promedio para (cliente,producto) → cliente → producto → default 30.
    Devuelve {sugerido: float, fuente: str, n: int}.
    """
    base = db.query(models.DetalleOrden).join(
        models.OrdenVenta, models.DetalleOrden.orden_id == models.OrdenVenta.id
    ).filter(
        models.OrdenVenta.estatus != models.EstatusOrden.COTIZACION,
        models.DetalleOrden.utilidad_aplicada.is_not(None),
        models.DetalleOrden.utilidad_aplicada > 0,
    )

    def _avg(rows):
        vals = [float(r.utilidad_aplicada) for r in rows if r.utilidad_aplicada]
        return round(sum(vals) / len(vals), 2) if vals else None

    if cliente_id and producto_id:
        rows = base.filter(
            models.OrdenVenta.cliente_id == cliente_id,
            models.DetalleOrden.producto_id == producto_id,
        ).limit(50).all()
        v = _avg(rows)
        if v is not None:
            return {"sugerido": v, "fuente": "cliente_producto", "n": len(rows)}

    if cliente_id:
        rows = base.filter(models.OrdenVenta.cliente_id == cliente_id).limit(100).all()
        v = _avg(rows)
        if v is not None:
            return {"sugerido": v, "fuente": "cliente", "n": len(rows)}

    if producto_id:
        rows = base.filter(models.DetalleOrden.producto_id == producto_id).limit(100).all()
        v = _avg(rows)
        if v is not None:
            return {"sugerido": v, "fuente": "producto", "n": len(rows)}

    return {"sugerido": 30.0, "fuente": "default", "n": 0}


class _PlantillaIn(_CRBase):
    nombre: str
    descripcion: Optional[str] = None
    lineas: list


@router.get("/plantillas", dependencies=[Depends(allow_all_staff)])
def listar_plantillas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Plantillas del usuario + plantillas globales (usuario_id NULL)."""
    rows = (
        db.query(models.PlantillaCotizacion)
        .filter(
            (models.PlantillaCotizacion.usuario_id == current_user.id)
            | (models.PlantillaCotizacion.usuario_id.is_(None))
        )
        .order_by(desc(models.PlantillaCotizacion.creado_en))
        .all()
    )
    out = []
    for p in rows:
        try:
            lineas = _cr_json.loads(p.lineas or "[]")
        except Exception:
            lineas = []
        out.append({
            "id": p.id,
            "nombre": p.nombre,
            "descripcion": p.descripcion,
            "lineas": lineas,
            "n_lineas": len(lineas),
            "creado_en": p.creado_en.isoformat() if p.creado_en else None,
            "es_global": p.usuario_id is None,
            "es_propia": p.usuario_id == current_user.id,
        })
    return out


@router.post("/plantillas", dependencies=[Depends(allow_all_staff)])
def crear_plantilla(
    payload: _PlantillaIn,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not payload.nombre or not payload.nombre.strip():
        raise HTTPException(400, "nombre requerido")
    if not isinstance(payload.lineas, list) or not payload.lineas:
        raise HTTPException(400, "lineas debe ser una lista no vacía")

    nueva = models.PlantillaCotizacion(
        nombre=payload.nombre.strip()[:120],
        descripcion=(payload.descripcion or "").strip() or None,
        usuario_id=current_user.id,
        lineas=_cr_json.dumps(payload.lineas, ensure_ascii=False),
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return {"id": nueva.id, "nombre": nueva.nombre, "n_lineas": len(payload.lineas)}


@router.delete("/plantillas/{id}", dependencies=[Depends(allow_all_staff)])
def eliminar_plantilla(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    p = db.query(models.PlantillaCotizacion).filter(models.PlantillaCotizacion.id == id).first()
    if not p:
        raise HTTPException(404, "Plantilla no encontrada")
    # Solo el dueño o admin puede borrar
    rol = _normalize_role(getattr(current_user, "rol", None))
    is_admin = rol in (models.RolUsuario.ADMINISTRADOR, models.RolUsuario.SUPERADMIN)
    if not is_admin and p.usuario_id != current_user.id:
        raise HTTPException(403, "Solo puedes borrar tus propias plantillas")
    db.delete(p)
    db.commit()
    return {"ok": True, "id": id}


@router.get("/productos-relacionados/{producto_id}", dependencies=[Depends(allow_all_staff)])
def productos_relacionados(
    producto_id: int,
    limit: int = 5,
    db: Session = Depends(get_db),
):
    """Co-ocurrencia: productos que aparecen en las MISMAS cotizaciones que este.

    Devuelve top N por frecuencia de aparición conjunta.
    """
    # select() explícito (SQLAlchemy 2.x exige select() en lugar de Subquery
    # cuando se pasa a .in_(); de lo contrario emite SAWarning de coerción).
    ordenes_pivot = (
        select(models.DetalleOrden.orden_id)
        .where(models.DetalleOrden.producto_id == producto_id)
    )
    rows = (
        db.query(
            models.Producto.id,
            models.Producto.sku_comercial,
            models.Producto.sku,
            models.Producto.nombre,
            models.Producto.marca,
            models.Producto.stock_actual,
            _cr_func.count(models.DetalleOrden.id).label("cooccurrences"),
        )
        .join(models.DetalleOrden, models.DetalleOrden.producto_id == models.Producto.id)
        .filter(
            models.DetalleOrden.orden_id.in_(ordenes_pivot),
            models.Producto.id != producto_id,
        )
        .group_by(models.Producto.id)
        .order_by(desc(_cr_func.count(models.DetalleOrden.id)))
        .limit(limit)
        .all()
    )
    return [
        {
            "producto_id": r.id,
            "sku": r.sku_comercial or r.sku,
            "nombre": r.nombre,
            "marca": r.marca,
            "stock_actual": r.stock_actual,
            "co_apariciones": int(r.cooccurrences),
        }
        for r in rows
    ]


@router.get("/ultima-cotizacion-cliente/{cliente_id}", dependencies=[Depends(allow_all_staff)])
def ultima_cotizacion_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Para mostrar widget "última cotización de este cliente"."""

    q = db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id == cliente_id)
    if is_owner_scoped(current_user, "read", "cotizacion"):
        q = q.filter(models.OrdenVenta.vendedor_id == current_user.id)
    o = q.order_by(desc(models.OrdenVenta.fecha_creacion)).first()
    if not o:
        return None
    fc = o.fecha_creacion.replace(tzinfo=None) if o.fecha_creacion and o.fecha_creacion.tzinfo else o.fecha_creacion
    dias = (datetime.utcnow() - fc).days if fc else None
    return {
        "id": o.id,
        "folio": o.folio,
        "fecha": o.fecha_creacion.isoformat() if o.fecha_creacion else None,
        "dias_atras": dias,
        "total": float(o.total or 0),
        "moneda": o.moneda,
        "estatus": o.estatus.value if hasattr(o.estatus, "value") else str(o.estatus),
    }


@router.get("/sinonimos", dependencies=[Depends(allow_all_staff)])
def sinonimos_industriales():
    """Diccionario para búsqueda semántica en el cotizador."""
    p = _P(__file__).resolve().parent.parent / "data" / "sinonimos.json"
    if not p.exists():
        return {"entradas": []}
    return _cr_json.loads(p.read_text(encoding="utf-8"))
