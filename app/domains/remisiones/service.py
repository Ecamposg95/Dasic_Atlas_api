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
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.orm.exc import ObjectDeletedError

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


def _refresh_or_404(db, rem: models.Remision) -> None:
    """Re-lee `rem` tras adquirir el lock — SIEMPRE la primera cosa que se
    hace con `rem` después de llamar a `locker()`, antes de tocar cualquier
    otro atributo. Si otra transacción borró la fila mientras esperábamos
    el lock (carrera con `eliminar_borrador`), la fila ya no existe — 404
    explícito en vez de dejar que SQLAlchemy propague su excepción interna.

    Verificado empíricamente contra sqlalchemy==2.0.51 (la versión de este
    repo), dos escenarios reales para la misma condición de fondo ("la fila
    ya no está"):

    1. Leer un atributo de `rem` (p.ej. `rem.orden_venta_id`) inmediatamente
       después de que el propio `locker` hizo un `commit()` ajeno expira
       `rem` por `expire_on_commit`; esa lectura implícita dispara
       `state._load_expired()` → `loading.load_scalar_attributes()`, que
       revienta con `ObjectDeletedError` (subclase de `InvalidRequestError`)
       si la fila ya no existe. Esto ya no debería ocurrir en el código
       actual — todas las funciones de esta familia refrescan ANTES de
       tocar cualquier atributo — pero se cubre por si acaso.
    2. Llamar a `db.refresh(rem)` explícitamente sobre una fila borrada:
       `Session.refresh()` (ver `sqlalchemy/orm/session.py`) instancia
       DIRECTAMENTE la clase base `InvalidRequestError("Could not refresh
       instance ...")` cuando el `SELECT` de recarga no devuelve filas — no
       existe una subclase más específica para este caso puntual en
       SQLAlchemy. Es el camino real que toman los tests de este archivo
       (`test_emitir_404_si_borrador_fue_eliminado_durante_el_lock` y
       `test_eliminar_borrador_serializa_con_lock`).

    NO atrapamos `InvalidRequestError` por `isinstance`/`except` genérico:
    eso también atraparía subclases reales de mal uso de la sesión (p.ej.
    `PendingRollbackError`, que indica una transacción que necesita
    rollback explícito — un bug de programación, no "la fila ya no está")
    y las mapearía a un 404 falso con la fila todavía viva. En vez de eso,
    comparamos el TIPO EXACTO: solo una instancia literal de
    `InvalidRequestError` (no una subclase) cae en la rama 2 de arriba.
    """
    try:
        db.refresh(rem)
    except ObjectDeletedError:
        raise HTTPException(404, "Remisión no encontrada (eliminada por otra operación)")
    except InvalidRequestError as exc:
        if type(exc) is not InvalidRequestError:
            raise
        raise HTTPException(404, "Remisión no encontrada (eliminada por otra operación)")


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


def actualizar_borrador(db, remision_id: int, payload: RemisionUpdate, user, *,
                         locker=folio_service.pg_locker) -> models.Remision:
    rem = _get_or_404(db, remision_id)
    # Misma familia que emitir/cancelar/registrar_recepcion/eliminar_borrador:
    # sin este lock, una edición concurrente podía colarse entre el refresh
    # y el commit de `emitir` (líneas nuevas nunca validadas contra
    # pendientes) o insertar líneas sobre una remisión recién borrada.
    locker(db, f"remision:{remision_id}")
    _refresh_or_404(db, rem)
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


def eliminar_borrador(db, remision_id: int, user, *, locker=folio_service.pg_locker) -> None:
    rem = _get_or_404(db, remision_id)
    # Misma familia que emitir/cancelar/registrar_recepcion: lock por
    # remisión ANTES de refrescar/verificar estado, para que dos
    # eliminaciones concurrentes (o una eliminación concurrente con
    # cualquier otra transición de estado) no pisen datos obsoletos.
    locker(db, f"remision:{remision_id}")
    _refresh_or_404(db, rem)
    if rem.estado != EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede eliminarse")
    db.delete(rem)
    db.commit()


