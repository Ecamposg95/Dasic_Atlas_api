from decimal import Decimal
import pytest
from app import models
from app.domains.remisiones import repository


@pytest.fixture()
def orden_con_detalle(db, usuario):
    u = usuario("ventas")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli); db.flush()
    orden = models.OrdenVenta(folio="V-26080001", cliente_id=cli.id,
                              vendedor_id=u.id, estatus=models.EstatusOrden.PENDIENTE,
                              moneda="MXN", total=0)
    db.add(orden); db.flush()
    det = models.DetalleOrden(orden_id=orden.id, descripcion_libre="Cable",
                              cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                              subtotal=Decimal("50"))
    db.add(det); db.commit()
    return orden, det


def _remision(db, orden, det, cantidad, estado):
    rem = models.Remision(orden_venta_id=orden.id, estado=estado)
    db.add(rem); db.flush()
    db.add(models.DetalleRemision(remision_id=rem.id, detalle_orden_id=det.id,
                                  descripcion="Cable", cantidad=Decimal(cantidad)))
    db.commit()
    return rem


def test_acumulado_solo_cuenta_emitidas_y_recibidas(db, orden_con_detalle):
    orden, det = orden_con_detalle
    _remision(db, orden, det, "3", models.EstadoRemision.EMITIDA)
    _remision(db, orden, det, "2", models.EstadoRemision.RECIBIDA)
    _remision(db, orden, det, "4", models.EstadoRemision.BORRADOR)   # no cuenta
    _remision(db, orden, det, "5", models.EstadoRemision.CANCELADA)  # no cuenta
    acum = repository.entregado_por_detalle(db, orden.id)
    assert acum[det.id] == Decimal("5")


def test_pendientes(db, orden_con_detalle):
    orden, det = orden_con_detalle
    _remision(db, orden, det, "3", models.EstadoRemision.EMITIDA)
    pend = repository.pendientes_por_detalle(db, orden)
    assert pend[det.id] == Decimal("7")
