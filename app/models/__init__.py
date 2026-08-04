"""
ORM models — re-export central.

Import de aquí para compatibilidad con el código existente.
Modelos organizados por dominio:

  enums.py      → RolUsuario, EstatusOrden, TipoMovimiento
  users.py      → Usuario
  catalog.py    → Producto, Promocion, Marca
  clients.py    → Cliente, Proveedor
  finance.py    → TransaccionCliente, TransaccionProveedor
  sales.py      → OrdenVenta, DetalleOrden
  purchases.py  → OrdenCompra, DetalleCompra
  quote_events.py → QuoteEvent
"""

from app.db import Base  # noqa: F401

from app.models.enums import (  # noqa: F401
    RolUsuario,
    EstatusOrden,
    TipoMovimiento,
    TipoLineaCotizacion,
    TipoMovimientoStock,
)
from app.models.users import Usuario  # noqa: F401
from app.models.catalog import Producto, Promocion, Marca  # noqa: F401
from app.models.clients import Cliente, Contacto, Proveedor, ClienteMergeLog, NotaEmpresa  # noqa: F401
from app.models.finance import (  # noqa: F401
    TransaccionCliente,
    TransaccionProveedor,
)
from app.models.sales import OrdenVenta, DetalleOrden  # noqa: F401
from app.models.purchases import OrdenCompra, DetalleCompra  # noqa: F401
from app.models.quote_events import QuoteEvent  # noqa: F401
from app.models.inventory import MovimientoStock  # noqa: F401
from app.models.fx import TipoCambioDia  # noqa: F401
from app.models.expenses import Gasto  # noqa: F401
from app.models.plantillas import PlantillaCotizacion  # noqa: F401
from app.models.sat import (  # noqa: F401
    SatFormaPago,
    SatMetodoPago,
    SatUsoCfdi,
    SatRegimenFiscal,
    SatObjetoImp,
    SatImpuesto,
    SatTipoFactor,
    SatTasaOCuota,
    SatMoneda,
    SatTipoDeComprobante,
    SatClaveProdServ,
    SatClaveUnidad,
)
from app.models.services import (  # noqa: F401
    Servicio,
    CategoriaServicio,
    UnidadTiempoServicio,
    SERVICIO_SAT_DEFAULT_PROD_SERV,
    SERVICIO_SAT_DEFAULT_UNIDAD,
    SERVICIO_SAT_DEFAULT_OBJETO_IMP,
)
from app.models.fantasmas import ProductoFantasma  # noqa: F401
from app.models.precios import PrecioProveedor  # noqa: F401
from app.models.remisiones import Remision, DetalleRemision  # noqa: F401
from app.models.enums import EstadoRemision  # noqa: F401
from app.models.reportes_servicio import ReporteServicio  # noqa: F401
from app.models.platform import PlatformConfig  # noqa: F401
from app.models.crm import Pipeline, PipelineStage, Deal, DealActividad  # noqa: F401
from app.models.recordatorios import Recordatorio  # noqa: F401

__all__ = [
    "Base",
    "RolUsuario", "EstatusOrden", "TipoMovimiento",
    "TipoLineaCotizacion", "TipoMovimientoStock",
    "Usuario",
    "Producto", "Promocion", "Marca",
    "Cliente", "Contacto", "Proveedor", "ClienteMergeLog", "NotaEmpresa",
    "TransaccionCliente", "TransaccionProveedor",
    "OrdenVenta", "DetalleOrden",
    "OrdenCompra", "DetalleCompra",
    "QuoteEvent",
    "MovimientoStock",
    "TipoCambioDia",
    "Gasto",
    "PlantillaCotizacion",
    "SatFormaPago", "SatMetodoPago", "SatUsoCfdi", "SatRegimenFiscal",
    "SatObjetoImp", "SatImpuesto", "SatTipoFactor", "SatTasaOCuota",
    "SatMoneda", "SatTipoDeComprobante",
    "SatClaveProdServ", "SatClaveUnidad",
    "Servicio", "CategoriaServicio", "UnidadTiempoServicio",
    "SERVICIO_SAT_DEFAULT_PROD_SERV", "SERVICIO_SAT_DEFAULT_UNIDAD",
    "SERVICIO_SAT_DEFAULT_OBJETO_IMP",
    "ProductoFantasma",
    "PrecioProveedor",
    "Remision", "DetalleRemision", "EstadoRemision",
    "ReporteServicio",
    "PlatformConfig",
    "Pipeline", "PipelineStage", "Deal", "DealActividad",
    "Recordatorio",
]
