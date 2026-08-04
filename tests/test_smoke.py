from app import models


def test_create_all_y_usuario(db, usuario):
    u = usuario("ventas")
    assert u.id is not None
    assert db.query(models.Usuario).count() == 1
