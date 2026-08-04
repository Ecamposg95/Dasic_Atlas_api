"""Tests de contrato HTTP del router v2 de remisiones (Task 7): matriz de
permisos, owner-scoping (VENTAS :own), filtro de estado para OPERATIVO
("consulta emitidas" — no ve borradores ni canceladas), y el endpoint
`avance-entrega` de `app/routers/ventas.py`.

Usa `TestClient` real contra `app.main.app` (fixture `client_as` en
conftest.py) — no llama al `service`/`repository` directo: el objetivo es
probar el ROUTER (require()/_check_owner/scoping), no la lógica de negocio
ya cubierta en test_remisiones_service.py.
"""
from decimal import Decimal

from app import models


def _cliente(db, nombre="ACME"):
    cli = models.Cliente(nombre_empresa=nombre)
    db.add(cli)
    db.commit()
    return cli


def _payload_libre(cantidad="1", descripcion="Cable"):
    return {
        "moneda": "MXN",
        "detalles": [{"descripcion": descripcion, "cantidad": cantidad}],
    }


def _crear_borrador(client, cliente_id, **kw):
    payload = _payload_libre(**kw)
    payload["cliente_id"] = cliente_id
    return client.post("/api/remisiones/", json=payload)


# ---------------------------------------------------------------------------
# Casos mínimos del brief
# ---------------------------------------------------------------------------

def test_operativo_no_puede_crear_remision(client_as, db):
    cli = _cliente(db)
    operativo = client_as("operativo")
    r = _crear_borrador(operativo, cli.id)
    assert r.status_code == 403


