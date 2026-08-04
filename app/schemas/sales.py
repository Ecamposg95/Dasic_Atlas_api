"""
Sales schemas: OrdenVenta, DetalleOrden.
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, model_validator

from app.models.enums import EstatusOrden
from app.schemas.clients import ClienteResponse
from app.schemas.catalog import ProductoInfo


class DetalleOrdenCreate(BaseModel):
    producto_id: Optional[int] = None
    # Servicio del catálogo (tabla servicios). Cuando viene, tipo_linea debe
    # ser "servicio_catalogo".
    servicio_id: Optional[int] = None
    cantidad: Decimal = Field(..., gt=0)
    # Unidad comercial snapshot (de UnidadMedida.abreviatura o texto libre).
    # Igual que marca/claves SAT: se copia al guardar para que renombrar una
    # unidad en el catálogo no reescriba cotizaciones históricas.
    unidad: Optional[str] = Field(default=None, max_length=20)
    utilidad: Decimal = Field(default=Decimal("0"), ge=0, lt=100)
    descuento: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    # Descuento del proveedor a Dasic (reduce costo OC). Independiente del
    # `descuento` arriba (que es el descuento al cliente). Match Excel H6.
    descuento_proveedor: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    moneda_origen: Optional[str] = Field(default=None, min_length=3, max_length=3)
    # Productos fantasma / servicios ad-hoc
    sku_libre: Optional[str] = Field(default=None, max_length=80)
    descripcion_libre: Optional[str] = Field(default=None)
    costo_unitario: Optional[Decimal] = Field(default=None, ge=0)
    # Tipo de línea: producto_catalogo / producto_fantasma / servicio (ad-hoc) /
    # servicio_catalogo (vinculado a Servicio).
    tipo_linea: Optional[str] = Field(default="producto_catalogo", max_length=20)
    proveedor_sugerido_id: Optional[int] = None
    # Tiempo de entrega por línea (rango + unidad). Los 3 viajan juntos o
    # ninguno; min <= max. Se valida en model_validator.
    entrega_min: Optional[int] = Field(default=None, ge=0)
    entrega_max: Optional[int] = Field(default=None, ge=0)
    entrega_unidad: Optional[Literal["dias", "semanas"]] = None
    # Nota libre por línea: productos similares manuales u observaciones
    # específicas para esta línea (no aplica a toda la cotización).
    observaciones_linea: Optional[str] = Field(default=None, max_length=1000)
    # Homologación fantasma (US-008): marca + claves SAT + notas del fantasma.
    # Se capturan en el modal de fantasma y alimentan el upsert del pool y el
    # snapshot SAT de la línea. `observaciones` aquí es nota del fantasma
    # (distinta de `observaciones_linea`, que es nota de esta línea concreta).
    marca: Optional[str] = Field(default=None, max_length=80)
    marca_id: Optional[int] = None
    clave_prod_serv: Optional[str] = Field(default=None, max_length=8)
    clave_unidad_sat: Optional[str] = Field(default=None, max_length=10)
    observaciones: Optional[str] = Field(default=None)
    # US-013/014: checkbox por producto que controla si la marca sale en el PDF.
    mostrar_marca: bool = False

    @model_validator(mode="after")
    def _validar_entrega(self) -> "DetalleOrdenCreate":
        # T.E.S.P.V. (Salvo Previa Venta) NO es una unidad: es un sufijo
        # del PDF que aplica siempre que hay tiempo de entrega capturado.
        # Las únicas unidades válidas son 'dias' y 'semanas'.
        provistos = [
            self.entrega_min is not None,
            self.entrega_max is not None,
            self.entrega_unidad is not None,
        ]
        if any(provistos) and not all(provistos):
            raise ValueError(
                "entrega_min, entrega_max y entrega_unidad deben venir los 3 o ninguno"
            )
        if all(provistos) and self.entrega_min > self.entrega_max:
            raise ValueError("entrega_min no puede ser mayor que entrega_max")
        return self


class DetalleOrdenResponse(BaseModel):
    producto: Optional[ProductoInfo] = None
    servicio_id: Optional[int] = None
    sku_libre: Optional[str] = None
    descripcion_libre: Optional[str] = None
    moneda_origen_linea: Optional[str] = None
    costo_base_linea: Optional[Decimal] = None
    cantidad: Decimal
    unidad: Optional[str] = None
    precio_unitario: Decimal
    utilidad_aplicada: Decimal
    descuento_aplicado: Decimal
    descuento_proveedor_aplicado: Optional[Decimal] = None
    subtotal: Decimal
    tipo_linea: Optional[str] = "producto_catalogo"
    proveedor_sugerido_id: Optional[int] = None
    entrega_min: Optional[int] = None
    entrega_max: Optional[int] = None
    entrega_unidad: Optional[str] = None
    observaciones_linea: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class OrdenVentaCreate(BaseModel):
    cliente_id: int
    contacto_id: Optional[int] = None
    detalles: List[DetalleOrdenCreate] = Field(..., min_length=1, max_length=500)
    observaciones: Optional[str] = None
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    # Modelo TC Excel V_03 (2026-05-23): tipo_cambio se reinterpreta como
    # "DOF" oficial. Los otros 2 son los TCs efectivos por dirección de
    # conversión. Si frontend no los manda, backend deriva DOF±tolerancia_tc.
    tipo_cambio: Optional[Decimal] = Field(default=None, gt=0)
    tc_mn_a_usd: Optional[Decimal] = Field(default=None, gt=0)
    tc_usd_a_mn: Optional[Decimal] = Field(default=None, gt=0)
    # Tolerancia simétrica del spread DOF±X. Rango 0.1-1.0 (step 0.1 en UI).
    # Default 1.0 → comportamiento legacy preservado.
    tolerancia_tc: Optional[Decimal] = Field(
        default=Decimal("1.0"), ge=Decimal("0.1"), le=Decimal("1.0")
    )
    # Fechas editables: el editor de borradores puede sobreescribir la fecha
    # de creación y la fecha de vencimiento de la cotización.
    fecha_creacion: Optional[datetime] = None
    fecha_vencimiento: Optional[datetime] = None
    # Bloque editable de Condiciones Comerciales. None → backend aplica
    # defaults. Vacío "" → usuario eligió no tener condiciones (PDF muestra
    # solo metadata: moneda, vigencia).
    terminos_condiciones: Optional[str] = None
    # PDF unificado (sub-proyecto D). 0 = desglose por línea (default); 1 = concepto único.
    pdf_unificado: Optional[int] = 0
    concepto_unificado: Optional[str] = None


class OrdenVentaResponse(BaseModel):
    id: int
    folio: str
    fecha_creacion: datetime
    fecha_vencimiento: Optional[datetime] = None
    estatus: EstatusOrden
    moneda: str
    tipo_cambio: Decimal
    tc_mn_a_usd: Optional[Decimal] = None
    tc_usd_a_mn: Optional[Decimal] = None
    tolerancia_tc: Decimal = Decimal("1.0")
    total: Decimal
    vendedor_id: int
    cliente: ClienteResponse
    detalles: List[DetalleOrdenResponse]
    version: int = 1
    cotizacion_origen_id: Optional[int] = None
    observaciones: Optional[str] = None
    terminos_condiciones: Optional[str] = None
    pdf_unificado: Optional[int] = None
    concepto_unificado: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
