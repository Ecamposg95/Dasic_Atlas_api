"""Service del dominio remisiones: borradores, emisión con pendientes/
sobre-entrega/stock híbrido, recepción, cancelación con reversa,
eliminación y conversión remisión→cotización.

Arma líneas/snapshot siguiendo el patrón del router viejo
(`app/routers/remisiones.py:161-244`). El patrón lock→refresh→re-check de
`emitir`/`cancelar` sigue el mismo criterio que
`app/routers/ventas.py::convertir_cotizacion` (líneas ~1360-1372): el lock
se adquiere ANTES de leer/verificar el estado mutable, y el estado se
re-verifica (`db.refresh` + comparación) DESPUÉS del lock — nunca al revés,
o una segunda transacción que entra mientras la primera espera el lock
puede pasar la verificación con datos obsoletos (TOCTOU).
"""
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException

from app import models
from app.domains.remisiones import repository
from app.domains.remisiones.schemas import DetalleRemisionInput, RemisionCreate, RemisionUpdate
from app.models.enums import EstadoRemision, EstatusOrden, TipoMovimientoStock
from app.security.permissions import can, require
from app.services import config_service, folio_service, stock_service
from app.services.stock_service import cantidad_entera_para_stock


def _get_or_404(db, remision_id: int) -> models.Remision:
    rem = db.query(models.Remision).filter(models.Remision.id == remision_id).first()
    if not rem:
        raise HTTPException(404, "Remisión no encontrada")
    return rem


def _armar_linea(item: DetalleRemisionInput, det_orden: dict) -> models.DetalleRemision:
    """Arma un DetalleRemision a partir del payload, resolviendo snapshot
    (descripción/sku/unidad/precio) desde DetalleOrden cuando la línea viene
    de una orden, o directamente del payload en modo libre/ad-hoc."""
    if item.cantidad <= 0:
        raise HTTPException(400, "La cantidad de cada línea debe ser > 0")
    if item.detalle_orden_id is not None:
        base = det_orden.get(item.detalle_orden_id)
        if base is None:
            raise HTTPException(400, f"La línea {item.detalle_orden_id} no pertenece a la orden")
        prod = base.producto
        descripcion = base.descripcion_libre or (prod.nombre if prod else None) or "Producto"
        sku = base.sku_libre or (prod.sku_comercial if prod else None) or (prod.sku if prod else None)
        clave_unidad = base.clave_unidad_sat or (prod.clave_unidad_sat if prod else None)
        precio = base.precio_unitario or Decimal("0")
        unidad = base.unidad or (prod.unidad if prod else None)
    else:
        descripcion = item.descripcion
        sku = item.sku
        clave_unidad = item.clave_unidad_sat
        precio = item.precio_unitario or Decimal("0")
        unidad = item.unidad

    cantidad = Decimal(str(item.cantidad))
    subtotal = (precio * cantidad).quantize(Decimal("0.01"))
    return models.DetalleRemision(
        detalle_orden_id=item.detalle_orden_id,
        descripcion=descripcion,
        sku=sku,
        cantidad=cantidad,
        unidad=unidad,
        observaciones_linea=item.observaciones_linea,
        clave_unidad_sat=clave_unidad,
        precio_unitario=precio,
        subtotal=subtotal,
    )


def crear_borrador(db, payload: RemisionCreate, user) -> models.Remision:
    if not payload.detalles:
        raise HTTPException(400, "Debe incluir al menos una línea")

    orden = None
    det_orden: dict = {}
    cliente_id = None
    moneda = payload.moneda or "MXN"

    if payload.orden_venta_id:
        orden = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == payload.orden_venta_id).first()
        if not orden:
            raise HTTPException(404, "Orden de venta no encontrada")
        if orden.estatus == EstatusOrden.COTIZACION:
            raise HTTPException(400, "La orden todavía es cotización — convierte a venta antes de remisionar")
        if orden.estatus == EstatusOrden.CANCELADA:
            raise HTTPException(400, "La orden está cancelada")
        det_orden = {d.id: d for d in orden.detalles}
        moneda = orden.moneda
    else:
        cliente = db.query(models.Cliente).filter(models.Cliente.id == payload.cliente_id).first()
        if not cliente:
            raise HTTPException(404, "Cliente no encontrado")
        cliente_id = cliente.id

    rem = models.Remision(
        orden_venta_id=orden.id if orden else None,
        cliente_id=cliente_id,
        moneda=moneda,
        mostrar_precios=payload.mostrar_precios,
        transportista=payload.transportista,
        observaciones=payload.observaciones,
        creado_por_id=user.id,
        estado=EstadoRemision.BORRADOR,
    )
    db.add(rem)
    db.flush()
    for item in payload.detalles:
        linea = _armar_linea(item, det_orden)
        linea.remision_id = rem.id
        db.add(linea)
    db.commit()
    db.refresh(rem)
    return rem


