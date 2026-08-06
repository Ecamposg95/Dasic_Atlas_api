"""Aging: cuánto se debe y desde hace cuánto.

`calcular_aging` reparte los cargos abiertos en cuatro tramos de antigüedad.
Es el reporte con el que administración decide a quién llamar, así que un
cargo en el tramo equivocado no rompe nada visiblemente: solo hace que se
persiga la cobranza en el orden equivocado.

Los bordes (30/31, 60/61, 90/91) son donde se equivocan estas funciones, así
que cada uno se prueba por sus dos lados.
"""
from datetime import date, timedelta
from decimal import Decimal

from app import models
from app.core.fechas import hoy_negocio
from app.models.enums import TipoMovimiento
from app.services import cuentas_por_cobrar as cxc

# Referencia de fecha: la del NEGOCIO, no la del runner.
#
# Estas pruebas usaban `date.today()`, que da el día de la máquina. Funcionaba
# en un equipo en CDMX y fallaba en CI, que corre en UTC: el código bajo prueba
# resuelve "hoy" con `hoy_negocio()` y, mientras UTC va un día por delante, los
# días de atraso salían corridos y los cargos caían en el tramo de al lado.
# Las pruebas tienen que hablar el mismo calendario que el código que prueban.
HOY = hoy_negocio()


def _cliente(db, nombre="ACME"):
    c = models.Cliente(nombre_empresa=nombre, saldo_actual=Decimal("0"))
    db.add(c)
    db.flush()
    return c


def _cargo(db, cliente, monto, *, dias_atraso=None, pagado="0", estatus="pendiente"):
    """`dias_atraso=None` → sin fecha de vencimiento; 0 → vence hoy."""
    vence = None if dias_atraso is None else HOY - timedelta(days=dias_atraso)
    t = models.TransaccionCliente(
        cliente_id=cliente.id,
        tipo=TipoMovimiento.CARGO,
        monto=Decimal(monto),
        monto_pagado=Decimal(pagado),
        estatus_pago=estatus,
        fecha_vencimiento=vence,
    )
    db.add(t)
    db.flush()
    return t


def _tramo(aging, rango):
    return next(b for b in aging["buckets"] if b["rango"] == rango)


def test_siempre_devuelve_los_cuatro_tramos(db):
    """Aunque no haya deuda: el reporte no debe cambiar de forma según los
    datos, o el frontend tendría que defenderse de tramos ausentes."""
    aging = cxc.calcular_aging(db)
    assert [b["rango"] for b in aging["buckets"]] == ["0-30", "31-60", "61-90", "90+"]
    assert aging["total"] == 0
    assert aging["total_count"] == 0


def test_reparte_cada_cargo_en_su_tramo(db):
    cli = _cliente(db)
    _cargo(db, cli, "100", dias_atraso=10)    # 0-30
    _cargo(db, cli, "200", dias_atraso=45)    # 31-60
    _cargo(db, cli, "300", dias_atraso=75)    # 61-90
    _cargo(db, cli, "400", dias_atraso=200)   # 90+
    db.commit()

    aging = cxc.calcular_aging(db)
    assert _tramo(aging, "0-30")["monto"] == 100
    assert _tramo(aging, "31-60")["monto"] == 200
    assert _tramo(aging, "61-90")["monto"] == 300
    assert _tramo(aging, "90+")["monto"] == 400
    assert aging["total"] == 1000          # 100+200+300+400
    assert aging["total_count"] == 4


def test_los_bordes_caen_del_lado_correcto(db):
    """30 y 31, 60 y 61, 90 y 91: un día decide el tramo."""
    cli = _cliente(db)
    for dias in (30, 31, 60, 61, 90, 91):
        _cargo(db, cli, "10", dias_atraso=dias)
    db.commit()

    aging = cxc.calcular_aging(db)
    assert _tramo(aging, "0-30")["count"] == 1   # solo el de 30
    assert _tramo(aging, "31-60")["count"] == 2  # 31 y 60
    assert _tramo(aging, "61-90")["count"] == 2  # 61 y 90
    assert _tramo(aging, "90+")["count"] == 1    # solo el de 91


def test_lo_no_vencido_va_al_primer_tramo(db):
    """Un cargo que aún no vence, o sin fecha, no está atrasado: 0 días."""
    cli = _cliente(db)
    _cargo(db, cli, "50", dias_atraso=-10)   # vence en 10 días
    _cargo(db, cli, "70", dias_atraso=None)  # sin término pactado
    db.commit()

    aging = cxc.calcular_aging(db)
    assert _tramo(aging, "0-30")["monto"] == 120  # 50 + 70
    assert aging["total_count"] == 2


def test_cuenta_el_saldo_pendiente_y_no_el_monto_original(db):
    """Un cargo pagado a medias solo debe lo que falta."""
    cli = _cliente(db)
    _cargo(db, cli, "1000", dias_atraso=45, pagado="600", estatus="parcial")
    db.commit()

    aging = cxc.calcular_aging(db)
    assert _tramo(aging, "31-60")["monto"] == 400  # 1000 − 600
    assert aging["total"] == 400


def test_ignora_los_cargos_liquidados(db):
    cli = _cliente(db)
    _cargo(db, cli, "500", dias_atraso=200, pagado="500", estatus="pagado")
    _cargo(db, cli, "100", dias_atraso=5)
    db.commit()

    aging = cxc.calcular_aging(db)
    assert aging["total"] == 100
    assert aging["total_count"] == 1
    assert _tramo(aging, "90+")["monto"] == 0


def test_ignora_un_cargo_sin_saldo_aunque_no_este_marcado_pagado(db):
    """Defensa contra datos torcidos: si `monto_pagado` cubre el monto pero el
    estatus quedó desactualizado, no debe seguir apareciendo como deuda."""
    cli = _cliente(db)
    _cargo(db, cli, "300", dias_atraso=100, pagado="300", estatus="vencido")
    db.commit()

    aging = cxc.calcular_aging(db)
    assert aging["total"] == 0
    assert aging["total_count"] == 0


def test_suma_los_cargos_de_todos_los_clientes(db):
    """El aging es del negocio entero, no de un cliente."""
    a = _cliente(db, "ACME")
    b = _cliente(db, "Globex")
    _cargo(db, a, "100", dias_atraso=45)
    _cargo(db, b, "250", dias_atraso=50)
    db.commit()

    aging = cxc.calcular_aging(db)
    assert _tramo(aging, "31-60")["monto"] == 350  # 100 + 250
    assert _tramo(aging, "31-60")["count"] == 2


def test_marcar_vencidos_solo_toca_los_que_pasaron_de_fecha(db):
    cli = _cliente(db)
    atrasado = _cargo(db, cli, "100", dias_atraso=5)
    al_dia = _cargo(db, cli, "100", dias_atraso=-5)
    liquidado = _cargo(db, cli, "100", dias_atraso=30, pagado="100", estatus="pagado")
    db.commit()

    n = cxc.marcar_vencidos(db)

    assert n == 1
    assert atrasado.estatus_pago == "vencido"
    assert al_dia.estatus_pago == "pendiente"
    assert liquidado.estatus_pago == "pagado"  # liquidado no se revive
