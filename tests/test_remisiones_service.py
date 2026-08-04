from decimal import Decimal
import pytest
from fastapi import HTTPException
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
    service.cancelar(db, r1.id, "error de captura", admin)
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
    cot = service.crear_cotizacion_desde(db, rem.id, admin)
    assert cot.estatus == models.EstatusOrden.COTIZACION
    assert cot.remision_origen_id == rem.id
    assert all((l.precio_unitario or 0) == 0 for l in cot.detalles)
    db.refresh(rem)
    assert rem.estado == models.EstadoRemision.EMITIDA  # la remisión no se tocó
