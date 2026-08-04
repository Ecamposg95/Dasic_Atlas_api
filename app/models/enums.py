"""
Enums compartidos usados por múltiples dominios.
Importar desde aquí para evitar dependencias circulares.
"""

import enum
import logging

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)


class TolerantEnum(TypeDecorator):
    """Columna de enum que NO revienta al leer labels legacy de la DB.

    Contexto: `Column(Enum(MiEnum))` de SQLAlchemy valida el valor que viene
    de la DB contra los miembros del enum de Python en su capa de hidratación
    y lanza ``LookupError`` para cualquier label que no matchee un NOMBRE de
    miembro — SIN consultar ``MiEnum._missing_``. En esta base, la DB de
    producción (anterior a varias migraciones) puede tener labels legacy
    (minúsculas, valores viejos), por lo que ``db.query(OrdenVenta).all()``
    revienta con 500 en CUALQUIER endpoint que cargue una fila legacy
    (seguimiento, dashboard, reportes…), no solo en el reportado.

    Esta clase lee la columna como texto y coacciona en Python vía
    ``MiEnum(value)`` (que SÍ dispara ``_missing_``, tolerando minúsculas y
    valores viejos). Un label genuinamente desconocido degrada a ``None`` y se
    loguea, en vez de tirar el request. Al escribir, persiste el NOMBRE del
    miembro (p.ej. ``"COTIZACION"``) para alinearse con los labels que el enum
    nativo de PG ya tiene en producción.
    """

    impl = String(50)
    cache_ok = True

    def __init__(self, enumtype, *args, **kwargs):
        self._enumtype = enumtype
        super().__init__(*args, **kwargs)

    def _coerce(self, value):
        """Resuelve un valor (miembro o texto) al miembro del enum, matcheando
        por NOMBRE o por VALUE, case-insensitive. No depende de ``_missing_``
        (no todos los enums lo definen). Devuelve None si no matchea nada."""
        if isinstance(value, self._enumtype):
            return value
        raw = str(value).strip()
        for miembro in self._enumtype:
            if (
                raw == miembro.name
                or raw.lower() == miembro.name.lower()
                or raw.lower() == str(miembro.value).lower()
            ):
                return miembro
        return None

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        miembro = self._coerce(value)
        # Persistimos el NOMBRE canónico (uppercase) para alinear con los labels
        # que el enum nativo de PG ya tenía y con la normalización del backfill.
        if miembro is not None:
            return miembro.name
        return str(value)  # desconocido: persiste tal cual, no lo perdemos

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        miembro = self._coerce(value)
        if miembro is not None:
            return miembro
        logger.warning(
            "%s: label legacy desconocido '%s' en DB → None (fila tolerada)",
            self._enumtype.__name__,
            value,
        )
        return None


class RolUsuario(str, enum.Enum):
    SUPERADMIN = "superadmin"          # plataforma cross-tenant
    ADMINISTRADOR = "admin"            # admin del tenant
    GERENTE_COMERCIAL = "asistente"
    VENTAS = "vendedor"
    OPERATIVO = "operativo"            # rol genérico operativo (almacén/soporte)

    # Alias legacy para compatibilidad durante la transición RBAC.
    ADMIN = ADMINISTRADOR
    ASISTENTE = GERENTE_COMERCIAL
    VENDEDOR = VENTAS

    @classmethod
    def from_input(cls, value: "RolUsuario | str") -> "RolUsuario":
        if isinstance(value, cls):
            return value

        normalized = str(value).strip().lower()
        lookup = {
            "superadmin": cls.SUPERADMIN,
            "super_admin": cls.SUPERADMIN,
            "super-admin": cls.SUPERADMIN,
            "admin": cls.ADMINISTRADOR,
            "administrador": cls.ADMINISTRADOR,
            "asistente": cls.GERENTE_COMERCIAL,
            "gerente_comercial": cls.GERENTE_COMERCIAL,
            "gerente comercial": cls.GERENTE_COMERCIAL,
            "vendedor": cls.VENTAS,
            "ventas": cls.VENTAS,
            "operativo": cls.OPERATIVO,
            "operations": cls.OPERATIVO,
            "almacen": cls.OPERATIVO,
            "soporte": cls.OPERATIVO,
        }
        try:
            return lookup[normalized]
        except KeyError as exc:
            raise ValueError(f"Rol no soportado: {value}") from exc

    @property
    def api_value(self) -> str:
        return {
            RolUsuario.SUPERADMIN: "superadmin",
            RolUsuario.ADMINISTRADOR: "administrador",
            RolUsuario.GERENTE_COMERCIAL: "gerente_comercial",
            RolUsuario.VENTAS: "ventas",
            RolUsuario.OPERATIVO: "operativo",
        }[self]

    @property
    def is_admin_tier(self) -> bool:
        return self in {RolUsuario.SUPERADMIN, RolUsuario.ADMINISTRADOR}

    @property
    def is_operativo(self) -> bool:
        return self in {RolUsuario.GERENTE_COMERCIAL, RolUsuario.VENTAS, RolUsuario.OPERATIVO}


class EstatusOrden(str, enum.Enum):
    COTIZACION = "cotizacion"
    PENDIENTE = "pendiente"
    PAGADA = "pagada"
    CANCELADA = "cancelada"

    @classmethod
    def _missing_(cls, value):
        # Tolera valores legacy en la DB (mayúsculas, espacios) normalizando
        # a lowercase y matcheando por value o por nombre. Evita que un row
        # con estatus viejo tire queries enteras (.all()) que cargan OrdenVenta.
        if isinstance(value, str):
            v = value.strip().lower()
            for miembro in cls:
                if miembro.value == v or miembro.name.lower() == v:
                    return miembro
        return None


class EstadoRemision(str, enum.Enum):
    BORRADOR = "borrador"
    EMITIDA = "emitida"
    RECIBIDA = "recibida"
    CANCELADA = "cancelada"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            v = value.strip().lower()
            for miembro in cls:
                if miembro.value == v or miembro.name.lower() == v:
                    return miembro
        return None


class TipoMovimiento(str, enum.Enum):
    CARGO = "cargo"
    ABONO = "abono"


class TipoLineaCotizacion(str, enum.Enum):
    PRODUCTO_CATALOGO = "producto_catalogo"
    PRODUCTO_FANTASMA = "producto_fantasma"
    SERVICIO = "servicio"


class TipoMovimientoStock(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA = "salida"
    AJUSTE = "ajuste"
    RESERVA = "reserva"
    LIBERACION = "liberacion"