def actualizar_borrador(db, remision_id: int, payload: RemisionUpdate, user) -> models.Remision:
    rem = _get_or_404(db, remision_id)
    if rem.estado != EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede editarse")

    if payload.transportista is not None:
        rem.transportista = payload.transportista
    if payload.observaciones is not None:
        rem.observaciones = payload.observaciones
    if payload.mostrar_precios is not None:
        rem.mostrar_precios = payload.mostrar_precios
    # Si la remisión está ligada a una orden, la moneda la manda la orden —
    # ignoramos cualquier cambio de moneda que traiga el payload.
    if payload.moneda is not None and not rem.orden_venta_id:
        rem.moneda = payload.moneda

    if payload.detalles is not None:
        if not payload.detalles:
            raise HTTPException(400, "Debe incluir al menos una línea")
        det_orden = {d.id: d for d in rem.orden_venta.detalles} if rem.orden_venta_id else {}
        rem.detalles.clear()  # cascade delete-orphan: borra las líneas viejas
        db.flush()
        for item in payload.detalles:
            linea = _armar_linea(item, det_orden)
            linea.remision_id = rem.id
            db.add(linea)

    db.commit()
    db.refresh(rem)
    return rem


def eliminar_borrador(db, remision_id: int, user) -> None:
    rem = _get_or_404(db, remision_id)
    if rem.estado != EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede eliminarse")
    db.delete(rem)
    db.commit()


def emitir(db, remision_id, user, locker=folio_service.pg_locker):
    rem = _get_or_404(db, remision_id)
    # Lock ANTES de refrescar/verificar estado: serializa la doble-emisión de
    # la MISMA remisión (doble-submit) y, si aplica, emisiones concurrentes
    # de la MISMA orden (el cálculo de excesos lee acumulados de todas las
    # remisiones de la orden). Orden fijo remisión→orden SIEMPRE, para no
    # arriesgar deadlock si algún otro flujo tomara esos locks al revés.
    locker(db, f"remision:{rem.id}")
    if rem.orden_venta_id:
        locker(db, f"remision-emitir:orden:{rem.orden_venta_id}")
    # Re-check tras el lock: otra transacción pudo emitir/cancelar esta
    # remisión mientras esperábamos el lock.
    db.refresh(rem)
    if rem.estado != models.EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede emitirse")
    if not rem.detalles:
        raise HTTPException(400, "La remisión no tiene líneas")
    if rem.orden_venta_id:
        pend = repository.pendientes_por_detalle(db, rem.orden_venta)
        cotizado_por_detalle = {d.id: Decimal(str(d.cantidad)) for d in rem.orden_venta.detalles}
        excesos = [
            {"detalle_orden_id": d.detalle_orden_id,
             "cotizado": str(cotizado_por_detalle.get(d.detalle_orden_id, Decimal("0"))),
             "pendiente": str(pend.get(d.detalle_orden_id, Decimal("0"))),
             "solicitado": str(d.cantidad)}
            for d in rem.detalles
            if d.detalle_orden_id is not None
            and Decimal(str(d.cantidad)) > pend.get(d.detalle_orden_id, Decimal("0"))
        ]
        if excesos:
            if not can(user, "sobreentrega", "remision"):
                raise HTTPException(400, {
                    "mensaje": "Cantidad mayor al pendiente y sin permiso de sobre-entrega",
                    "excesos": excesos,
                })
            rem.sobre_entrega_autorizada_por_id = user.id
    rem.folio = folio_service.generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio, locker=locker)
    rem.estado = models.EstadoRemision.EMITIDA
    rem.emitida_at = datetime.utcnow()
    rem.emitida_por_id = user.id
    if config_service.stock_evento_descuento(db) == "remision":
        movimientos = _descontar_stock(db, rem, user)
        # Solo marcamos stock_descontado si hubo AL MENOS un movimiento real
        # (líneas de servicio/ad-hoc sin producto de catálogo no cuentan) —
        # si no, `cancelar` intentaría revertir movimientos que nunca existieron.
        rem.stock_descontado = movimientos > 0
    db.commit()
    db.refresh(rem)
    return rem


def _descontar_stock(db, rem, user) -> int:
    movimientos = 0
    for det in rem.detalles:
        base = det.detalle_orden if det.detalle_orden_id else None
        producto = base.producto if base is not None else None
        if producto is None or getattr(producto, "es_servicio", False):
            continue
        cantidad = cantidad_entera_para_stock(det.cantidad, producto.sku)
        try:
            stock_service.aplicar_movimiento(
                db, producto=producto, tipo=TipoMovimientoStock.SALIDA.value,
                cantidad=-cantidad, referencia_tipo="remision",
                referencia_id=rem.id, motivo=f"Salida por remisión {rem.folio}", usuario=user)
        except ValueError as exc:
            # aplicar_movimiento levanta ValueError puro (no HTTPException) si
            # el stock quedaría negativo — lo traducimos a 400 aquí, el único
            # lugar con contexto HTTP.
            raise HTTPException(400, str(exc))
        movimientos += 1
    return movimientos