def test_ventas_solo_ve_sus_remisiones(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")

    r1 = _crear_borrador(v1, cli.id, descripcion="Cable v1")
    assert r1.status_code == 200, r1.text
    r2 = _crear_borrador(v2, cli.id, descripcion="Cable v2")
    assert r2.status_code == 200, r2.text

    listado = v1.get("/api/remisiones/")
    assert listado.status_code == 200
    ids = [it["id"] for it in listado.json()["items"]]
    assert r1.json()["id"] in ids
    assert r2.json()["id"] not in ids


def test_flujo_completo_por_api(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")

    creado = _crear_borrador(admin, cli.id)
    assert creado.status_code == 200, creado.text
    assert creado.json() == {"id": creado.json()["id"], "estado": "borrador"}
    rem_id = creado.json()["id"]

    emitida = admin.post(f"/api/remisiones/{rem_id}/emitir")
    assert emitida.status_code == 200, emitida.text
    assert emitida.json()["estado"] == "emitida"
    assert emitida.json()["folio"]

    recibida = admin.patch(f"/api/remisiones/{rem_id}/recepcion",
                            json={"recibido_por": "Juan Pérez"})
    assert recibida.status_code == 200, recibida.text
    assert recibida.json()["estado"] == "recibida"

    historia = admin.get("/api/remisiones/", params={"estado": "recibida"})
    assert historia.status_code == 200
    ids = [it["id"] for it in historia.json()["items"]]
    assert rem_id in ids
    item = next(it for it in historia.json()["items"] if it["id"] == rem_id)
    assert item["estado"] == "recibida"


def test_operativo_si_puede_recibir(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    rem_id = _crear_borrador(admin, cli.id).json()["id"]
    admin.post(f"/api/remisiones/{rem_id}/emitir")

    operativo = client_as("operativo")
    r = operativo.patch(f"/api/remisiones/{rem_id}/recepcion",
                         json={"recibido_por": "Almacén"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "recibida"


# ---------------------------------------------------------------------------
# Owner-scoping adicional (VENTAS :own más allá del listado)
# ---------------------------------------------------------------------------

def test_ventas_no_puede_emitir_remision_ajena(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")

    rem_id = _crear_borrador(v1, cli.id).json()["id"]
    r = v2.post(f"/api/remisiones/{rem_id}/emitir")
    assert r.status_code == 403


def test_ventas_no_puede_editar_remision_ajena(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")

    rem_id = _crear_borrador(v1, cli.id).json()["id"]
    r = v2.put(f"/api/remisiones/{rem_id}", json={"transportista": "DHL"})
    assert r.status_code == 403


def test_ventas_si_puede_emitir_su_propia_remision(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")

    rem_id = _crear_borrador(v1, cli.id).json()["id"]
    r = v1.post(f"/api/remisiones/{rem_id}/emitir")
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# OPERATIVO: "consulta emitidas" — no ve borradores ni canceladas
# ---------------------------------------------------------------------------

def test_operativo_no_ve_borradores_en_listado(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    _crear_borrador(admin, cli.id)  # queda en borrador — nunca se emite

    operativo = client_as("operativo")
    listado = operativo.get("/api/remisiones/")
    assert listado.status_code == 200
    assert listado.json()["items"] == []


def test_operativo_no_puede_pedir_estado_borrador_explicito(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    _crear_borrador(admin, cli.id)

    operativo = client_as("operativo")
    r = operativo.get("/api/remisiones/", params={"estado": "borrador"})
    assert r.status_code == 403


def test_operativo_ve_emitidas(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    rem_id = _crear_borrador(admin, cli.id).json()["id"]
    admin.post(f"/api/remisiones/{rem_id}/emitir")

    operativo = client_as("operativo")
    listado = operativo.get("/api/remisiones/")
    assert listado.status_code == 200
    ids = [it["id"] for it in listado.json()["items"]]
    assert rem_id in ids


# ---------------------------------------------------------------------------
# GET /orden/{orden_id}/borrador — pendiente/unidad snapshot
# ---------------------------------------------------------------------------

def test_borrador_desde_orden_incluye_pendiente_y_unidad(client_as, db):
    admin = client_as("administrador")
    cli = _cliente(db)
    orden = models.OrdenVenta(folio="V-26080099", cliente_id=cli.id,
                               vendedor_id=admin.user.id,
                               estatus=models.EstatusOrden.PENDIENTE,
                               moneda="MXN", total=0)
    db.add(orden)
    db.flush()
    det = models.DetalleOrden(orden_id=orden.id, descripcion_libre="Cable",
                               cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                               subtotal=Decimal("50"), unidad="MTS")
    db.add(det)
    db.commit()

    r = admin.get(f"/api/remisiones/orden/{orden.id}/borrador")
    assert r.status_code == 200, r.text
    linea = r.json()["lineas"][0]
    assert linea["unidad"] == "MTS"
    assert linea["cantidad_pendiente"] == 10.0
    assert linea["entregado"] == 0.0


# ---------------------------------------------------------------------------
# GET /api/ventas/{id}/avance-entrega
# ---------------------------------------------------------------------------

def test_avance_entrega_por_partida(client_as, db):
    admin = client_as("administrador")
    cli = _cliente(db)
    orden = models.OrdenVenta(folio="V-26080100", cliente_id=cli.id,
                               vendedor_id=admin.user.id,
                               estatus=models.EstatusOrden.PENDIENTE,
                               moneda="MXN", total=0)
    db.add(orden)
    db.flush()
    det = models.DetalleOrden(orden_id=orden.id, descripcion_libre="Cable",
                               cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                               subtotal=Decimal("50"), unidad="MTS")
    db.add(det)
    db.commit()

    creado = admin.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable",
                       "cantidad": "4"}],
    })
    assert creado.status_code == 200, creado.text
    rem_id = creado.json()["id"]
    admin.post(f"/api/remisiones/{rem_id}/emitir")

    r = admin.get(f"/api/ventas/{orden.id}/avance-entrega")
    assert r.status_code == 200, r.text
    body = r.json()
    partida = next(p for p in body["partidas"] if p["detalle_orden_id"] == det.id)
    assert partida["cotizado"] == 10.0
    assert partida["entregado"] == 4.0
    assert partida["pendiente"] == 6.0
    assert partida["estado"] == "PARCIAL"
    assert any(rr["id"] == rem_id and rr["estado"] == "emitida" for rr in body["remisiones"])
