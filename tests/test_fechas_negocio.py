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
from datetime import datetime
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
