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


def _orden_con_detalle(db, vendedor, cliente, folio, cantidad="10"):
    orden = models.OrdenVenta(folio=folio, cliente_id=cliente.id, vendedor_id=vendedor.id,
                               estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add(orden)
    db.flush()
    det = models.DetalleOrden(orden_id=orden.id, descripcion_libre="Cable",
                               cantidad=Decimal(cantidad), precio_unitario=Decimal("5"),
                               subtotal=Decimal("50"), unidad="MTS")
    db.add(det)
    db.commit()
    return orden, det


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


def test_gerente_comercial_si_puede_recibir(client_as, db):
    # §6 de la matriz: GERENTE_COMERCIAL tiene gestión completa de remisiones,
    # incluida la recepción — no debe recibir 403 aquí (I-1).
    cli = _cliente(db)
    admin = client_as("administrador")
    rem_id = _crear_borrador(admin, cli.id).json()["id"]
    admin.post(f"/api/remisiones/{rem_id}/emitir")

    gerente = client_as("gerente_comercial")
    r = gerente.patch(f"/api/remisiones/{rem_id}/recepcion",
                       json={"recibido_por": "Juan Pérez"})
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


# ---------------------------------------------------------------------------
# Fix round 1 (revisión adversarial): OPERATIVO se saltaba el gate de estado
# en word/imprimir; avance-entrega sin gate de remision; estado inválido
# daba 500; visibilidad de lectura de VENTAS ampliada (decisión de producto).
# ---------------------------------------------------------------------------

def test_operativo_no_puede_descargar_word_de_borrador(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    rem_id = _crear_borrador(admin, cli.id).json()["id"]  # se queda en borrador

    operativo = client_as("operativo")
    r = operativo.get(f"/api/remisiones/{rem_id}/word")
    assert r.status_code == 404


def test_operativo_no_puede_imprimir_cancelada(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    rem_id = _crear_borrador(admin, cli.id).json()["id"]
    admin.post(f"/api/remisiones/{rem_id}/emitir")
    admin.post(f"/api/remisiones/{rem_id}/cancelar", json={"motivo": "error"})

    operativo = client_as("operativo")
    r = operativo.get(f"/api/remisiones/{rem_id}/imprimir")
    assert r.status_code == 404


def test_estado_invalido_da_400_no_500(client_as, db):
    admin = client_as("administrador")
    r = admin.get("/api/remisiones/", params={"estado": "basura"})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Decisión de producto: VENTAS puede crear remisiones sobre órdenes ajenas
# (cartera compartida B2B) — pero la visibilidad de LECTURA de read:own se
# amplía a "propia O de una orden propia": el dueño de la orden ve las
# remisiones que otro VENTAS creó sobre ella (listado y detalle), aunque NO
# pueda mutarlas (PUT/emitir siguen estrictos).
# ---------------------------------------------------------------------------

def test_ventas_ve_remision_de_su_orden_creada_por_otro_pero_no_la_muta(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")
    orden, det = _orden_con_detalle(db, v1.user, cli, "V-26080200")

    creado = v2.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable", "cantidad": "3"}],
    })
    assert creado.status_code == 200, creado.text
    rem_id = creado.json()["id"]

    # v1 (dueño de la orden, no de la remisión) la VE en el listado...
    listado = v1.get("/api/remisiones/")
    assert listado.status_code == 200
    assert rem_id in [it["id"] for it in listado.json()["items"]]

    # ...y en el detalle...
    detalle = v1.get(f"/api/remisiones/{rem_id}")
    assert detalle.status_code == 200, detalle.text

    # ...pero NO puede mutarla.
    put = v1.put(f"/api/remisiones/{rem_id}", json={"transportista": "DHL"})
    assert put.status_code == 403
    emitir = v1.post(f"/api/remisiones/{rem_id}/emitir")
    assert emitir.status_code == 403


def test_ventas_no_ve_remision_de_orden_ajena_creada_por_otro(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")
    v3 = client_as("ventas", email="v3@test.local")
    orden, det = _orden_con_detalle(db, v1.user, cli, "V-26080201")

    creado = v2.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable", "cantidad": "3"}],
    })
    rem_id = creado.json()["id"]

    # v3 no creó la remisión ni es dueño de la orden — no debe verla.
    listado = v3.get("/api/remisiones/")
    ids = [it["id"] for it in listado.json()["items"]]
    assert rem_id not in ids

    detalle = v3.get(f"/api/remisiones/{rem_id}")
    assert detalle.status_code == 403


def test_ventas_avance_entrega_orden_ajena_filtra_remisiones_al_historial_propio(client_as, db):
    cli = _cliente(db)
    v1 = client_as("ventas", email="v1@test.local")
    v2 = client_as("ventas", email="v2@test.local")
    orden, det = _orden_con_detalle(db, v1.user, cli, "V-26080202")

    # v1 (dueño de la orden) crea y emite una remisión...
    rem_v1 = v1.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable", "cantidad": "2"}],
    }).json()["id"]
    v1.post(f"/api/remisiones/{rem_v1}/emitir")

    # ...y v2 (ajeno a la orden) también crea/emite la suya.
    rem_v2 = v2.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable", "cantidad": "3"}],
    }).json()["id"]
    v2.post(f"/api/remisiones/{rem_v2}/emitir")

    # v2 pide avance-entrega de la orden AJENA: partidas se quedan (mismo
    # criterio que detalle-json), pero el historial de remisiones se filtra
    # a solo las suyas.
    r = v2.get(f"/api/ventas/{orden.id}/avance-entrega")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["partidas"]  # el agregado no se gatea
    remision_ids = [rr["id"] for rr in body["remisiones"]]
    assert rem_v2 in remision_ids
    assert rem_v1 not in remision_ids

    # v1 (dueño de la orden) sí ve el historial completo.
    r1 = v1.get(f"/api/ventas/{orden.id}/avance-entrega")
    remision_ids_v1 = [rr["id"] for rr in r1.json()["remisiones"]]
    assert rem_v1 in remision_ids_v1
    assert rem_v2 in remision_ids_v1


def test_operativo_avance_entrega_no_ve_remisiones_en_borrador(client_as, db):
    cli = _cliente(db)
    admin = client_as("administrador")
    orden, det = _orden_con_detalle(db, admin.user, cli, "V-26080203")

    rem_borrador = admin.post("/api/remisiones/", json={
        "orden_venta_id": orden.id,
        "detalles": [{"detalle_orden_id": det.id, "descripcion": "Cable", "cantidad": "1"}],
    }).json()["id"]  # nunca se emite

    operativo = client_as("operativo")
    r = operativo.get(f"/api/ventas/{orden.id}/avance-entrega")
    assert r.status_code == 200, r.text
    remision_ids = [rr["id"] for rr in r.json()["remisiones"]]
    assert rem_borrador not in remision_ids