def emitir(db, remision_id, user, locker=folio_service.pg_locker):
    rem = _get_or_404(db, remision_id)
    # Lock por remisión ANTES de tocar cualquier atributo de `rem` — usamos
    # el parámetro `remision_id` (no `rem.id`) para construir la llave, así
    # no leemos nada del objeto todavía. Refrescamos INMEDIATAMENTE después
    # del lock, antes de cualquier otro acceso: si el lock tuvo que esperar
    # a que otra transacción borrara/emitiera/canceló esta remisión, `rem`
    # queda expirado por el commit ajeno, y CUALQUIER acceso a un atributo
    # (incluido `rem.orden_venta_id`) dispararía una recarga implícita que
    # revienta con `ObjectDeletedError` si la fila ya no existe — por eso
    # el refresh (con su try/except) va primero, antes de leer nada más.
    locker(db, f"remision:{remision_id}")
    _refresh_or_404(db, rem)
    if rem.estado != models.EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede emitirse")
    if not rem.detalles:
        raise HTTPException(400, "La remisión no tiene líneas")
    if rem.orden_venta_id:
        # Lock por orden ANTES de leer acumulados (pendientes): serializa
        # emisiones concurrentes de remisiones distintas sobre la MISMA
        # orden. Orden fijo remisión→orden SIEMPRE (el de remisión ya se
        # tomó arriba), para no arriesgar deadlock con otro flujo que
        # tomara estos locks al revés.
        locker(db, f"remision-emitir:orden:{rem.orden_venta_id}")
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


def registrar_recepcion(db, remision_id: int, recibido_por: str, user, *,
                         locker=folio_service.pg_locker) -> models.Remision:
    rem = _get_or_404(db, remision_id)
    # Misma familia que emitir/cancelar/eliminar_borrador: sin este lock,
    # una recepción concurrente con una cancelación podía escribir RECIBIDA
    # encima de una CANCELADA (o viceversa).
    locker(db, f"remision:{remision_id}")
    _refresh_or_404(db, rem)
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
    locker(db, f"remision:{remision_id}")
    _refresh_or_404(db, rem)
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

    # M-2: si la remisión viene de una orden, hereda el contacto de esa
    # orden — de lo contrario la cotización derivada queda sin contacto
    # aunque la orden origen sí lo tuviera.
    contacto_id = rem.orden_venta.contacto_id if rem.orden_venta else None

    cot = models.OrdenVenta(
        folio=folio,
        cliente_id=cliente_id,
        contacto_id=contacto_id,
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
        es_servicio = base is not None and (
            base.servicio_id is not None or base.tipo_linea in ("servicio", "servicio_catalogo")
        )
        if es_servicio:
            # Los servicios no mueven stock — es seguro preservar su
            # clasificación (auto_oc_service.py:35 y
            # reportes_servicio_docs.py:147 ramifican sobre tipo_linea/
            # servicio_id, y ambos ya excluyen servicios de sus chequeos).
            tipo_linea = base.tipo_linea
            servicio_id = base.servicio_id
        else:
            # La mercancía de esta línea YA se entregó (la remisión está
            # emitida/recibida) — la cotización derivada NO debe re-reservar
            # ni re-descontar stock. Copiar producto_id haría que
            # ventas.py::convertir_cotizacion (~1375-1390) vuelva a validar
            # disponible y reservar contra esa línea, y corrompería
            # stock_service._neto_reservas_por_producto: una cotización
            # nacida de remisión nunca tiene movimientos RESERVA propios,
            # así que la fórmula le restaría una "reserva propia"
            # inexistente a las reservas de OTRAS cotizaciones sobre el
            # mismo producto. Por eso, para CUALQUIER línea de producto
            # (con o sin producto_id en el origen) y para las ad-hoc:
            # siempre producto_fantasma, sin producto_id — con el snapshot
            # completo de la línea (sku, descripción, cantidad, unidad,
            # clave SAT, observaciones) que ya copiamos abajo.
            tipo_linea = "producto_fantasma"
            servicio_id = None
        db.add(models.DetalleOrden(
            orden_id=cot.id,
            servicio_id=servicio_id,
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
