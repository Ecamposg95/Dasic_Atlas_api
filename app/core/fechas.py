"""Fecha de negocio: el día del calendario en la zona donde opera la empresa.

`datetime.utcnow().date()` devuelve el día en UTC, no el del negocio. El
servidor corre en Railway (UTC) y la operación es en CDMX (UTC−6/−5), así que
**a partir de las 18:00 hora local el backend ya cree que es mañana**. Eso no
falla ruidosamente: simplemente

- un cargo que vence hoy se marca `vencido` esa misma tarde,
- el aging desplaza los cargos un tramo antes de tiempo,
- y las cotizaciones vencen un día antes de lo pactado.

Es el mismo defecto que `web/src/lib/fechas.ts` corrige del lado del
navegador; este es su espejo en el servidor. Cualquier decisión sobre un
**día del calendario** debe pasar por aquí. Para un **instante** (auditoría,
timestamps) lo correcto sigue siendo UTC: ahí el punto es justamente
normalizar, y `datetime.now(timezone.utc)` es la forma adecuada.
"""
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Configurable por si el tenant opera en otra zona (la vía SaaS de
# `platform_config`); el default es donde opera DASIC.
ZONA_NEGOCIO = os.getenv("BUSINESS_TIMEZONE", "America/Mexico_City")


def _tz() -> ZoneInfo | None:
    try:
        return ZoneInfo(ZONA_NEGOCIO)
    except (ZoneInfoNotFoundError, ValueError):
        # Imagen sin tzdata: se degrada a UTC en vez de tumbar la app. Es el
        # comportamiento que ya había, no una regresión nueva.
        return None


def ahora_negocio() -> datetime:
    """`datetime` con zona, en la hora del negocio."""
    tz = _tz()
    return datetime.now(tz) if tz else datetime.utcnow()


def hoy_negocio() -> date:
    """Día del calendario donde opera la empresa."""
    return ahora_negocio().date()
