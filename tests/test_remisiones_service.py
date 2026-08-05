from decimal import Decimal
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from app import models
from app.domains.remisiones import service, repository
from app.domains.remisiones.schemas import RemisionCreate, RemisionUpdate, DetalleRemisionInput


def _noop_locker(db, key):
    pass


@pytest.fixture()
def orden(db, usuario):
    u = usuario("administrador")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli); db.flush()
    o = models.OrdenVenta(folio="V-26080001", cliente_id=cli.id, vendedor_id=u.id,
                          estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add(o); db.flush()
    d = models.DetalleOrden(orden_id=o.id, descripcion_libre="Cable",
                            cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                            subtotal=Decimal("50"), unidad="MTS")
    db.add(d); db.commit()
    return o, d, u


def _borrador(db, o, d, u, cantidad="4"):
    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal(cantidad))])
    return service.crear_borrador(db, payload, u)


def test_borrador_no_tiene_folio_y_emitir_lo_asigna(db, orden):
    o, d, u = orden
    rem = _borrador(db, o, d, u)
    assert rem.estado == models.EstadoRemision.BORRADOR and rem.folio is None
    rem = service.emitir(db, rem.id, u, locker=_noop_locker)
    assert rem.estado == models.EstadoRemision.EMITIDA
    assert rem.folio and rem.folio.startswith("R-")


def test_emitir_bloquea_sobre_entrega_sin_rol(db, orden, usuario):
    o, d, admin = orden
    vend = usuario("ventas", email="v@test.local")
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    r2 = _borrador(db, o, d, vend, "5")   # pendiente = 2, pide 5
    with pytest.raises(HTTPException) as exc:
        service.emitir(db, r2.id, vend, locker=_noop_locker)
    assert exc.value.status_code == 400
    assert "pendiente" in str(exc.value.detail).lower()


def test_emitir_sobre_entrega_con_admin_registra_autorizador(db, orden):
    o, d, admin = orden
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    r2 = _borrador(db, o, d, admin, "5")
    rem = service.emitir(db, r2.id, admin, locker=_noop_locker)
    assert rem.sobre_entrega_autorizada_por_id == admin.id


def test_cancelar_excluye_del_acumulado(db, orden):
    o, d, admin = orden
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    service.cancelar(db, r1.id, "error de captura", admin, locker=_noop_locker)
    assert repository.entregado_por_detalle(db, o.id) == {}


def test_emitida_no_editable_y_borrador_no_emitible_dos_veces(db, orden):
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    with pytest.raises(HTTPException) as exc:
        service.emitir(db, rem.id, admin, locker=_noop_locker)
    assert exc.value.status_code == 409


def test_crear_cotizacion_desde_remision(db, orden):
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    cot = service.crear_cotizacion_desde(db, rem.id, admin, locker=_noop_locker)
    assert cot.estatus == models.EstatusOrden.COTIZACION
    assert cot.remision_origen_id == rem.id
    assert all((l.precio_unitario or 0) == 0 for l in cot.detalles)
    db.refresh(rem)
    assert rem.estado == models.EstadoRemision.EMITIDA  # la remisión no se tocó


def test_crear_cotizacion_desde_copia_contacto_de_la_orden(db, orden):
    # M-2: la cotización derivada de una remisión-desde-orden hereda el
    # contacto_id de la orden origen (antes quedaba siempre None).
    o, d, admin = orden
    contacto = models.Contacto(cliente_id=o.cliente_id, nombre="Juan Pérez")
    db.add(contacto)
    db.flush()
    o.contacto_id = contacto.id
    db.commit()

    rem = _borrador(db, o, d, admin)
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    cot = service.crear_cotizacion_desde(db, rem.id, admin, locker=_noop_locker)
    assert cot.contacto_id == contacto.id


# ---------------------------------------------------------------------------
# Revisión adversarial: fixes de lock/re-check + validaciones nuevas.
# ---------------------------------------------------------------------------

