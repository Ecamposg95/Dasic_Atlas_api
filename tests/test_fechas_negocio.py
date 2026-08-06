"""La fecha de negocio no es la de UTC.

Bug encontrado el 2026-08-05, y encontrado por accidente: una prueba del aging
empezó a fallar sola al pasar de las 18:00 hora de CDMX. La causa era que el
servicio resolvía "hoy" con `datetime.utcnow().date()`, mientras el servidor
corre en UTC y el negocio opera en CDMX (UTC−6/−5). Cada tarde, a partir de
las 18:00 locales, el backend creía que ya era el día siguiente:

- un cargo que vencía hoy se marcaba `vencido` esa misma tarde,
- el aging desplazaba cargos a un tramo más viejo antes de tiempo,
- y las cotizaciones vencían un día antes de lo pactado.

Ninguno falla ruidosamente, y por eso llevaba ahí sin que nadie lo notara.

Probar esto de forma determinista es lo difícil: comparar contra UTC solo
falla durante parte del día. La salida es configurar zonas con un desfase
enorme —Kiritimati (UTC+14) y Niue (UTC−11) están a 25 horas, así que **nunca**
comparten fecha— y verificar que la función respeta la zona configurada.
"""
import importlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core import fechas


def _recargar_con_zona(monkeypatch, zona):
    monkeypatch.setenv("BUSINESS_TIMEZONE", zona)
    return importlib.reload(fechas)


@pytest.fixture(autouse=True)
def _restaurar_modulo():
    """El módulo lee la zona al importarse, así que hay que devolverlo a su
    estado original o el resto de la suite hereda la zona de la última prueba."""
    yield
    importlib.reload(fechas)


def test_usa_la_zona_configurada_y_no_utc(monkeypatch):
    lejos = _recargar_con_zona(monkeypatch, "Pacific/Kiritimati")  # UTC+14
    esperado = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    assert lejos.hoy_negocio() == esperado


def test_dos_zonas_opuestas_dan_dias_distintos(monkeypatch):
    """25 horas de separación: sus fechas nunca coinciden. Si la función
    ignorara la zona y devolviera UTC, ambas darían lo mismo y esto fallaría."""
    adelante = _recargar_con_zona(monkeypatch, "Pacific/Kiritimati").hoy_negocio()
    atras = _recargar_con_zona(monkeypatch, "Pacific/Niue").hoy_negocio()
    assert adelante != atras


def test_el_default_es_la_zona_de_operacion(monkeypatch):
    monkeypatch.delenv("BUSINESS_TIMEZONE", raising=False)
    mod = importlib.reload(fechas)
    assert mod.ZONA_NEGOCIO == "America/Mexico_City"
    assert mod.hoy_negocio() == datetime.now(ZoneInfo("America/Mexico_City")).date()


def test_ahora_negocio_trae_zona(monkeypatch):
    mod = _recargar_con_zona(monkeypatch, "America/Mexico_City")
    assert mod.ahora_negocio().tzinfo is not None


def test_una_zona_inexistente_no_tumba_la_app(monkeypatch):
    """Si la imagen no trae tzdata o alguien escribe mal la variable, se
    degrada a UTC —el comportamiento anterior— en vez de reventar al arrancar."""
    mod = _recargar_con_zona(monkeypatch, "No/Existe")
    assert mod.hoy_negocio() is not None


# ---------------------------------------------------------------------------
# Rango del día
# ---------------------------------------------------------------------------
def test_el_rango_del_dia_se_ancla_en_la_zona_del_negocio(monkeypatch):
    """El error sutil: fijar los límites a medianoche UTC de una fecha local.

    Para CDMX eso hace que "hoy" abarque de las 18:00 de ayer a las 17:59 de
    hoy, así que un recordatorio de la tarde cae en el día siguiente. Los
    límites tienen que llevar el desfase de la zona, no el de UTC.
    """
    mod = _recargar_con_zona(monkeypatch, "America/Mexico_City")
    inicio, fin = mod.rango_del_dia()

    assert inicio.utcoffset() is not None, "el límite no lleva zona"
    assert inicio.utcoffset() != timedelta(0), "el límite quedó anclado en UTC"
    assert inicio.hour == 0 and inicio.minute == 0
    assert fin.hour == 23 and fin.minute == 59


def test_el_rango_cubre_el_dia_completo_y_nada_mas(monkeypatch):
    mod = _recargar_con_zona(monkeypatch, "America/Mexico_City")
    inicio, fin = mod.rango_del_dia()

    # Casi 24 h exactas (el fin es 23:59:59.999999).
    duracion = fin - inicio
    assert timedelta(hours=23, minutes=59) < duracion < timedelta(days=1)
    assert inicio.date() == fin.date() == mod.hoy_negocio()


def test_acepta_un_dia_explicito(monkeypatch):
    from datetime import date as _date

    mod = _recargar_con_zona(monkeypatch, "America/Mexico_City")
    inicio, fin = mod.rango_del_dia(_date(2026, 3, 15))
    assert inicio.date() == fin.date() == _date(2026, 3, 15)
