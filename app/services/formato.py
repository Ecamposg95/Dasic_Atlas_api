"""Helpers de formato para documentos generados (PDF, Word, HTML imprimible).

`fmt_cantidad` existe porque `cantidad` migró a `Numeric(12,3)` y los
`Decimal` empezaron a imprimirse como "20.000" en cotizaciones, remisiones,
OCs y reportes. Regla de display acordada:

- entero exacto  -> sin decimales: ``20.000 -> "20"``
- fraccionario   -> máximo 2 decimales, sin ceros colgantes:
  ``2.500 -> "2.5"``, ``2.75 -> "2.75"``
- redondeo HALF_UP **solo para display** en el caso extremo de 3 decimales
  significativos: ``2.755 -> "2.76"`` (el dato persistido no cambia).

Nunca se muestran 3 decimales. Esto es solo presentación: no usar para
cálculos ni para serialización JSON de la API (contrato aparte).
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

__all__ = ["fmt_cantidad"]


def fmt_cantidad(valor) -> str:
    """Formatea una cantidad (Decimal/int/float/str) para documentos."""
    if valor is None:
        return "0"
    if isinstance(valor, Decimal):
        d = valor
    elif isinstance(valor, int):  # incluye bool, irrelevante en la práctica
        return str(int(valor))
    else:
        try:
            d = Decimal(str(valor))
        except (InvalidOperation, ValueError):
            # Valor no numérico (defensivo): se devuelve tal cual.
            return str(valor)
    d = d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if d == d.to_integral_value():
        return str(int(d))
    # normalize() quita ceros colgantes (2.50 -> 2.5); format "f" evita
    # notación científica.
    return format(d.normalize(), "f")
