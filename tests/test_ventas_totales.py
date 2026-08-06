"""Totales de venta: el backend tiene que calcular lo mismo que el cotizador.

El usuario aprueba en pantalla un número que calcula `web/src/features/
cotizador/lib/calc.ts`, y el que queda guardado lo calcula `routers/ventas.py`.
Son dos implementaciones de la misma aritmética en dos lenguajes, y hasta
ahora solo una tenía pruebas (`calc.test.ts`). Estas son su espejo, con los
mismos casos y la misma derivación a mano.

Fórmula, idéntica en ambos lados:

    precio_unitario = costo × (1 + utilidad/100)
    importe_linea   = redondear2(precio_unitario × cantidad × (1 − descuento/100))
    subtotal        = Σ importe_linea          ← se redondea POR LÍNEA antes de sumar

`orden.total` guarda el **subtotal sin IVA**: el IVA se aplica al convertir la
cotización en venta. No confundir con el `total` de `computeTotals` en el
frontend, que sí lo incluye.
"""
from decimal import Decimal


from app import models


def _cliente(db):
    c = models.Cliente(nombre_empresa="ACME")
    db.add(c)
    db.commit()
    return c


def _payload(cliente_id, lineas, **extra):
    base = {
        "cliente_id": cliente_id,
        "moneda": "MXN",
        "detalles": [
            {
                "cantidad": str(l["cantidad"]),
                "utilidad": str(l.get("utilidad", 0)),
                "descuento": str(l.get("descuento", 0)),
                "costo_unitario": str(l["costo"]),
                "descripcion_libre": l.get("descripcion", "Línea de prueba"),
                "tipo_linea": "producto_fantasma",
            }
            for l in lineas
        ],
    }
    base.update(extra)
    return base


def _crear(client, cliente_id, lineas, **extra):
    r = client.post("/api/ventas/", json=_payload(cliente_id, lineas, **extra))
    assert r.status_code in (200, 201), r.text
    return r.json()


def _orden(db, data):
    db.expire_all()
    return db.get(models.OrdenVenta, data["id"])


def test_costo_mas_utilidad_sin_descuento(db, client_as):
    """100 de costo con 30% de utilidad, 2 piezas.

    precio_unitario = 100 × 1.30 = 130
    importe         = 130 × 2    = 260
    """
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [{"costo": "100", "utilidad": "30", "cantidad": "2"}]))
    assert Decimal(orden.total) == Decimal("260.00")


def test_descuento_al_cliente(db, client_as):
    """100 de costo, 30% de utilidad, 3 piezas, 10% de descuento.

    precio_unitario = 100 × 1.30 = 130
    importe         = 130 × 3 × 0.90 = 351
    """
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [{"costo": "100", "utilidad": "30", "cantidad": "3", "descuento": "10"}]))
    assert Decimal(orden.total) == Decimal("351.00")


def test_varias_lineas_suman(db, client_as):
    """50 × 1.20 × 1 = 60   +   200 × 1.10 × 2 = 440   →   500"""
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [
        {"costo": "50", "utilidad": "20", "cantidad": "1"},
        {"costo": "200", "utilidad": "10", "cantidad": "2"},
    ]))
    assert Decimal(orden.total) == Decimal("500.00")


def test_redondea_por_linea_antes_de_sumar(db, client_as):
    """El redondeo por línea NO es el mismo que redondear el total.

    Tres líneas de 0.333 cada una:
      - redondeando por línea: 0.33 × 3           = 0.99
      - redondeando solo al final: 0.999 → 1.00

    El backend hace lo primero (y `computeTotals` en el frontend también), para
    que la suma de los importes impresos en el PDF cuadre con `orden.total`.
    """
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [
        {"costo": "0.333", "utilidad": "0", "cantidad": "1"},
        {"costo": "0.333", "utilidad": "0", "cantidad": "1"},
        {"costo": "0.333", "utilidad": "0", "cantidad": "1"},
    ]))
    assert Decimal(orden.total) == Decimal("0.99")


def test_medio_centavo_redondea_hacia_arriba_como_el_cotizador(db, client_as):
    """Un importe de exactamente x.xx5 tiene que redondear igual en los dos lados.

    1 de costo con 12.5% de utilidad → 1 × 1.125 = 1.125.

    El cotizador usa `Math.round`, que es *half-up*: muestra **1.13**. Python
    `Decimal.quantize` por defecto es *half-even*, que daría 1.12 — y entonces
    el usuario aprobaría 1.13 y quedaría guardado 1.12. Un centavo, pero en el
    documento que el cliente firma y sobre el que se factura.
    """
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [{"costo": "1", "utilidad": "12.5", "cantidad": "1"}]))
    assert Decimal(orden.total) == Decimal("1.13")


def test_medio_centavo_en_una_cantidad_mayor(db, client_as):
    """0.125 de costo × 1 pieza = 0.125 → 0.13 (no 0.12)."""
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [{"costo": "0.125", "utilidad": "0", "cantidad": "1"}]))
    assert Decimal(orden.total) == Decimal("0.13")


def test_el_detalle_guarda_el_mismo_importe_que_el_total(db, client_as):
    """La suma de los subtotales por línea tiene que dar exactamente
    `orden.total`: es lo que el PDF imprime línea por línea."""
    c = client_as("administrador")
    cli = _cliente(db)
    orden = _orden(db, _crear(c, cli.id, [
        {"costo": "33.33", "utilidad": "15", "cantidad": "3"},
        {"costo": "12.75", "utilidad": "40", "cantidad": "7"},
    ]))
    suma = sum(Decimal(d.subtotal) for d in orden.detalles)
    assert suma == Decimal(orden.total)


def test_usd_exige_tipo_de_cambio(db, client_as):
    """Una cotización en USD sin TC no debe guardarse: convertiría a 1:1."""
    c = client_as("administrador")
    cli = _cliente(db)
    r = c.post("/api/ventas/", json=_payload(
        cli.id, [{"costo": "100", "utilidad": "0", "cantidad": "1"}], moneda="USD"))
    assert r.status_code >= 400, f"aceptó USD sin tipo de cambio: {r.text}"
