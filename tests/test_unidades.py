from decimal import Decimal
from app import models


def test_unidad_medida_tabla(db):
    u = models.UnidadMedida(nombre="Metro", abreviatura="MTS", activa=True, orden=2)
    db.add(u)
    db.commit()
    assert db.query(models.UnidadMedida).filter_by(nombre="Metro").one().abreviatura == "MTS"


def test_detalle_remision_acepta_decimales_y_unidad(db):
    rem = models.Remision()
    db.add(rem)
    db.flush()
    det = models.DetalleRemision(
        remision_id=rem.id, descripcion="Cable", cantidad=Decimal("2.500"), unidad="MTS",
    )
    db.add(det)
    db.commit()
    assert det.cantidad == Decimal("2.500")
    assert det.unidad == "MTS"
