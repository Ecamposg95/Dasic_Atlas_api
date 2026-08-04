"""Schemas Pydantic para el módulo CRM Kanban."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

# Tipos válidos de actividad en el timeline de un deal.
TIPOS_ACTIVIDAD = {"nota", "llamada", "email", "reunion", "visita", "sistema"}


def _validar_probabilidad(v: Optional[int]) -> Optional[int]:
    if v is not None and not (0 <= v <= 100):
        raise ValueError("probabilidad debe estar entre 0 y 100")
    return v


class PipelineOut(BaseModel):
    id: int
    organization_id: Optional[str] = None
    nombre: str
    es_default: bool
    creado_en: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class StageOut(BaseModel):
    id: int
    organization_id: Optional[str] = None
    pipeline_id: int
    nombre: str
    orden: int
    color: Optional[str] = None
    es_ganado: bool
    es_perdido: bool
    model_config = ConfigDict(from_attributes=True)


class DealOut(BaseModel):
    id: int
    organization_id: Optional[str] = None
    pipeline_id: int
    stage_id: int
    titulo: str
    cliente_id: Optional[int] = None
    orden_id: Optional[int] = None
    monto: Optional[Decimal] = None
    moneda: str
    owner_user_id: Optional[int] = None
    orden_en_stage: int
    probabilidad: Optional[int] = None
    fecha_cierre_estimada: Optional[date] = None
    proximo_paso: Optional[str] = None
    notas: Optional[str] = None
    creado_en: Optional[datetime] = None
    actualizado_en: Optional[datetime] = None
    cerrado_en: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class DealCreate(BaseModel):
    pipeline_id: int
    titulo: str
    stage_id: Optional[int] = None
    cliente_id: Optional[int] = None
    orden_id: Optional[int] = None
    monto: Optional[Decimal] = None
    moneda: str = "MXN"
    owner_user_id: Optional[int] = None
    probabilidad: Optional[int] = None
    fecha_cierre_estimada: Optional[date] = None
    proximo_paso: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("probabilidad")
    @classmethod
    def probabilidad_en_rango(cls, v: Optional[int]) -> Optional[int]:
        return _validar_probabilidad(v)


class DealUpdate(BaseModel):
    titulo: Optional[str] = None
    stage_id: Optional[int] = None
    cliente_id: Optional[int] = None
    orden_id: Optional[int] = None
    monto: Optional[Decimal] = None
    moneda: Optional[str] = None
    owner_user_id: Optional[int] = None
    orden_en_stage: Optional[int] = None
    probabilidad: Optional[int] = None
    fecha_cierre_estimada: Optional[date] = None
    proximo_paso: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("probabilidad")
    @classmethod
    def probabilidad_en_rango(cls, v: Optional[int]) -> Optional[int]:
        return _validar_probabilidad(v)


class DealMove(BaseModel):
    stage_id: int
    orden_en_stage: Optional[int] = None


class ActividadCreate(BaseModel):
    tipo: str
    descripcion: str

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in TIPOS_ACTIVIDAD:
            raise ValueError(
                f"tipo debe ser uno de: {', '.join(sorted(TIPOS_ACTIVIDAD))}"
            )
        return v

    @field_validator("descripcion")
    @classmethod
    def descripcion_no_vacia(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("descripcion no puede estar vacía")
        return v


class ActividadOut(BaseModel):
    id: int
    tipo: str
    descripcion: str
    usuario_id: Optional[int] = None
    usuario_nombre: Optional[str] = None
    creado_en: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class DealDetalleOut(DealOut):
    """DealOut + contexto resuelto (joins) + timeline de actividades."""

    stage_nombre: Optional[str] = None
    cliente_nombre: Optional[str] = None
    orden_folio: Optional[str] = None
    orden_estatus: Optional[str] = None
    orden_total: Optional[Decimal] = None
    owner_nombre: Optional[str] = None
    actividades: list[ActividadOut] = []
