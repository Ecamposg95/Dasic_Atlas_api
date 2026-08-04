from app import models


def test_remision_nace_borrador_sin_folio(db):
    rem = models.Remision(cliente_id=None, orden_venta_id=None)
    db.add(rem)
    db.commit()
    assert rem.estado == models.EstadoRemision.BORRADOR
    assert rem.folio is None
    assert rem.stock_descontado is False
