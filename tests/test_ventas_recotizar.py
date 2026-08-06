"""Versionado de recotizaciones y consecutivo de folio.

Recotizar crea una versión nueva de una cotización conservando el vínculo con
el original. Dos reglas sutiles que no se ven en el código de un vistazo:

1. El folio versionado se deriva del folio **raíz**, no del folio del que se
   está recotizando. Sin eso, recotizar dos veces produciría `C-2608001V2V2`.
2. La versión **no consume** un número del consecutivo mensual: `C-2608001V2`
   no gasta el `002`, que sigue disponible para la próxima cotización nueva.

Ambas se rompen en silencio: el documento sale con un folio raro o el
consecutivo salta números, y nadie se entera hasta que administración cuadra
los folios del mes.
"""
from decimal import Decimal

from app import models


def _cliente(db):
    c = models.Cliente(nombre_empresa="ACME")
    db.add(c)
    db.commit()
    return c


def _crear_cotizacion(client, cliente_id, costo="100"):
    r = client.post("/api/ventas/", json={
        "cliente_id": cliente_id,
        "moneda": "MXN",
        "detalles": [{
            "cantidad": "1", "utilidad": "0", "descuento": "0",
            "costo_unitario": costo, "descripcion_libre": "Línea",
            "tipo_linea": "producto_fantasma",
        }],
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _recotizar(client, orden_id):
    r = client.post(f"/api/ventas/{orden_id}/recotizar")
    assert r.status_code in (200, 201), r.text
    return r.json()


def _orden(db, oid):
    db.expire_all()
    return db.get(models.OrdenVenta, oid)


def test_la_primera_recotizacion_es_v2(db, client_as):
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)

    v2 = _recotizar(c, original["id"])

    assert v2["folio"] == f"{original['folio']}V2"
    assert _orden(db, v2["id"]).cotizacion_origen_id == original["id"]


def test_recotizar_una_version_no_encadena_sufijos(db, client_as):
    """De `C-2608001V2` sale `C-2608001V3`, nunca `C-2608001V2V2`.

    El folio se deriva del RAÍZ recortando el `V\\d+` final, no del folio del
    documento que se está recotizando.
    """
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)
    v2 = _recotizar(c, original["id"])

    v3 = _recotizar(c, v2["id"])

    assert v3["folio"] == f"{original['folio']}V3"
    assert "V2V" not in v3["folio"]


def test_todas_las_versiones_apuntan_a_la_raiz_y_no_a_la_anterior(db, client_as):
    """El vínculo es en estrella, no en cadena: así reunir el historial completo
    de una cotización es una sola consulta, no un recorrido recursivo."""
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)
    v2 = _recotizar(c, original["id"])
    v3 = _recotizar(c, v2["id"])

    assert _orden(db, v2["id"]).cotizacion_origen_id == original["id"]
    assert _orden(db, v3["id"]).cotizacion_origen_id == original["id"]  # no v2


def test_la_version_no_gasta_el_consecutivo_del_mes(db, client_as):
    """Recotizar no debe robarle un número al consecutivo mensual: si la
    primera cotización es `...001`, la siguiente cotización NUEVA tiene que ser
    `...002` aunque en medio se hayan creado versiones."""
    c = client_as("administrador")
    cli = _cliente(db)
    primera = _crear_cotizacion(c, cli.id)
    _recotizar(c, primera["id"])
    _recotizar(c, primera["id"])

    segunda = _crear_cotizacion(c, cli.id)

    def consecutivo(folio):
        return int(folio.split("-")[1][4:])

    assert consecutivo(segunda["folio"]) == consecutivo(primera["folio"]) + 1


def test_la_version_nace_como_cotizacion(db, client_as):
    """Aunque se recotice una cancelada, la versión nueva nace viva."""
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)

    v2 = _recotizar(c, original["id"])

    assert _orden(db, v2["id"]).estatus == models.EstatusOrden.COTIZACION


def test_se_puede_recotizar_una_cancelada(db, client_as):
    """Es el caso de uso real: el cliente dijo que no, y meses después vuelve."""
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)
    assert c.post(f"/api/ventas/{original['id']}/cancelar").status_code < 400

    v2 = _recotizar(c, original["id"])

    assert v2["folio"] == f"{original['folio']}V2"


def test_no_se_recotiza_una_venta_ya_convertida(db, client_as):
    """Una orden que ya es venta no se versiona: para eso está crear una
    cotización nueva. Versionarla enredaría el vínculo con su cobranza."""
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id)
    assert c.post(f"/api/ventas/{original['id']}/convertir").status_code < 400

    r = c.post(f"/api/ventas/{original['id']}/recotizar")
    assert r.status_code >= 400, f"aceptó recotizar una venta: {r.text}"


def test_la_version_copia_las_lineas_del_original(db, client_as):
    c = client_as("administrador")
    cli = _cliente(db)
    original = _crear_cotizacion(c, cli.id, costo="250")

    v2 = _recotizar(c, original["id"])

    o, v = _orden(db, original["id"]), _orden(db, v2["id"])
    assert len(v.detalles) == len(o.detalles) == 1
    assert Decimal(v.total) == Decimal(o.total)