def test_emitir_toctou_re_check_tras_lock_da_409(db, orden):
    """CRITICAL 1 (reproducido y corregido): el lock debe adquirirse ANTES
    de refrescar/verificar el estado, y el estado debe re-verificarse
    DESPUÉS del lock. Simulamos "otra transacción que ganó la carrera
    mientras esta esperaba el lock" haciendo que el propio `locker` mute el
    estado por SQL crudo (mismo efecto que tendría un advisory lock real de
    Postgres serializando dos transacciones). Con el orden viejo (check
    antes del lock) esto NO se habría detectado — el chequeo usaba el
    objeto en memoria, todavía BORRADOR. Con el orden nuevo (lock → refresh
    → check), sí.

    El locking/serialización real entre conexiones concurrentes de Postgres
    no se ejerce aquí (SQLite in-memory de un solo hilo) — eso queda para
    QA #12 sobre Postgres real.
    """
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)

    def _locker_que_emite_a_medio_camino(db, key):
        db.execute(text("UPDATE remisiones SET estado = 'EMITIDA' WHERE id = :id"), {"id": rem.id})
        db.commit()

    with pytest.raises(HTTPException) as exc:
        service.emitir(db, rem.id, admin, locker=_locker_que_emite_a_medio_camino)
    assert exc.value.status_code == 409


def test_cancelar_toctou_re_check_tras_lock_da_409(db, orden):
    """CRITICAL 2 (reproducido y corregido): mismo patrón que arriba, para
    `cancelar` — el lock por remisión debe preceder al refresh/re-check del
    estado, o una segunda cancelación concurrente doble-reversa el stock."""
    o, d, admin = orden
    rem = _borrador(db, o, d, admin, "8")
    service.emitir(db, rem.id, admin, locker=_noop_locker)

    def _locker_que_cancela_a_medio_camino(db, key):
        db.execute(text("UPDATE remisiones SET estado = 'CANCELADA' WHERE id = :id"), {"id": rem.id})
        db.commit()

    with pytest.raises(HTTPException) as exc:
        service.cancelar(db, rem.id, "motivo", admin, locker=_locker_que_cancela_a_medio_camino)
    assert exc.value.status_code == 409


def test_emitir_stock_negativo_da_400(db, orden):
    """IMPORTANT 3: aplicar_movimiento levanta ValueError puro cuando el
    stock quedaría negativo — el service debe traducirlo a HTTPException 400,
    no dejarlo propagar como error 500."""
    o, d, admin = orden
    prod = models.Producto(sku="SKU-NEG", nombre="Producto con poco stock",
                            stock_actual=2, es_servicio=False)
    db.add(prod); db.flush()
    d.producto_id = prod.id
    db.add(models.PlatformConfig(clave="stock_evento_descuento", valor="remision"))
    db.commit()

    rem = _borrador(db, o, d, admin, "4")  # pendiente=10 (no hay sobre-entrega), pero stock=2
    with pytest.raises(HTTPException) as exc:
        service.emitir(db, rem.id, admin, locker=_noop_locker)
    assert exc.value.status_code == 400


def test_remision_create_modo_libre_requiere_moneda():
    """Minor (d): en modo libre (cliente_id) la moneda es obligatoria — no
    hay orden de la que heredarla."""
    with pytest.raises(ValidationError):
        RemisionCreate(cliente_id=1, detalles=[
            DetalleRemisionInput(descripcion="Ad-hoc", cantidad=Decimal("1"))])


