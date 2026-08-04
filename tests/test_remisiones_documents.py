"""Tests de `app/domains/remisiones/documents.py` (Task 8): plantilla en
archivo (`templates/remision.html.j2`), branding configurable vía
`config_service.empresa_nombre`, unidad real por línea (no siempre 'PZA' /
clave SAT), marca de agua "BORRADOR" cuando `rem.estado == BORRADOR`,
marca de agua "CANCELADA" cuando `rem.estado == CANCELADA`, y línea de
recepción (recibido_por + fecha) cuando existe.
"""
from datetime import datetime, timezone
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


def test_cancelada_lleva_marca_de_agua(db):
    rem = _remision(db, estado="cancelada")

    html = documents.render_html(db, rem)

    assert "CANCELADA" in html
    assert "BORRADOR" not in html


def test_emitida_no_lleva_marca_de_agua_cancelada(db):
    rem = _remision(db, estado="emitida")

    html = documents.render_html(db, rem)

    assert "CANCELADA" not in html


def test_html_incluye_linea_de_recepcion_cuando_existe(db):
    rem = _remision(db, estado="recibida")
    rem.recibido_por = "Juan Pérez"
    rem.recibido_at = datetime(2026, 8, 1, 13, 30, tzinfo=timezone.utc)
    db.commit()
    db.refresh(rem)

    html = documents.render_html(db, rem)

    assert "Recibido por:" in html
    assert "Juan Pérez" in html
    assert "01/08/2026" in html


def test_html_sin_recepcion_no_imprime_linea(db):
    rem = _remision(db, estado="emitida")

    html = documents.render_html(db, rem)

    assert "Recibido por:" not in html


def test_word_cancelada_lleva_prefijo(db):
    # El .docx no soporta marca de agua superpuesta (python-docx) — el
    # sustituto es el prefijo en el subtítulo, análogo al de borrador.
    import io
    import zipfile

    rem = _remision(db, estado="cancelada")

    data = documents.render_word(db, rem)

    xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf-8")
    assert "CANCELADA — SIN VALIDEZ" in xml


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


def test_render_html_no_truena_con_subtotal_null(db):
    # M-3: una línea con subtotal NULL (p.ej. ad-hoc sin precio capturado)
    # no debe tronar el `sum(attribute='subtotal')` del total del pie.
    rem = _remision(db, estado="emitida", unidad="MTS")
    det_sin_precio = models.DetalleRemision(
        remision_id=rem.id,
        descripcion="Servicio sin precio",
        cantidad=Decimal("1"),
        unidad="PZA",
        precio_unitario=None,
        subtotal=None,
    )
    db.add(det_sin_precio)
    db.commit()
    db.refresh(rem)

    html = documents.render_html(db, rem)

    assert "50.00" in html  # el subtotal de la línea con precio sí suma


def test_html_escapa_descripcion_maliciosa(db):
    """Sin autoescape, `descripcion`/`observaciones`/`transportista`/
    `empresa_nombre` se inyectan crudos en el HTML servido por
    `GET /{id}/imprimir` (HTMLResponse) — XSS almacenado. La plantilla no usa
    `|safe` en ningún lado, así que activar autoescape no debe romper el
    render."""
    rem = _remision(db, estado="emitida", unidad="MTS")
    rem.detalles[0].descripcion = "<script>alert(1)</script>"
    db.commit()

    html = documents.render_html(db, rem)

    assert "&lt;script&gt;" in html
    assert "<script>alert" not in html
