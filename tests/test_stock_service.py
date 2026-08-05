"""Inventario auditable: toda mutación de stock deja rastro.

La regla del repo es que `productos.stock_actual` **solo** cambia a través de
`stock_service.aplicar_movimiento`, y que cada cambio deja su fila en
`movimientos_stock` con el stock resultante. Es lo que hace que el kardex sea
reconstruible; si una ruta escribe el stock por su cuenta, el historial deja de
cuadrar y no hay forma de saber cuándo se torció.

Aquí se cubre el servicio: el rastro, el guard de negativo, qué tipos mueven
existencias y cuáles no, y el ciclo de reservas —que es lo que distingue
*stock físico* de *stock disponible para prometer*.
"""
from decimal import Decimal

import pytest

from app import models
from app.models.enums import EstatusOrden, TipoMovimientoStock
from app.services import stock_service


def _producto(db, *, sku="SKU-1", stock=100):
    p = models.Producto(sku=sku, nombre="Cable", stock_actual=stock, costo_compra=Decimal("10"))
    db.add(p)
    db.commit()
    return p


def _cotizacion(db, cliente=None, estatus=EstatusOrden.COTIZACION):
    if cliente is None:
        cliente = models.Cliente(nombre_empresa="ACME")
        db.add(cliente)
        db.flush()
    o = models.OrdenVenta(folio=f"C-{estatus.value}-1", cliente_id=cliente.id,
                          estatus=estatus, moneda="MXN", total=0)
    db.add(o)
    db.commit()
    return o


# ---------------------------------------------------------------------------
# El rastro
# ---------------------------------------------------------------------------
def test_cada_movimiento_deja_fila_con_el_stock_resultante(db, usuario):
    u = usuario("administrador")
    p = _producto(db, stock=100)

    mov = stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.ENTRADA.value, cantidad=25,
        referencia_tipo="compra", referencia_id=7, motivo="Recepción de OC", usuario=u)
    db.commit()

    assert p.stock_actual == 125           # 100 + 25
    assert mov.stock_resultante == 125     # la foto queda en la fila, no se recalcula después
    assert mov.tipo == TipoMovimientoStock.ENTRADA.value
    assert mov.cantidad == 25
    assert mov.referencia_tipo == "compra" and mov.referencia_id == 7
    assert mov.usuario_id == u.id


def test_la_salida_va_en_negativo(db):
    p = _producto(db, stock=100)

    mov = stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.SALIDA.value, cantidad=-30,
        referencia_tipo="remision", referencia_id=1)
    db.commit()

    # El signo lo trae el llamador: el servicio suma. 100 − 30.
    assert p.stock_actual == 70
    assert mov.stock_resultante == 70


def test_el_kardex_reconstruye_el_stock_paso_a_paso(db):
    p = _producto(db, stock=0)
    for tipo, cant in [
        (TipoMovimientoStock.ENTRADA.value, 50),
        (TipoMovimientoStock.SALIDA.value, -20),
        (TipoMovimientoStock.AJUSTE.value, -5),
        (TipoMovimientoStock.ENTRADA.value, 10),
    ]:
        stock_service.aplicar_movimiento(db, producto=p, tipo=tipo, cantidad=cant)
    db.commit()

    movs = (
        db.query(models.MovimientoStock)
        .filter(models.MovimientoStock.producto_id == p.id)
        .order_by(models.MovimientoStock.id)
        .all()
    )
    # 0+50=50, 50−20=30, 30−5=25, 25+10=35
    assert [m.stock_resultante for m in movs] == [50, 30, 25, 35]
    assert p.stock_actual == 35
    # La suma de los deltas tiene que dar el stock final: es lo que hace
    # auditable el kardex.
    assert sum(m.cantidad for m in movs) == p.stock_actual


