"""Catálogo administrable de unidades de medida comerciales.

Las partidas (DetalleOrden/DetalleRemision) guardan la unidad como STRING
snapshot — igual que marca y claves SAT — para que renombrar una unidad no
reescriba documentos históricos.
"""
from sqlalchemy import Boolean, Column, Integer, String, text

from app.db import Base


class UnidadMedida(Base):
    __tablename__ = "unidades_medida"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(40), nullable=False, unique=True)
    abreviatura = Column(String(20), nullable=False)
    activa = Column(Boolean, nullable=False, server_default=text("true"))
    orden = Column(Integer, nullable=False, server_default=text("0"))
