"""Remision y DetalleRemision — comprobantes de entrega física."""

from sqlalchemy import Boolean, Column, DateTime, DECIMAL, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.enums import EstadoRemision, TolerantEnum


class Remision(Base):
    __tablename__ = "remisiones"

    id = Column(Integer, primary_key=True, index=True)
    folio = Column(String(40), unique=True, index=True)
    orden_venta_id = Column(Integer, ForeignKey("ordenes_venta.id"), nullable=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    fecha_remision = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    transportista = Column(String(150), nullable=True)
    recibido_por = Column(String(150), nullable=True)
    recibido_at = Column(DateTime(timezone=True), nullable=True)
    observaciones = Column(Text, nullable=True)
    moneda = Column(String(3), nullable=True)
    mostrar_precios = Column(Boolean, nullable=False, server_default=text("false"))
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    estado = Column(TolerantEnum(EstadoRemision), nullable=False,
                     server_default=text("'BORRADOR'"), index=True)
    emitida_at = Column(DateTime(timezone=True), nullable=True)
    emitida_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    cancelada_at = Column(DateTime(timezone=True), nullable=True)
    cancelada_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    motivo_cancelacion = Column(Text, nullable=True)
    sobre_entrega_autorizada_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    stock_descontado = Column(Boolean, nullable=False, server_default=text("false"))

    orden_venta = relationship("OrdenVenta", foreign_keys=[orden_venta_id])
    cliente = relationship("Cliente", foreign_keys=[cliente_id])
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    detalles = relationship("DetalleRemision", back_populates="remision", cascade="all, delete-orphan")


class DetalleRemision(Base):
    __tablename__ = "detalles_remision"

    id = Column(Integer, primary_key=True, index=True)
    remision_id = Column(Integer, ForeignKey("remisiones.id"), nullable=False, index=True)
    detalle_orden_id = Column(Integer, ForeignKey("detalles_orden.id"), nullable=True)
    descripcion = Column(Text, nullable=False)
    sku = Column(String(80), nullable=True)
    cantidad = Column(Integer, nullable=False)
    observaciones_linea = Column(Text, nullable=True)
    clave_unidad_sat = Column(String(10), nullable=True)
    precio_unitario = Column(DECIMAL(10, 2), nullable=True)
    subtotal = Column(DECIMAL(12, 2), nullable=True)

    remision = relationship("Remision", back_populates="detalles")
