"""Tests de `app.services.formato.fmt_cantidad` — formato de cantidades en
documentos (PDF cotización/OC, Word, remisión HTML/.docx, reporte de servicio).

Regla documentada (display-only, el dato persistido NO cambia):
- entero exacto  -> sin decimales ("20.000" -> "20")
- fraccionario   -> máximo 2 decimales, sin ceros colgantes ("2.500" -> "2.5")
- 3 decimales significativos -> redondeo HALF_UP a 2 decimales SOLO para
  display ("2.755" -> "2.76"). Nunca se muestran 3 decimales.
"""
from decimal import Decimal

from app.services.formato import fmt_cantidad


def test_entero_exacto_sin_decimales():
    # Bug reportado: Numeric(12,3) imprimía "20.000".
    assert fmt_cantidad(Decimal("20.000")) == "20"
    assert fmt_cantidad(Decimal("20")) == "20"
    assert fmt_cantidad(Decimal("1.0")) == "1"


def test_fraccionario_maximo_dos_decimales_sin_ceros_colgantes():
    # Convención elegida: se quitan ceros colgantes ("2.5", no "2.50").
    assert fmt_cantidad(Decimal("2.500")) == "2.5"
    assert fmt_cantidad(Decimal("2.5")) == "2.5"
    assert fmt_cantidad(Decimal("2.75")) == "2.75"
    assert fmt_cantidad(Decimal("2.750")) == "2.75"


def test_tres_decimales_redondea_half_up_solo_display():
    # Caso extremo: 3 decimales significativos -> HALF_UP a 2 (solo display).
    assert fmt_cantidad(Decimal("2.755")) == "2.76"
    assert fmt_cantidad(Decimal("2.754")) == "2.75"
    assert fmt_cantidad(Decimal("0.005")) == "0.01"


def test_redondeo_que_cae_en_entero_no_muestra_decimales():
    assert fmt_cantidad(Decimal("2.999")) == "3"
    assert fmt_cantidad(Decimal("19.996")) == "20"


def test_nunca_tres_decimales():
    for raw in ("20.000", "2.500", "2.755", "0.001", "123.456"):
        rendered = fmt_cantidad(Decimal(raw))
        entero, _, frac = rendered.partition(".")
        assert len(frac) <= 2, f"{raw} -> {rendered} tiene más de 2 decimales"


def test_acepta_int_float_y_str():
    assert fmt_cantidad(20) == "20"
    assert fmt_cantidad(2.5) == "2.5"
    assert fmt_cantidad("20.000") == "20"
    assert fmt_cantidad("2.75") == "2.75"


def test_none_y_cero():
    assert fmt_cantidad(None) == "0"
    assert fmt_cantidad(0) == "0"
    assert fmt_cantidad(Decimal("0.000")) == "0"


def test_valor_no_numerico_es_defensivo():
    # No debe reventar el render de un documento por un dato corrupto.
    assert fmt_cantidad("N/A") == "N/A"
