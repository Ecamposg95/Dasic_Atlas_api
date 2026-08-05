"""UAT-05: dos usuarios no consumen simultáneamente el mismo saldo pendiente.

Es el invariante central del pack de remisiones y hasta la Ola 0 era
inverificable: la suite corría sobre SQLite con `pg_advisory_xact_lock` y
`hashtext` parcheados a no-op, así que un lock ausente y un lock funcionando
daban exactamente el mismo resultado verde.

Todo aquí exige **PostgreSQL real y dos conexiones** — de ahí el marcador
`postgres`, que se omite solo en modo SQLite (ver `tests/conftest.py`).

Diseño de la carrera
--------------------
Sincronizar *antes* de llamar a `emitir` no probaría nada: si un hilo termina
antes de que el otro arranque, el segundo ve el pendiente ya consumido y falla
por la vía normal, con o sin lock. Para que el test distinga un lock que
funciona de uno que no existe, la barrera se coloca **justo antes de tomar el
lock de orden**, cuando ambos hilos ya leyeron su remisión y están por entrar
a la sección crítica. Sin el lock los dos leerían `pendiente = 10` a la vez y
los dos entregarían: 20 unidades sobre una orden de 10.
"""
import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app import models
from app.domains.remisiones import repository, service
from app.domains.remisiones.schemas import DetalleRemisionInput, RemisionCreate
from app.services import folio_service

# Tope de espera de los hilos. Los locks reales se resuelven en milisegundos;
# esto solo existe para que un deadlock se reporte como fallo en vez de colgar
# la suite para siempre.
TIMEOUT = 20


@pytest.fixture()
def orden_de_10(db, usuario):
    """Orden con una sola partida de 10 unidades, ya comprometida en la base
    (los hilos abren sus propias conexiones y solo ven lo commiteado)."""
    u = usuario("ventas", email="carrera@test.local")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli)
    db.flush()
    o = models.OrdenVenta(folio="V-26080077", cliente_id=cli.id, vendedor_id=u.id,
                          estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add(o)
    db.flush()
    d = models.DetalleOrden(orden_id=o.id, descripcion_libre="Cable",
                            cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                            subtotal=Decimal("50"), unidad="MTS")
    db.add(d)
    db.commit()
    return o, d, u


def _borrador(db, o, d, u, cantidad):
    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal(cantidad))])
    rem = service.crear_borrador(db, payload, u)
    db.commit()
    return rem


def _emitir_en_su_propia_conexion(engine, remision_id, usuario_id, locker):
    """Emite desde una sesión nueva, como haría otro worker del servidor.

    Devuelve el folio si emitió, o la HTTPException si el backend la rechazó.
    Cualquier otra excepción se propaga: significa que el flujo se rompió de
    una forma que este test no contempla, y eso debe verse.
    """
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        db.execute(text(f"SET lock_timeout = '{TIMEOUT}s'"))
        user = db.get(models.Usuario, usuario_id)
        rem = service.emitir(db, remision_id, user, locker=locker)
        return ("emitida", rem.folio)
    except HTTPException as exc:
        db.rollback()
        return ("rechazada", exc)
    finally:
        db.close()


def _locker_sincronizado(barrera):
    """`pg_locker` real, con una cita en la puerta de la sección crítica.

    Los dos hilos se esperan justo ANTES de pedir el lock de orden, así que
    entran a competir por él en el mismo instante. El lock de remisión (clave
    distinta por remisión) y el de folio no se sincronizan: hacerlo sería
    citarlos donde no compiten.
    """
    def locker(db, key):
        if key.startswith("remision-emitir:orden:"):
            barrera.wait(timeout=TIMEOUT)
        folio_service.pg_locker(db, key)
    return locker


@pytest.mark.postgres
def test_dos_remisiones_simultaneas_no_sobreentregan_la_misma_orden(db, pg_engine, orden_de_10):
    """UAT-05. Dos remisiones piden las 10 unidades pendientes a la vez:
    exactamente una emite y la otra recibe un 400 recuperable con el detalle
    del exceso. La orden entrega 10, nunca 20."""
    o, d, u = orden_de_10
    r1 = _borrador(db, o, d, u, "10")
    r2 = _borrador(db, o, d, u, "10")
    # `usuario('ventas')` no tiene permiso de sobre-entrega: el perdedor de la
    # carrera debe ser rechazado, no autorizado en silencio.
    barrera = threading.Barrier(2)
    locker = _locker_sincronizado(barrera)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futuros = [pool.submit(_emitir_en_su_propia_conexion, pg_engine, r.id, u.id, locker)
                   for r in (r1, r2)]
        resultados = [f.result(timeout=TIMEOUT) for f in futuros]

    estados = [estado for estado, _ in resultados]
    assert sorted(estados) == ["emitida", "rechazada"], (
        f"se esperaba exactamente una emisión; salió {estados}")

    rechazo = next(payload for estado, payload in resultados if estado == "rechazada")
    assert rechazo.status_code == 400
    assert "excesos" in str(rechazo.detail)

    # El invariante, medido sobre la orden y no sobre el resultado de las
    # llamadas: se entregaron 10 de 10. Sin el lock serían 20.
    db.expire_all()
    entregado = repository.entregado_por_detalle(db, o.id)
    assert entregado.get(d.id) == Decimal("10")


@pytest.mark.postgres
def test_emisiones_simultaneas_no_repiten_folio(db, pg_engine, usuario):
    """El consecutivo de folio se genera bajo `pg_advisory_xact_lock`. Cuatro
    emisiones a la vez sobre órdenes distintas —para que solo compita el lock
    de folio, no el de orden— producen cuatro folios distintos y consecutivos."""
    u = usuario("administrador", email="folios@test.local")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli)
    db.flush()

    remisiones = []
    for i in range(4):
        o = models.OrdenVenta(folio=f"V-2608010{i}", cliente_id=cli.id, vendedor_id=u.id,
                              estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
        db.add(o)
        db.flush()
        d = models.DetalleOrden(orden_id=o.id, descripcion_libre="Cable",
                                cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                                subtotal=Decimal("50"), unidad="MTS")
        db.add(d)
        db.commit()
        remisiones.append(_borrador(db, o, d, u, "1"))

    with ThreadPoolExecutor(max_workers=4) as pool:
        futuros = [pool.submit(_emitir_en_su_propia_conexion, pg_engine, r.id, u.id,
                               folio_service.pg_locker)
                   for r in remisiones]
        resultados = [f.result(timeout=TIMEOUT) for f in futuros]

    assert all(estado == "emitida" for estado, _ in resultados), resultados
    folios = sorted(folio for _, folio in resultados)
    assert len(set(folios)) == 4, f"folio repetido bajo concurrencia: {folios}"
    consecutivos = [int(f.split("-")[1][4:]) for f in folios]
    assert consecutivos == [1, 2, 3, 4], f"consecutivo con hueco o salto: {folios}"