def test_crear_cotizacion_desde_copia_snapshot_completo(db, orden):
    """Minor (c) + fix round 2 (B): la conversión copia
    clave_unidad_sat/observaciones_linea siempre. La mercancía de una
    remisión YA se entregó, así que NINGUNA línea de producto (con o sin
    producto_id en el origen) debe re-reservar/re-descontar stock al
    convertir — siempre queda `tipo_linea='producto_fantasma'` y SIN
    `producto_id`, aunque haya nacido de un DetalleOrden con producto de
    catálogo."""
    o, d, admin = orden
    prod = models.Producto(sku="SKU-CAT", nombre="Producto catálogo",
                            stock_actual=50, es_servicio=False, clave_unidad_sat="H87")
    db.add(prod); db.flush()
    d.producto_id = prod.id
    d.clave_unidad_sat = "H87"
    db.commit()

    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal("4"), observaciones_linea="Nota de línea")])
    rem = service.crear_borrador(db, payload, admin)
    rem = service.emitir(db, rem.id, admin, locker=_noop_locker)
    cot = service.crear_cotizacion_desde(db, rem.id, admin, locker=_noop_locker)

    linea = cot.detalles[0]
    assert linea.producto_id is None
    assert linea.tipo_linea == "producto_fantasma"
    assert linea.clave_unidad_sat == "H87"
    assert linea.observaciones_linea == "Nota de línea"

    # Línea ad-hoc (sin producto de catálogo) desde otra remisión libre.
    cli = models.Cliente(nombre_empresa="Libre SA")
    db.add(cli); db.commit()
    payload_libre = RemisionCreate(cliente_id=cli.id, moneda="MXN", detalles=[
        DetalleRemisionInput(descripcion="Servicio ad-hoc", cantidad=Decimal("1"))])
    rem_libre = service.crear_borrador(db, payload_libre, admin)
    rem_libre = service.emitir(db, rem_libre.id, admin, locker=_noop_locker)
    cot_libre = service.crear_cotizacion_desde(db, rem_libre.id, admin, locker=_noop_locker)
    linea_fantasma = cot_libre.detalles[0]
    assert linea_fantasma.producto_id is None
    assert linea_fantasma.tipo_linea == "producto_fantasma"


def test_armar_linea_respeta_unidad_del_payload_en_linea_de_orden(db, orden):
    """Remate: el selector de unidad de la UI persiste también en partidas
    ligadas a orden — si el payload trae `unidad` no-vacía, se usa esa; si
    viene None/vacía, snapshot desde DetalleOrden (comportamiento previo)."""
    o, d, admin = orden  # d.unidad == "MTS"
    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal("2"), unidad="KG")])
    rem = service.crear_borrador(db, payload, admin)
    assert rem.detalles[0].unidad == "KG"

    payload_sin = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal("2"), unidad="   ")])
    rem_sin = service.crear_borrador(db, payload_sin, admin)
    assert rem_sin.detalles[0].unidad == "MTS"  # fallback al snapshot de la orden


def test_crear_cotizacion_desde_preserva_servicio(db, orden):
    """Fix round 2 (B): una línea cuyo DetalleOrden origen es un servicio
    de catálogo (servicio_id no nulo, tipo_linea='servicio_catalogo') SÍ
    conserva tipo_linea + servicio_id en la conversión — los servicios no
    mueven stock, así que no hay riesgo de re-reserva/re-descuento, y
    preservar la clasificación es lo que esperan auto_oc_service.py y
    reportes_servicio_docs.py."""
    o, d, admin = orden
    servicio = models.Servicio(codigo="SRV-1", nombre="Instalación", costo=Decimal("100"))
    db.add(servicio); db.flush()
    d.servicio_id = servicio.id
    d.tipo_linea = "servicio_catalogo"
    db.commit()

    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Instalación",
                             cantidad=Decimal("1"))])
    rem = service.crear_borrador(db, payload, admin)
    rem = service.emitir(db, rem.id, admin, locker=_noop_locker)
    cot = service.crear_cotizacion_desde(db, rem.id, admin, locker=_noop_locker)

    linea = cot.detalles[0]
    assert linea.producto_id is None
    assert linea.tipo_linea == "servicio_catalogo"
    assert linea.servicio_id == servicio.id


def test_registrar_recepcion_sobre_cancelada_da_409(db, orden):
    """Guard C: registrar_recepcion también re-verifica estado tras el
    lock — recibir una remisión que ya fue cancelada (por otra transacción,
    mientras esta esperaba el lock) debe dar 409, no pisar la cancelación."""
    o, d, admin = orden
    rem = _borrador(db, o, d, admin, "8")
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    service.cancelar(db, rem.id, "motivo", admin, locker=_noop_locker)

    with pytest.raises(HTTPException) as exc:
        service.registrar_recepcion(db, rem.id, "Juan Pérez", admin, locker=_noop_locker)
    assert exc.value.status_code == 409


