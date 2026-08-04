"""Generación de documentos de remisión (HTML para imprimir/PDF, .docx
editable) a partir de una plantilla en archivo — Task 8.

Extraído de `app/routers/remisiones.py` (router viejo, borrado en Task 7) y
de la plantilla inline `PDF_TEMPLATE_REMISION` que quedó provisionalmente en
`app/domains/remisiones/router.py`. El router v2 (Task 7) llama a
`render_html`/`render_word` — este módulo no conoce HTTP ni permisos, solo
`db` + `rem` ya resueltos y autorizados por el caller.

Branding: `config_service.empresa_nombre(db)` (Task 6) — configurable por
`PlatformConfig`, default "DASIC Industrial". Marca de agua "BORRADOR": el
HTML lleva un overlay superpuesto (`es_borrador` en el contexto de la
plantilla); el .docx no soporta overlays con python-docx, así que en su
lugar se antepone un prefijo visible "BORRADOR — SIN VALIDEZ" en el
subtítulo del documento (ver `_prefijo_borrador` más abajo).
"""
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from app import models
from app.services import config_service
from app.services.word_service import build_remision_docx

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR))

_MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _es_borrador(rem: models.Remision) -> bool:
    return rem.estado.value == models.EstadoRemision.BORRADOR.value


def _fecha_str(rem: models.Remision) -> str:
    fecha_base = rem.fecha_remision or getattr(rem, "creado_en", None)
    if not fecha_base:
        return "—"
    return f"{fecha_base.day} de {_MESES_ES[fecha_base.month - 1]} de {fecha_base.year}"


def _simbolo(rem: models.Remision) -> str:
    return "US$" if (rem.moneda or "").upper() == "USD" else "$"


def render_html(db: Session, rem: models.Remision) -> str:
    """Renderiza la remisión como HTML imprimible (`GET /{id}/imprimir`).

    Branding y marca de agua vienen del `db` — el template mismo no conoce
    ni `config_service` ni el estado, solo recibe el contexto ya resuelto.
    """
    template = _env.get_template("remision.html.j2")
    return template.render(
        rem=rem,
        empresa_nombre=config_service.empresa_nombre(db),
        es_borrador=_es_borrador(rem),
    )


def render_word(db: Session, rem: models.Remision) -> bytes:
    """Genera la remisión como .docx editable (`GET /{id}/word`).

    python-docx no soporta overlays tipo marca de agua — para un borrador,
    `build_remision_docx` antepone "BORRADOR — SIN VALIDEZ" al subtítulo en
    vez de superponer texto sobre el contenido (ver docstring del módulo).
    """
    return build_remision_docx(
        remision=rem,
        simbolo=_simbolo(rem),
        fecha_str=_fecha_str(rem),
        empresa_nombre=config_service.empresa_nombre(db),
        es_borrador=_es_borrador(rem),
    )
