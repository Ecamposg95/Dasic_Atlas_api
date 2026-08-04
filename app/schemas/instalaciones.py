"""Schemas Pydantic para base instalada (plantas y activos instalados)."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.instalaciones import ESTADOS_ACTIVO


def _validar_nombre(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("nombre no puede estar vacío")
    return v


def _validar_estado(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip().lower()
    if v not in ESTADOS_ACTIVO:
        raise ValueError(
            f"estado debe ser uno de: {', '.join(sorted(ESTADOS_ACTIVO))}"
        )
    return v


# ---------------------------------------------------------------------------
# Plantas
# ---------------------------------------------------------------------------
class PlantaCreate(BaseModel):
    nombre: str
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: str) -> str:
        return _validar_nombre(v)


class PlantaUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: Optional[str]) -> Optional[str]:
        return _validar_nombre(v)


class PlantaOut(BaseModel):
    id: int
    cliente_id: int
    nombre: str
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    notas: Optional[str] = None
    creado_en: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Activos instalados
# ---------------------------------------------------------------------------
class ActivoCreate(BaseModel):
    nombre: str
    planta_id: Optional[int] = None
    tipo: Optional[str] = None
    fabricante: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    ubicacion: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    garantia_hasta: Optional[date] = None
    estado: str = "operativo"
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: str) -> str:
        return _validar_nombre(v)

    @field_validator("estado")
    @classmethod
    def estado_valido(cls, v: str) -> str:
        return _validar_estado(v)


class ActivoUpdate(BaseModel):
    nombre: Optional[str] = None
    planta_id: Optional[int] = None
    tipo: Optional[str] = None
    fabricante: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    ubicacion: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    garantia_hasta: Optional[date] = None
    estado: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: Optional[str]) -> Optional[str]:
        return _validar_nombre(v)

    @field_validator("estado")
    @classmethod
    def estado_valido(cls, v: Optional[str]) -> Optional[str]:
        return _validar_estado(v)


class ActivoOut(BaseModel):
    id: int
    cliente_id: int
    planta_id: Optional[int] = None
    planta_nombre: Optional[str] = None  # resuelto con join en el router (sin N+1)
    nombre: str
    tipo: Optional[str] = None
    fabricante: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    ubicacion: Optional[str] = None
    fecha_instalacion: Optional[date] = None
    garantia_hasta: Optional[date] = None
    estado: str
    notas: Optional[str] = None
    creado_en: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
