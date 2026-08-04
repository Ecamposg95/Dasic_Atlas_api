from sqlalchemy import text

from app import models


def test_remision_nace_borrador_sin_folio(db):
    rem = models.Remision(cliente_id=None, orden_venta_id=None)
    db.add(rem)
    db.commit()
    assert rem.estado == models.EstadoRemision.BORRADOR
    assert rem.folio is None
    assert rem.stock_descontado is False


def test_estado_persiste_en_mayusculas_via_orm(db):
    """TolerantEnum persiste el NOMBRE del miembro (mayúsculas), no el value
    (minúsculas) — tanto vía server_default como vía asignación explícita.
    La migración/backfill deben escribir el mismo casing o la columna queda
    mezclada en producción (ver TolerantEnum.process_bind_param)."""
    via_default = models.Remision(cliente_id=None, orden_venta_id=None)
    via_asignado = models.Remision(
        cliente_id=None, orden_venta_id=None, estado=models.EstadoRemision.EMITIDA
    )
    db.add_all([via_default, via_asignado])
    db.commit()

    raw_default = db.execute(
        text("SELECT estado FROM remisiones WHERE id = :id"), {"id": via_default.id}
    ).scalar()
    raw_asignado = db.execute(
        text("SELECT estado FROM remisiones WHERE id = :id"), {"id": via_asignado.id}
    ).scalar()

    assert raw_default == "BORRADOR"
    assert raw_asignado == "EMITIDA"
