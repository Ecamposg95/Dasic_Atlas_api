"""
Schemas — re-export central.

Organización por dominio:

  auth.py     → Token, TokenData, LoginRequest, UsuarioBase, UsuarioCreate, UsuarioResponse
  catalog.py  → Producto*, Promocion*, ProductoInfo
  clients.py  → Cliente*, Proveedor*
  finance.py  → Transaccion*
  sales.py    → OrdenVenta*, DetalleOrden*
"""

from app.schemas.auth import (  # noqa: F401
    Token,
    TokenData,
    LoginRequest,
    UsuarioBase,
    UsuarioCreate,
    UsuarioResponse,
)

from app.schemas.catalog import (  # noqa: F401
    ProductoBase,
    ProductoCreate,
    ProductoUpdate,
    ProductoResponseVendedor,
    ProductoResponseAdmin,
    ProductoInfo,
    PromocionBase,
    PromocionCreate,
    PromocionResponse,
    MarcaCreate,
    MarcaUpdate,
    MarcaResponse,
    UnidadMedidaCreate,
    UnidadMedidaUpdate,
    UnidadMedidaResponse,
)

from app.schemas.clients import (  # noqa: F401
    ClienteBase,
    ClienteCreate,
    ClienteUpdate,
    ClienteResponse,
    ProveedorBase,
    ProveedorCreate,
    ProveedorResponse,
    ContactoBase,
    ContactoCreate,
    ContactoUpdate,
    ContactoResponse,
    MergeEmpresasInput,
    NotaEmpresaCreate,
    NotaEmpresaResponse,
    BulkEstatusRequest,
)

from app.schemas.finance import (  # noqa: F401
    TransaccionCreate,
    TransaccionResponse,
)

from app.schemas.sales import (  # noqa: F401
    DetalleOrdenCreate,
    DetalleOrdenResponse,
    OrdenVentaCreate,
    OrdenVentaResponse,
)

from app.schemas.fx import TipoCambioDiaResponse  # noqa: F401
from app.schemas.inventory import (  # noqa: F401
    MovimientoStockResponse,
    AjusteManualIn,
    DisponibilidadResponse,
)

from app.schemas.sat import (  # noqa: F401
    SatFormaPagoResponse,
    SatMetodoPagoResponse,
    SatUsoCfdiResponse,
    SatRegimenFiscalResponse,
    SatObjetoImpResponse,
    SatImpuestoResponse,
    SatTipoFactorResponse,
    SatTasaOCuotaResponse,
    SatMonedaResponse,
    SatTipoComprobanteResponse,
    SatClaveProdServResponse,
    SatClaveUnidadResponse,
)

from app.schemas.services import (  # noqa: F401
    ServicioBase,
    ServicioCreate,
    ServicioUpdate,
    ServicioResponse,
)

from app.schemas.fantasmas import (  # noqa: F401
    ProductoFantasmaBase,
    ProductoFantasmaResponse,
    ProductoFantasmaUpdate,
    PromoverFantasmaInput,
)

from app.schemas.precios import (  # noqa: F401
    PrecioProveedorCreate,
    PrecioProveedorResponse,
)

from app.schemas.remisiones import (  # noqa: F401
    DetalleRemisionInput,
    RemisionCreate,
    RemisionResponse,
)

from app.schemas.reportes_servicio import (  # noqa: F401
    ReporteServicioCreate,
    ReporteServicioResponse,
)

from app.schemas.crm import (  # noqa: F401
    PipelineOut,
    StageOut,
    DealOut,
    DealCreate,
    DealUpdate,
    DealMove,
    ActividadCreate,
    ActividadOut,
    DealDetalleOut,
)

from app.schemas.recordatorios import (  # noqa: F401
    RecordatorioCreate,
    RecordatorioPosponer,
    RecordatorioOut,
)

__all__ = [
    # auth
    "Token", "TokenData", "LoginRequest",
    "UsuarioBase", "UsuarioCreate", "UsuarioResponse",
    # catalog
    "ProductoBase", "ProductoCreate", "ProductoUpdate",
    "ProductoResponseVendedor", "ProductoResponseAdmin", "ProductoInfo",
    "PromocionBase", "PromocionCreate", "PromocionResponse",
    "MarcaCreate", "MarcaUpdate", "MarcaResponse",
    "UnidadMedidaCreate", "UnidadMedidaUpdate", "UnidadMedidaResponse",
    # clients
    "ClienteBase", "ClienteCreate", "ClienteUpdate", "ClienteResponse",
    "ProveedorBase", "ProveedorCreate", "ProveedorResponse",
    "ContactoBase", "ContactoCreate", "ContactoUpdate", "ContactoResponse",
    "MergeEmpresasInput",
    "NotaEmpresaCreate", "NotaEmpresaResponse", "BulkEstatusRequest",
    # finance
    "TransaccionCreate", "TransaccionResponse",
    # sales
    "DetalleOrdenCreate", "DetalleOrdenResponse",
    "OrdenVentaCreate", "OrdenVentaResponse",
    # fx
    "TipoCambioDiaResponse",
    # inventory
    "MovimientoStockResponse", "AjusteManualIn", "DisponibilidadResponse",
    # sat
    "SatFormaPagoResponse", "SatMetodoPagoResponse", "SatUsoCfdiResponse",
    "SatRegimenFiscalResponse", "SatObjetoImpResponse", "SatImpuestoResponse",
    "SatTipoFactorResponse", "SatTasaOCuotaResponse", "SatMonedaResponse",
    "SatTipoComprobanteResponse", "SatClaveProdServResponse", "SatClaveUnidadResponse",
    # services
    "ServicioBase", "ServicioCreate", "ServicioUpdate", "ServicioResponse",
    # fantasmas
    "ProductoFantasmaBase", "ProductoFantasmaResponse", "ProductoFantasmaUpdate",
    "PromoverFantasmaInput",
    # precios
    "PrecioProveedorCreate", "PrecioProveedorResponse",
    # remisiones
    "DetalleRemisionInput", "RemisionCreate", "RemisionResponse",
    # reportes_servicio (documento hijo de OrdenVenta)
    "ReporteServicioCreate", "ReporteServicioResponse",
    # crm kanban
    "PipelineOut", "StageOut", "DealOut", "DealCreate", "DealUpdate", "DealMove",
    "ActividadCreate", "ActividadOut", "DealDetalleOut",
    # recordatorios
    "RecordatorioCreate", "RecordatorioPosponer", "RecordatorioOut",
]