def registrar_recepcion(db, remision_id: int, recibido_por: str, user) -> models.Remision:
    rem = _get_or_404(db, remision_id)
    if rem.estado != EstadoRemision.EMITIDA:
        raise HTTPException(409, "Solo una remisión emitida puede recibirse")
    if not (recibido_por or "").strip():
        raise HTTPException(400, "El nombre de quien recibe es obligatorio")
    rem.recibido_por = recibido_por.strip()
    rem.recibido_at = datetime.utcnow()
    rem.estado = EstadoRemision.RECIBIDA
    db.commit()
    db.refresh(rem)
    return rem


def cancelar(db, remision_id, motivo, user, *, locker=folio_service.pg_locker):
    require(user, "cancel", "remision")
    rem = _get_or_404(db, remision_id)
    # Mismo patrón que `emitir`: lock por remisión ANTES de refrescar/
    # verificar estado, para que una segunda cancelación concurrente no pase
    # la verificación con el objeto todavía en memoria como EMITIDA/RECIBIDA.
    locker(db, f"remision:{rem.id}")
    db.refresh(rem)
    if rem.estado not in (models.EstadoRemision.EMITIDA, models.EstadoRemision.RECIBIDA):
        raise HTTPException(409, "Solo una remisión emitida o recibida puede cancelarse")
    if not (motivo or "").strip():
        raise HTTPException(400, "El motivo de cancelación es obligatorio")
    if rem.stock_descontado:
        for det in rem.detalles:
            base = det.detalle_orden if det.detalle_orden_id else None
            producto = base.producto if base is not None else None
            if producto is None or getattr(producto, "es_servicio", False):
                continue
            # Mismo helper que `_descontar_stock` (Task 4): nunca truncar en
            # silencio con int(Decimal(...)) — si la cantidad no es entera,
            # 400 explícito en vez de reversar mal.
            cantidad = cantidad_entera_para_stock(det.cantidad, producto.sku)
            try:
                stock_service.aplicar_movimiento(
                    db, producto=producto, tipo=TipoMovimientoStock.ENTRADA.value,
                    cantidad=cantidad, referencia_tipo="remision",
                    referencia_id=rem.id, motivo=f"Reversa por cancelación de {rem.folio}", usuario=user)
            except ValueError as exc:
                raise HTTPException(400, str(exc))
    rem.estado = models.EstadoRemision.CANCELADA
    rem.cancelada_at = datetime.utcnow()
    rem.cancelada_por_id = user.id
    rem.motivo_cancelacion = motivo.strip()
    db.commit(); db.refresh(rem)
    return rem


def crear_cotizacion_desde(db, remision_id: int, user, *, locker=folio_service.pg_locker) -> models.OrdenVenta:
    require(user, "convertir", "remision")
    rem = _get_or_404(db, remision_id)
    if rem.estado not in (EstadoRemision.EMITIDA, EstadoRemision.RECIBIDA):
        raise HTTPException(409, "Solo una remisión emitida o recibida puede convertirse a cotización")
    cliente_id = rem.orden_venta.cliente_id if rem.orden_venta else rem.cliente_id
    if not cliente_id:
        raise HTTPException(400, "La remisión no tiene cliente asociado")

    # Repetible a propósito: convertir la misma remisión más de una vez
    # produce varias cotizaciones (ledger), no un error — decisión explícita
    # del sprint, no un descuido.
    folio = folio_service.generar_folio(
        db, prefijo="C", modelo=models.OrdenVenta, campo=models.OrdenVenta.folio, padding=3,
        locker=locker)

    cot = models.OrdenVenta(
        folio=folio,
        cliente_id=cliente_id,
        vendedor_id=user.id,
        estatus=EstatusOrden.COTIZACION,
        moneda=rem.moneda or "MXN",
        total=0,
        remision_origen_id=rem.id,
    )
    db.add(cot)
    db.flush()
    for det in rem.detalles:
        base = det.detalle_orden if det.detalle_orden_id else None
        producto_id = base.producto_id if base is not None else None
        tipo_linea = "producto_catalogo" if producto_id else "producto_fantasma"
        db.add(models.DetalleOrden(
            orden_id=cot.id,
            producto_id=producto_id,
            sku_libre=det.sku,
            descripcion_libre=det.descripcion,
            cantidad=det.cantidad,
            unidad=det.unidad,
            clave_unidad_sat=det.clave_unidad_sat,
            observaciones_linea=det.observaciones_linea,
            precio_unitario=Decimal("0"),
            subtotal=Decimal("0"),
            tipo_linea=tipo_linea,
        ))
    db.commit()
    db.refresh(cot)
    return cot
