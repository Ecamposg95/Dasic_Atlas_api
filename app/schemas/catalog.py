"""
Catalog schemas: Producto, Promocion.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class ProductoBase(BaseModel):
    sku: Optional[str] = Field(None, max_length=50)
    sku_comercial: Optional[str] = Field(None, min_length=2, max_length=80)
    nombre: str = Field(..., min_length=2, max_length=150)
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    # marca (texto) y marca_id (FK) coexisten. Si vienen ambos, marca_id gana.
    # Si solo viene marca (texto) y matchea case-insensitive una fila de
    # `marcas`, el backend autocompleta marca_id.
    marca: Optional[str] = Field(None, max_length=80)
    marca_id: Optional[int] = None
    unidad: Optional[str] = Field("PZA", max_length=20)
    proveedor_principal_id: Optional[int] = None
    proveedor_alterno_id: Optional[int] = None
    tiempo_entrega_dias: int = Field(7, ge=0)
    es_servicio: bool = False
    stock_minimo: int = Field(5, ge=0)
    moneda_compra: str = Field("MXN", min_length=3, max_length=3)
    precio_publico: Optional[Decimal] = Field(None, ge=0)
    precio_mayorista: Decimal = Field(default=Decimal("0"), ge=0)
    precio_distribuidor: Decimal = Field(default=Decimal("0"), ge=0)
    # SAT (CFDI 4.0) — opcionales hasta que se vaya a facturar.
    clave_prod_serv: Optional[str] = Field(None, max_length=8)
    clave_unidad_sat: Optional[str] = Field(None, max_length=10)
    objeto_imp: Optional[str] = Field(None, max_length=2)
    descripcion_fiscal: Optional[str] = None
    # Clasificación interna. El SKU interno (`sku`) ya es la abreviatura
    # y el catálogo del fabricante vive en `sku_comercial`.
    categoria: Optional[str] = Field(None, max_length=80)


class ProductoCreate(ProductoBase):
    stock_actual: int = Field(0, ge=0)
    costo_compra: Decimal = Field(..., ge=0)


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    sku: Optional[str] = Field(None, max_length=50)
    sku_comercial: Optional[str] = Field(None, min_length=2, max_length=80)
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    marca: Optional[str] = Field(None, max_length=80)
    marca_id: Optional[int] = None
    unidad: Optional[str] = Field(None, max_length=20)
    proveedor_principal_id: Optional[int] = None
    proveedor_alterno_id: Optional[int] = None
    tiempo_entrega_dias: Optional[int] = Field(None, ge=0)
    es_servicio: Optional[bool] = None
    moneda_compra: Optional[str] = Field(None, min_length=3, max_length=3)
    precio_publico: Optional[Decimal] = Field(None, ge=0)
    precio_mayorista: Optional[Decimal] = Field(None, ge=0)
    precio_distribuidor: Optional[Decimal] = Field(None, ge=0)
    costo_compra: Optional[Decimal] = Field(None, ge=0)
    stock_minimo: Optional[int] = Field(None, ge=0)
    stock_actual: Optional[int] = Field(None, ge=0)
    # SAT + clasificación
    clave_prod_serv: Optional[str] = Field(None, max_length=8)
    clave_unidad_sat: Optional[str] = Field(None, max_length=10)
    objeto_imp: Optional[str] = Field(None, max_length=2)
    descripcion_fiscal: Optional[str] = None
    categoria: Optional[str] = Field(None, max_length=80)


class ProductoResponseVendedor(ProductoBase):
    id: int
    stock_actual: int
    model_config = ConfigDict(from_attributes=True)


class ProductoResponseAdmin(ProductoBase):
    id: int
    stock_actual: int
    costo_compra: Decimal
    model_config = ConfigDict(from_attributes=True)


class ProductoInfo(BaseModel):
    """Schema mini para referencias en detalles de orden."""
    id: int
    sku: str
    nombre: str
    model_config = ConfigDict(from_attributes=True)


class PromocionBase(BaseModel):
    nombre_promo: str
    descuento_porcentaje: int = Field(..., gt=0, le=100)
    fecha_inicio: datetime
    fecha_fin: datetime
    activa: bool = True


class PromocionCreate(PromocionBase):
    producto_id: int


class PromocionResponse(PromocionBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Marcas (taxonomía DASIC para SKU interno) ----------

class MarcaBase(BaseModel):
    abreviatura: str = Field(..., min_length=2, max_length=20)
    nombre: str = Field(..., min_length=2, max_length=150)
    categoria: Optional[str] = Field(None, max_length=150)


class MarcaCreate(MarcaBase):
    pass


class MarcaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=150)
    categoria: Optional[str] = Field(None, max_length=150)


class MarcaResponse(MarcaBase):
    id: int
    n_productos: int = 0
    siguiente_sku: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Unidades de medida (catálogo administrable) ----------

class UnidadMedidaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=40)
    abreviatura: str = Field(..., min_length=1, max_length=20)
    activa: bool = True
    orden: int = 0


class UnidadMedidaCreate(UnidadMedidaBase):
    pass


class UnidadMedidaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=40)
    abreviatura: Optional[str] = Field(None, min_length=1, max_length=20)
    activa: Optional[bool] = None
    orden: Optional[int] = None


class UnidadMedidaResponse(UnidadMedidaBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