def test_emitir_404_si_borrador_fue_eliminado_durante_el_lock(db, orden):
    """Fix A: si otra transacción borró la remisión mientras esta esperaba
    el lock, el refresh post-lock debe traducirse a 404, no a un 500 con la
    excepción interna de SQLAlchemy sin envolver."""
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)

    def _locker_que_elimina_a_medio_camino(db, key):
        # Borra primero las líneas: la eliminación real pasa por el ORM, que
        # cascadea `detalles` (Remision.detalles usa delete-orphan). En SQL
        # crudo hay que hacerlo a mano — Postgres SÍ valida la FK (SQLite no).
        db.execute(text("DELETE FROM detalles_remision WHERE remision_id = :id"), {"id": rem.id})
        db.execute(text("DELETE FROM remisiones WHERE id = :id"), {"id": rem.id})
        db.commit()

    with pytest.raises(HTTPException) as exc:
        service.emitir(db, rem.id, admin, locker=_locker_que_elimina_a_medio_camino)
    assert exc.value.status_code == 404


def test_eliminar_borrador_serializa_con_lock(db, orden):
    """Fix A: eliminar_borrador también toma el lock por remisión antes de
    refrescar/verificar — si otra transacción ya la eliminó mientras esta
    esperaba el lock, 404 en vez de un delete duplicado silencioso."""
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)

    def _locker_que_elimina_a_medio_camino(db, key):
        # Borra primero las líneas: la eliminación real pasa por el ORM, que
        # cascadea `detalles` (Remision.detalles usa delete-orphan). En SQL
        # crudo hay que hacerlo a mano — Postgres SÍ valida la FK (SQLite no).
        db.execute(text("DELETE FROM detalles_remision WHERE remision_id = :id"), {"id": rem.id})
        db.execute(text("DELETE FROM remisiones WHERE id = :id"), {"id": rem.id})
        db.commit()

    with pytest.raises(HTTPException) as exc:
        service.eliminar_borrador(db, rem.id, admin, locker=_locker_que_elimina_a_medio_camino)
    assert exc.value.status_code == 404


def test_eliminar_borrador_happy_path(db, orden):
    """Happy path (no cubierto hasta ahora — solo había test de la ruta de
    carrera): eliminar_borrador borra la remisión y sus líneas (cascade
    delete-orphan), y una segunda eliminación sobre el mismo id da 404 (la
    fila ya no existe, sin necesidad de simular ninguna carrera)."""
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)
    rem_id = rem.id
    detalle_ids = [det.id for det in rem.detalles]
    assert detalle_ids

    service.eliminar_borrador(db, rem_id, admin, locker=_noop_locker)

    assert db.query(models.Remision).filter(models.Remision.id == rem_id).first() is None
    assert db.query(models.DetalleRemision).filter(
        models.DetalleRemision.id.in_(detalle_ids)).count() == 0

    with pytest.raises(HTTPException) as exc:
        service.eliminar_borrador(db, rem_id, admin, locker=_noop_locker)
    assert exc.value.status_code == 404


