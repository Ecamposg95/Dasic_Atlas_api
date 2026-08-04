"""
Base instalada: Planta y ActivoInstalado de clientes industriales.

Una Planta es una ubicación física del cliente (sitio/fábrica). Un
ActivoInstalado es un equipo instalado en el cliente, opcionalmente
asociado a una planta. Al borrar una planta se valida en el router que
no tenga activos (sin cascade a propósito).
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base

# Estados válidos de un activo instalado (validado en Pydantic).
ESTADOS_ACTIVO = {"operativo", "mantenimiento", "fuera_servicio", "baja"}


class Planta(Base):
    """Sitio/planta física de un cliente. Varias por cliente."""

    __tablename__ = "plantas"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False, index=True)
    nombre = Column(String(160), nullable=False)
    direccion = Column(String(300), nullable=True)
    ciudad = Column(String(120), nullable=True)
    notas = Column(Text, nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    cliente = relationship("Cliente")
    # Sin cascade: el router valida que la planta no tenga activos antes de borrar.
    activos = relationship("ActivoInstalado", back_populates="planta")


class ActivoInstalado(Base):
    """Equipo instalado en un cliente, opcionalmente ubicado en una planta."""

    __tablename__ = "activos_instalados"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False, index=True)
    planta_id = Column(Integer, ForeignKey("plantas.id"), nullable=True, index=True)
    nombre = Column(String(200), nullable=False)
    tipo = Column(String(80), nullable=True)
    fabricante = Column(String(120), nullable=True)
    modelo = Column(String(120), nullable=True)
    serie = Column(String(120), nullable=True)
    ubicacion = Column(String(200), nullable=True)
    fecha_instalacion = Column(Date, nullable=True)
    garantia_hasta = Column(Date, nullable=True)
    # operativo|mantenimiento|fuera_servicio|baja (validado en Pydantic)
    estado = Column(
        String(20), nullable=False, default="operativo", server_default=text("'operativo'")
    )
    notas = Column(Text, nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    cliente = relationship("Cliente")
    planta = relationship("Planta", back_populates="activos")
