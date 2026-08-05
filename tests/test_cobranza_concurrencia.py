"""Dos cobradores aplicando pagos a la vez no se pisan el saldo.

`cuentas_por_cobrar.aplicar_pago` serializa con `SELECT ... FOR UPDATE` sobre
la fila del cliente. Ese lock es real solo en PostgreSQL: SQLite ignora
`FOR UPDATE` sin error, así que en el modo local la prueba pasaría igual con
el lock puesto o quitado. De ahí el marcador `postgres`.

El defecto que vigila es un *lost update* clásico, y golpea en dos sitios a la
vez cuando dos pagos entran al mismo tiempo:

- `cliente.saldo_actual` se lee, se le resta el pago y se reescribe. Sin lock,
  los dos hilos leen el mismo saldo inicial y el segundo pisa al primero: uno
  de los dos pagos desaparece del saldo del cliente.
- `cargo.monto_pagado` sigue el mismo patrón, así que un cargo puede quedar
  marcado como pagado por menos de lo que realmente entró.

Ninguno de los dos falla ruidosamente: la operación responde 200 y el dinero
cuadra mal después. Por eso el assert es sobre la aritmética final, no sobre
que las llamadas no revienten.
"""
import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app import models
from app.models.enums import TipoMovimiento
from app.services import cuentas_por_cobrar as cxc

TIMEOUT = 20


@pytest.fixture()
def cliente_con_deuda(db):
    """Cliente con un cargo abierto de 1000, ya comprometido en la base."""
    cli = models.Cliente(nombre_empresa="ACME", saldo_actual=Decimal("1000.00"))
    db.add(cli)
    db.flush()
    cargo = models.TransaccionCliente(
        cliente_id=cli.id,
        tipo=TipoMovimiento.CARGO,
        monto=Decimal("1000.00"),
        monto_pagado=Decimal("0.00"),
        estatus_pago="pendiente",
        descripcion="Venta de prueba",
    )
    db.add(cargo)
    db.commit()
    return cli.id, cargo.id


def _pagar(engine, cliente_id, monto, barrera):
    """Aplica un pago desde su propia sesión, como otro worker del servidor."""
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        s.execute(text(f"SET lock_timeout = '{TIMEOUT}s'"))
        cli = s.get(models.Cliente, cliente_id)
        # Los dos hilos se citan JUSTO ANTES de entrar a `aplicar_pago`, que es
        # donde se toma el FOR UPDATE. Sin el lock, ambos leerían el mismo
        # saldo y el mismo `monto_pagado`.
        barrera.wait(timeout=TIMEOUT)
        res = cxc.aplicar_pago(s, cliente=cli, monto=Decimal(monto), descripcion="Pago de prueba")
        s.commit()
        return res
    finally:
        s.close()


@pytest.mark.postgres
def test_dos_pagos_simultaneos_no_pierden_ninguno(db, pg_engine, cliente_con_deuda):
    """Dos pagos de 600 sobre una deuda de 1000, a la vez.

    Lo correcto: se aplican 1000 al cargo y sobran 200; el saldo del cliente
    baja los 1200 que realmente entraron. Sin el lock, cada hilo parte del
    estado inicial y el segundo pisa al primero: el cargo quedaría en 600 y el
    saldo en 400 en vez de −200.
    """
    cliente_id, cargo_id = cliente_con_deuda
    barrera = threading.Barrier(2)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futuros = [pool.submit(_pagar, pg_engine, cliente_id, "600.00", barrera) for _ in range(2)]
        resultados = [f.result(timeout=TIMEOUT) for f in futuros]

    assert len(resultados) == 2

    db.expire_all()
    cargo = db.get(models.TransaccionCliente, cargo_id)
    cliente = db.get(models.Cliente, cliente_id)

    # 600 + 400: el segundo pago solo encuentra 400 de saldo en el cargo.
    assert Decimal(cargo.monto_pagado) == Decimal("1000.00"), (
        "el cargo perdió parte de un pago: los dos hilos leyeron el mismo monto_pagado")
    assert cargo.estatus_pago == "pagado"

    # 1000 − 600 − 600. Queda negativo porque el cliente pagó de más, que es
    # justamente lo que hay que conservar: si sale 400, se perdió un pago.
    assert Decimal(cliente.saldo_actual) == Decimal("-200.00"), (
        "lost update en saldo_actual: uno de los dos pagos no quedó registrado")

    # Y el excedente se reconoce una sola vez, no dos.
    excedentes = sorted(Decimal(str(r["monto_excedente"])) for r in resultados)
    assert excedentes == [Decimal("0"), Decimal("200")], (
        f"el excedente no cuadra: {excedentes}")


@pytest.mark.postgres
def test_los_dos_abonos_quedan_asentados(db, pg_engine, cliente_con_deuda):
    """Cada pago deja su propia fila ABONO. Es el rastro contable: si uno se
    pierde, el estado de cuenta del cliente no cuadra con lo que cobró caja."""
    cliente_id, _ = cliente_con_deuda
    barrera = threading.Barrier(2)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futuros = [pool.submit(_pagar, pg_engine, cliente_id, "250.00", barrera) for _ in range(2)]
        [f.result(timeout=TIMEOUT) for f in futuros]

    db.expire_all()
    abonos = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.cliente_id == cliente_id)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.ABONO)
        .all()
    )
    assert len(abonos) == 2
    assert sum(Decimal(a.monto) for a in abonos) == Decimal("500.00")
