"""
User model.
"""

from sqlalchemy import Boolean, Column, Integer, String
from sqlalchemy.orm import relationship

from app.db import Base
from app.models.enums import RolUsuario, TolerantEnum


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    rol = Column(TolerantEnum(RolUsuario), default=RolUsuario.VENTAS)
    activo = Column(Boolean, default=True)

    ventas = relationship("OrdenVenta", back_populates="vendedor")
