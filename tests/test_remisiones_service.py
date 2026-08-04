from decimal import Decimal
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from app import models
from app.domains.remisiones import service, repository
from app.domains.remisiones.schemas import RemisionCreate, DetalleRemisionInput


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
    """Minor (c): la conversión copia clave_unidad_sat/observaciones_linea, y
    si la línea viene de un DetalleOrden con producto de catálogo, copia
    producto_id + tipo_linea='producto_catalogo'; si no hay producto de
    catálogo (línea libre/ad-hoc), tipo_linea='producto_fantasma'."""
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

    linea_catalogo = cot.detalles[0]
    assert linea_catalogo.producto_id == prod.id
    assert linea_catalogo.tipo_linea == "producto_catalogo"
    assert linea_catalogo.clave_unidad_sat == "H87"
    assert linea_catalogo.observaciones_linea == "Nota de línea"

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
