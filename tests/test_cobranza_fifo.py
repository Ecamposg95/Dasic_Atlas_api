"""FIFO de cobranza: a qué cargo se va cada peso que entra.

`cuentas_por_cobrar.aplicar_pago` es el único lugar que decide cómo se reparte
un pago entre los cargos abiertos de un cliente, y hasta ahora no tenía
pruebas. Es lógica de dinero: si el reparto se equivoca, el aging y el estado
de cuenta mienten aunque el total cobrado sea correcto.

Convención de la casa: cada valor esperado está derivado a mano en el
comentario de al lado, nunca copiado de la salida de la función.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app import models
from app.models.enums import TipoMovimiento
from app.services import cuentas_por_cobrar as cxc


def _cliente(db, saldo="0"):
    c = models.Cliente(nombre_empresa="ACME", saldo_actual=Decimal(saldo))
    db.add(c)
    db.flush()
    return c


def _cargo(db, cliente, monto, *, vence=None, pagado="0", descripcion="Venta"):
    t = models.TransaccionCliente(
        cliente_id=cliente.id,
        tipo=TipoMovimiento.CARGO,
        monto=Decimal(monto),
        monto_pagado=Decimal(pagado),
        estatus_pago="pendiente",
        fecha_vencimiento=vence,
        descripcion=descripcion,
    )
    db.add(t)
    db.flush()
    return t


HOY = date.today()
AYER = HOY - timedelta(days=1)
HACE_UN_MES = HOY - timedelta(days=30)
EN_UNA_SEMANA = HOY + timedelta(days=7)


# ---------------------------------------------------------------------------
# Reparto
# ---------------------------------------------------------------------------
def test_paga_primero_el_vencimiento_mas_antiguo(db):
    cli = _cliente(db, "300")
    viejo = _cargo(db, cli, "100", vence=HACE_UN_MES, descripcion="viejo")
    nuevo = _cargo(db, cli, "200", vence=EN_UNA_SEMANA, descripcion="nuevo")
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("100"))
    db.commit()

    # Los 100 van íntegros al cargo más antiguo; el nuevo no se toca.
    assert Decimal(viejo.monto_pagado) == Decimal("100")
    assert Decimal(nuevo.monto_pagado) == Decimal("0")


def test_un_pago_puede_cubrir_varios_cargos_en_orden(db):
    cli = _cliente(db, "300")
    a = _cargo(db, cli, "100", vence=HACE_UN_MES)
    b = _cargo(db, cli, "200", vence=AYER)
    db.commit()

    res = cxc.aplicar_pago(db, cliente=cli, monto=Decimal("150"))
    db.commit()

    # 150 = 100 al primero (queda pagado) + 50 al segundo (queda parcial).
    assert Decimal(a.monto_pagado) == Decimal("100") and a.estatus_pago == "pagado"
    assert Decimal(b.monto_pagado) == Decimal("50")
    assert Decimal(str(res["monto_aplicado"])) == Decimal("150")
    assert Decimal(str(res["monto_excedente"])) == Decimal("0")


def test_el_sobrante_no_se_aplica_a_ningun_cargo(db):
    cli = _cliente(db, "100")
    unico = _cargo(db, cli, "100", vence=AYER)
    db.commit()

    res = cxc.aplicar_pago(db, cliente=cli, monto=Decimal("250"))
    db.commit()

    # El cargo se paga completo (100) y sobran 150, que NO pueden inflar
    # `monto_pagado` por encima de `monto`.
    assert Decimal(unico.monto_pagado) == Decimal("100")
    assert Decimal(str(res["monto_aplicado"])) == Decimal("100")
    assert Decimal(str(res["monto_excedente"])) == Decimal("150")
    # El saldo del cliente sí refleja el pago completo: queda a favor.
    assert Decimal(cli.saldo_actual) == Decimal("-150")  # 100 − 250


def test_ignora_los_cargos_ya_pagados(db):
    cli = _cliente(db, "100")
    liquidado = _cargo(db, cli, "500", vence=HACE_UN_MES, pagado="500")
    liquidado.estatus_pago = "pagado"
    abierto = _cargo(db, cli, "100", vence=HOY)
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("100"))
    db.commit()

    # Aunque el liquidado es más antiguo, no tiene saldo: el pago va al abierto.
    assert Decimal(liquidado.monto_pagado) == Decimal("500")
    assert Decimal(abierto.monto_pagado) == Decimal("100")


def test_respeta_el_orden_explicito_por_encima_del_fifo(db):
    """Cuando el cobrador elige a qué ventas aplicar, gana su orden."""
    cli = _cliente(db, "300")
    o_vieja = models.OrdenVenta(folio="V-1", cliente_id=cli.id, estatus=models.EstatusOrden.PENDIENTE,
                                moneda="MXN", total=0)
    o_nueva = models.OrdenVenta(folio="V-2", cliente_id=cli.id, estatus=models.EstatusOrden.PENDIENTE,
                                moneda="MXN", total=0)
    db.add_all([o_vieja, o_nueva])
    db.flush()
    c_vieja = _cargo(db, cli, "100", vence=HACE_UN_MES)
    c_vieja.orden_venta_id = o_vieja.id
    c_nueva = _cargo(db, cli, "200", vence=EN_UNA_SEMANA)
    c_nueva.orden_venta_id = o_nueva.id
    db.commit()

    # Se pide aplicar a la venta NUEVA aunque la vieja esté más vencida.
    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("200"), orden_venta_ids=[o_nueva.id])
    db.commit()

    assert Decimal(c_nueva.monto_pagado) == Decimal("200")
    assert Decimal(c_vieja.monto_pagado) == Decimal("0")


def test_un_cargo_sin_fecha_de_vencimiento_se_cobra_primero(db):
    """Comportamiento vigente, fijado a propósito: el orden usa
    `nullsfirst()`, así que un cargo SIN fecha de vencimiento se paga antes que
    uno ya vencido.

    Puede ser deliberado —liquidar primero lo que no tiene término pactado— o
    un efecto colateral del `nullsfirst`. Vale confirmarlo con administración;
    mientras tanto esta prueba impide que cambie sin que nadie lo note.
    """
    cli = _cliente(db, "300")
    sin_fecha = _cargo(db, cli, "100", vence=None, descripcion="sin término")
    vencido = _cargo(db, cli, "200", vence=HACE_UN_MES, descripcion="vencido")
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("100"))
    db.commit()

    assert Decimal(sin_fecha.monto_pagado) == Decimal("100")
    assert Decimal(vencido.monto_pagado) == Decimal("0")


def test_rechaza_montos_no_positivos(db):
    cli = _cliente(db, "100")
    _cargo(db, cli, "100")
    db.commit()

    for malo in (Decimal("0"), Decimal("-50")):
        with pytest.raises(ValueError):
            cxc.aplicar_pago(db, cliente=cli, monto=malo)


# ---------------------------------------------------------------------------
# Estatus del cargo
# ---------------------------------------------------------------------------
def test_estatus_pendiente_parcial_pagado(db):
    cli = _cliente(db, "100")
    cargo = _cargo(db, cli, "100", vence=EN_UNA_SEMANA)
    db.commit()
    assert cargo.estatus_pago == "pendiente"

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("30"))
    db.commit()
    assert cargo.estatus_pago == "parcial"  # 30 de 100

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("70"))
    db.commit()
    assert cargo.estatus_pago == "pagado"  # 100 de 100


def test_un_cargo_pasado_de_fecha_y_no_liquidado_queda_vencido(db):
    cli = _cliente(db, "100")
    cargo = _cargo(db, cli, "100", vence=AYER)
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("40"))
    db.commit()

    # Pagado en parte, pero la fecha ya pasó: 'vencido' pisa a 'parcial'.
    assert Decimal(cargo.monto_pagado) == Decimal("40")
    assert cargo.estatus_pago == "vencido"


def test_liquidar_un_cargo_vencido_lo_saca_de_vencido(db):
    cli = _cliente(db, "100")
    cargo = _cargo(db, cli, "100", vence=AYER)
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("100"))
    db.commit()

    # 'pagado' no se sobreescribe con 'vencido' aunque la fecha haya pasado.
    assert cargo.estatus_pago == "pagado"


# ---------------------------------------------------------------------------
# Asentamiento contable
# ---------------------------------------------------------------------------
def test_cada_pago_deja_una_fila_de_abono_por_el_monto_completo(db):
    cli = _cliente(db, "500")
    _cargo(db, cli, "500", vence=AYER)
    db.commit()

    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("120"), descripcion="Pago 1")
    cxc.aplicar_pago(db, cliente=cli, monto=Decimal("80"), descripcion="Pago 2")
    db.commit()

    abonos = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.cliente_id == cli.id)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.ABONO)
        .all()
    )
    # Un ABONO por pago, por el monto recibido (no por el aplicado).
    assert len(abonos) == 2
    assert sorted(Decimal(a.monto) for a in abonos) == [Decimal("80"), Decimal("120")]
    # 500 − 120 − 80
    assert Decimal(cli.saldo_actual) == Decimal("300")


def test_salta_un_cargo_sin_saldo_cuando_se_eligen_las_ventas_a_mano(db):
    """La guarda de saldo cero dentro de `aplicar_pago` solo es alcanzable por
    la vía del **orden explícito**: el camino FIFO nunca la toca, porque
    `_cargos_abiertos` ya descarta antes los cargos sin saldo.

    Cuando el cobrador elige a mano las ventas a las que aplicar, esa criba no
    corre: si señala una ya liquidada, la guarda es lo único que impide que
    aparezca en el detalle del pago con 0 aplicados.

    (Encontrada al mutar el servicio: la guarda existía y ninguna prueba la
    ejercitaba, porque todas iban por FIFO.)
    """
    cli = _cliente(db, "200")
    o_liquidada = models.OrdenVenta(folio="V-L", cliente_id=cli.id,
                                    estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    o_abierta = models.OrdenVenta(folio="V-A", cliente_id=cli.id,
                                  estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add_all([o_liquidada, o_abierta])
    db.flush()

    liquidada = _cargo(db, cli, "100", vence=HACE_UN_MES, pagado="100")
    liquidada.estatus_pago = "vencido"   # estatus viejo: no dice "pagado" pese a estarlo
    liquidada.orden_venta_id = o_liquidada.id
    abierta = _cargo(db, cli, "200", vence=AYER)
    abierta.orden_venta_id = o_abierta.id
    db.commit()

    res = cxc.aplicar_pago(
        db, cliente=cli, monto=Decimal("50"),
        orden_venta_ids=[o_liquidada.id, o_abierta.id])
    db.commit()

    # La liquidada no se toca ni ensucia el detalle; los 50 van a la abierta.
    assert Decimal(liquidada.monto_pagado) == Decimal("100")
    tocados = [d["transaccion_cliente_id"] for d in res["detalle"]]
    assert liquidada.id not in tocados
    assert tocados == [abierta.id]
    assert Decimal(abierta.monto_pagado) == Decimal("50")