def test_lock_antes_de_refresh_spy(db, orden):
    """Cobertura D: prueba de orden de llamadas (spy) — actualizar_borrador,
    emitir, cancelar y registrar_recepcion deben invocar el `locker` ANTES
    de `db.refresh()`, no al revés (ese es exactamente el defecto TOCTOU de
    los dos criticals del round 1, y el mismo patrón que le faltaba a
    actualizar_borrador hasta el round 3). Envolvemos `db.refresh` para
    registrar cada llamada en una lista compartida de eventos junto con las
    llamadas al locker, y verificamos que el primer "lock" siempre precede
    al primer "refresh".

    Nota: esto prueba el ORDEN de las llamadas dentro del código, no la
    serialización real entre conexiones concurrentes de Postgres — SQLite
    en memoria (un solo hilo/conexión aquí) no puede reproducir la
    interleaving real de READ COMMITTED entre transacciones. Esa parte
    quedó documentada como pendiente para QA #12 sobre Postgres real (ver
    también los tests `*_toctou_*` del round 1, que simulan la carrera
    haciendo que el propio locker mute el estado por SQL crudo).
    """
    o, d, admin = orden
    eventos = []

    orig_refresh = db.refresh

    def spy_refresh(*a, **kw):
        eventos.append("refresh")
        return orig_refresh(*a, **kw)

    db.refresh = spy_refresh

    def spy_locker(db_, key):
        eventos.append("lock")

    try:
        rem = _borrador(db, o, d, admin)

        eventos.clear()
        service.actualizar_borrador(db, rem.id, RemisionUpdate(transportista="Fedex"),
                                     admin, locker=spy_locker)
        assert eventos.index("lock") < eventos.index("refresh")

        eventos.clear()
        service.emitir(db, rem.id, admin, locker=spy_locker)
        assert eventos.index("lock") < eventos.index("refresh")

        eventos.clear()
        service.registrar_recepcion(db, rem.id, "Juan", admin, locker=spy_locker)
        assert eventos.index("lock") < eventos.index("refresh")

        eventos.clear()
        service.cancelar(db, rem.id, "motivo", admin, locker=spy_locker)
        assert eventos.index("lock") < eventos.index("refresh")
    finally:
        db.refresh = orig_refresh


# ---------------------------------------------------------------------------
# Cobertura de stock (spec §8): con stock_evento_descuento='remision', emitir
# una remisión desde orden con producto de catálogo descuenta stock_actual y
# la reversa por cancelación lo restaura.
# ---------------------------------------------------------------------------

def test_emitir_con_stock_evento_remision_descuenta_stock(db, orden):
    o, d, admin = orden
    prod = models.Producto(sku="SKU-STK", nombre="Producto con stock",
                            stock_actual=20, es_servicio=False)
    db.add(prod); db.flush()
    d.producto_id = prod.id
    db.add(models.PlatformConfig(clave="stock_evento_descuento", valor="remision"))
    db.commit()

    rem = _borrador(db, o, d, admin, "4")
    rem = service.emitir(db, rem.id, admin, locker=_noop_locker)

    assert rem.stock_descontado is True
    db.refresh(prod)
    assert prod.stock_actual == 16  # 20 - 4

    mov = (
        db.query(models.MovimientoStock)
        .filter(models.MovimientoStock.referencia_tipo == "remision",
                models.MovimientoStock.referencia_id == rem.id)
        .one()
    )
    assert mov.tipo == models.TipoMovimientoStock.SALIDA.value
    assert mov.cantidad == -4
    assert mov.producto_id == prod.id


def test_cancelar_remision_con_stock_descontado_revierte_stock(db, orden):
    o, d, admin = orden
    prod = models.Producto(sku="SKU-STK2", nombre="Producto con stock",
                            stock_actual=20, es_servicio=False)
    db.add(prod); db.flush()
    d.producto_id = prod.id
    db.add(models.PlatformConfig(clave="stock_evento_descuento", valor="remision"))
    db.commit()

    rem = _borrador(db, o, d, admin, "4")
    rem = service.emitir(db, rem.id, admin, locker=_noop_locker)
    db.refresh(prod)
    assert prod.stock_actual == 16

    rem = service.cancelar(db, rem.id, "motivo de cancelación", admin, locker=_noop_locker)
    assert rem.estado == models.EstadoRemision.CANCELADA

    db.refresh(prod)
    assert prod.stock_actual == 20  # se restauró

    mov_entrada = (
        db.query(models.MovimientoStock)
        .filter(models.MovimientoStock.referencia_tipo == "remision",
                models.MovimientoStock.referencia_id == rem.id,
                models.MovimientoStock.tipo == models.TipoMovimientoStock.ENTRADA.value)
        .one()
    )
    assert mov_entrada.cantidad == 4
    assert mov_entrada.producto_id == prod.id
