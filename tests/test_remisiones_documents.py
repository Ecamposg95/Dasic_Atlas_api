"""Tests de `app/domains/remisiones/documents.py` (Task 8): plantilla en
archivo (`templates/remision.html.j2`), branding configurable vía
`config_service.empresa_nombre`, unidad real por línea (no siempre 'PZA' /
clave SAT), y marca de agua "BORRADOR" cuando `rem.estado == BORRADOR`.
"""
from decimal import Decimal

from app import models
from app.domains.remisiones import documents


def _cliente(db, nombre="ACME"):
    cli = models.Cliente(nombre_empresa=nombre)
    db.add(cli)
    db.commit()
    return cli


def _remision(db, *, estado="borrador", unidad="MTS", folio=None):
    cli = _cliente(db)
    rem = models.Remision(
        folio=folio,
        cliente_id=cli.id,
        moneda="MXN",
        mostrar_precios=True,
        estado=models.EstadoRemision(estado),
    )
    db.add(rem)
    db.flush()
    det = models.DetalleRemision(
        remision_id=rem.id,
        descripcion="Cable",
        cantidad=Decimal("10"),
        unidad=unidad,
        clave_unidad_sat="XYZ",
        precio_unitario=Decimal("5"),
        subtotal=Decimal("50"),
    )
    db.add(det)
    db.commit()
    db.refresh(rem)
    return rem


def _set_empresa_nombre(db, nombre):
    db.add(models.PlatformConfig(clave="empresa_nombre", valor=nombre))
    db.commit()


def test_html_usa_unidad_real_y_branding(db):
    rem = _remision(db, estado="emitida", unidad="MTS")
    _set_empresa_nombre(db, "Atlas Test")

    html = documents.render_html(db, rem)

    assert "MTS" in html
    assert "Atlas Test" in html
    assert "DASIC Industrial" not in html


def test_borrador_lleva_marca_de_agua(db):
    rem = _remision(db, estado="borrador")

    html = documents.render_html(db, rem)

    assert "BORRADOR" in html


def test_emitida_no_lleva_marca_de_agua(db):
    rem = _remision(db, estado="emitida")

    html = documents.render_html(db, rem)

    assert "BORRADOR" not in html


def test_render_word_usa_branding_y_unidad(db):
    rem = _remision(db, estado="emitida", unidad="MTS")
    _set_empresa_nombre(db, "Atlas Test")

    data = documents.render_word(db, rem)

    assert isinstance(data, bytes)
    assert len(data) > 0


def test_folio_nulo_muestra_sin_folio(db):
    rem = _remision(db, estado="borrador", folio=None)

    html = documents.render_html(db, rem)

    assert "SIN FOLIO" in html
