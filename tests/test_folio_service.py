from datetime import datetime
from app import models
from app.services.folio_service import generar_folio


def _noop_locker(db, key):
    pass


def test_primer_folio_del_mes(db):
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 15), locker=_noop_locker,
    )
    assert folio == "R-26080001"


def test_consecutivo_incrementa(db):
    db.add(models.Remision(folio="R-26080007"))
    db.commit()
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 20), locker=_noop_locker,
    )
    assert folio == "R-26080008"


def test_consecutivo_reinicia_por_mes(db):
    db.add(models.Remision(folio="R-26070042"))
    db.commit()
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 1), locker=_noop_locker,
    )
    assert folio == "R-26080001"