# ---------------------------------------------------------------------------
# Guardas
# ---------------------------------------------------------------------------
def test_no_deja_el_stock_negativo(db):
    p = _producto(db, stock=10)

    with pytest.raises(ValueError, match="negativo"):
        stock_service.aplicar_movimiento(
            db, producto=p, tipo=TipoMovimientoStock.SALIDA.value, cantidad=-11)

    db.rollback()
    assert _producto_recargado(db, p.id).stock_actual == 10


def test_puede_dejarlo_exactamente_en_cero(db):
    p = _producto(db, stock=10)
    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.SALIDA.value, cantidad=-10)
    db.commit()
    assert p.stock_actual == 0


def _producto_recargado(db, pid):
    db.expire_all()
    return db.get(models.Producto, pid)


# ---------------------------------------------------------------------------
# Reservas: stock físico vs. disponible
# ---------------------------------------------------------------------------
def test_una_reserva_no_toca_el_stock_fisico(db):
    """Reservar aparta mercancía para una cotización, pero no la saca del
    almacén: el stock físico no cambia y aun así deja rastro."""
    p = _producto(db, stock=100)
    cot = _cotizacion(db)

    mov = stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.RESERVA.value, cantidad=30,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    db.commit()

    assert p.stock_actual == 100            # sigue en el almacén
    assert mov.stock_resultante == 100      # la fila lo confirma
    assert stock_service.reservas_activas(db, p.id) == 30


def test_liberar_devuelve_el_disponible(db):
    p = _producto(db, stock=100)
    cot = _cotizacion(db)

    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.RESERVA.value, cantidad=40,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.LIBERACION.value, cantidad=-15,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    db.commit()

    # 40 reservados − 15 liberados. La liberación viene en negativo.
    assert stock_service.reservas_activas(db, p.id) == 25
    assert p.stock_actual == 100


def test_solo_cuentan_las_reservas_de_cotizaciones_vivas(db):
    """Una cotización que ya se convirtió en venta dejó de apartar mercancía:
    su reserva se consumió como SALIDA. Si siguiera contando, el disponible
    quedaría artificialmente bajo y el vendedor no podría prometer stock que sí
    existe."""
    cliente = models.Cliente(nombre_empresa="ACME")
    db.add(cliente)
    db.flush()
    p = _producto(db, stock=100)
    viva = _cotizacion(db, cliente)
    convertida = models.OrdenVenta(folio="V-9", cliente_id=cliente.id,
                                   estatus=EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add(convertida)
    db.commit()

    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.RESERVA.value, cantidad=10,
        referencia_tipo="cotizacion", referencia_id=viva.id)
    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.RESERVA.value, cantidad=50,
        referencia_tipo="cotizacion", referencia_id=convertida.id)
    db.commit()

    # Solo los 10 de la que sigue en COTIZACION.
    assert stock_service.reservas_activas(db, p.id) == 10


def test_las_reservas_de_otro_producto_no_se_mezclan(db):
    a = _producto(db, sku="A", stock=100)
    b = _producto(db, sku="B", stock=100)
    cot = _cotizacion(db)

    stock_service.aplicar_movimiento(
        db, producto=a, tipo=TipoMovimientoStock.RESERVA.value, cantidad=30,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    db.commit()

    assert stock_service.reservas_activas(db, a.id) == 30
    assert stock_service.reservas_activas(db, b.id) == 0


def test_nunca_devuelve_reservas_negativas(db):
    """Si por datos torcidos las liberaciones superan a las reservas, el
    disponible no debe *aumentar* por encima del stock físico."""
    p = _producto(db, stock=100)
    cot = _cotizacion(db)

    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.RESERVA.value, cantidad=10,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    stock_service.aplicar_movimiento(
        db, producto=p, tipo=TipoMovimientoStock.LIBERACION.value, cantidad=-25,
        referencia_tipo="cotizacion", referencia_id=cot.id)
    db.commit()

    # 10 − 25 = −15, pero se acota a 0.
    assert stock_service.reservas_activas(db, p.id) == 0
