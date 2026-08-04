"""
Sales models: OrdenVenta, DetalleOrden.
"""

from sqlalchemy import Boolean, Column, DateTime, DECIMAL, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.enums import EstatusOrden, TolerantEnum


class OrdenVenta(Base):
    __tablename__ = "ordenes_venta"

    id = Column(Integer, primary_key=True, index=True)
    folio = Column(String(40), unique=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"))
    contacto_id = Column(Integer, ForeignKey("contactos.id"), nullable=True)
    vendedor_id = Column(Integer, ForeignKey("usuarios.id"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_vencimiento = Column(DateTime, nullable=True)

    estatus = Column(TolerantEnum(EstatusOrden), default=EstatusOrden.COTIZACION)
    moneda = Column(String(3), nullable=False, default="MXN")
    # Modelo TC Excel (V_03): tipo_cambio se reinterpreta como "DOF" (TC oficial
    # Banxico). tc_mn_a_usd y tc_usd_a_mn son los TCs efectivos POR DIRECCIÓN
    # (default DOF-tolerancia y DOF+tolerancia — el "spread" cubre riesgo
    # cambiario entre cotización y cobro). Si NULL al leer (cotizaciones
    # legacy), el SPA los deriva de tipo_cambio. La OC generation usa
    # tipo_cambio (DOF) puro, sin spread.
    tipo_cambio = Column(DECIMAL(12, 6), nullable=False, default=1.0)
    tc_mn_a_usd = Column(DECIMAL(12, 6), nullable=True)
    tc_usd_a_mn = Column(DECIMAL(12, 6), nullable=True)
    # Tolerancia simétrica del spread DOF±X (rango 0.1-1.0 validado en
    # Pydantic/Zod). Default 1.0 preserva el comportamiento legacy.
    tolerancia_tc = Column(DECIMAL(3, 2), nullable=False, default=1.0)
    total = Column(DECIMAL(12, 2), default=0.00)
    observaciones = Column(Text, nullable=True)
    # Bloque editable de Condiciones Comerciales del PDF. Una línea = un <li>.
    # NULL → el PDF usa el bloque hardcoded como fallback (compat con
    # cotizaciones legacy creadas antes de esta feature).
    terminos_condiciones = Column(Text, nullable=True)

    # Modo de presentación en el PDF cliente:
    #   0 (default) → desglose por línea (vista interna y default histórico)
    #   1            → un solo concepto unificado con todas las líneas en
    #                  una descripción multi-línea y un solo total final.
    pdf_unificado = Column(Integer, nullable=False, default=0)
    # Texto override del concepto principal cuando pdf_unificado=1.
    # NULL → auto-generado a partir de las líneas del carrito.
    concepto_unificado = Column(Text, nullable=True)

    # Versionado de cotizaciones
    cotizacion_origen_id = Column(Integer, ForeignKey("ordenes_venta.id"), nullable=True, index=True)
    version = Column(Integer, nullable=False, default=1)

    # Conversión remisión→cotización (Task 6, remisiones v2): si la cotización
    # nace de una remisión emitida/recibida, referencia su origen.
    remision_origen_id = Column(Integer, ForeignKey("remisiones.id"), nullable=True, index=True)

    # Lifecycle tracking — Fase Cotizador-Edicion (spec 2026-05-19)
    enviada_at = Column(DateTime(timezone=True), nullable=True, index=True)
    pdf_generado_at = Column(DateTime(timezone=True), nullable=True)
    actualizado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    cliente = relationship("Cliente", back_populates="ordenes")
    contacto = relationship("Contacto", foreign_keys=[contacto_id])
    vendedor = relationship("Usuario", back_populates="ventas")
    detalles = relationship(
        "DetalleOrden",
        back_populates="orden",
        cascade="all, delete-orphan",
    )
    versiones = relationship(
        "OrdenVenta",
        backref="cotizacion_origen",
        remote_side="OrdenVenta.id",
    )


class DetalleOrden(Base):
    __tablename__ = "detalles_orden"

    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("ordenes_venta.id"))
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=True)
    # Vínculo con catálogo de servicios persistibles (Servicio).
    # Cuando es no-null, tipo_linea = 'servicio_catalogo'.
    servicio_id = Column(Integer, ForeignKey("servicios.id"), nullable=True, index=True)

    # Productos fantasma o servicios ad-hoc: si producto_id y servicio_id
    # son ambos NULL, usar estos campos.
    sku_libre = Column(String(80), nullable=True)
    # Text (no length cap): para productos fantasma / servicios ad-hoc el usuario
    # pega descripciones reales del fabricante que rebasan 255 chars con facilidad.
    descripcion_libre = Column(Text, nullable=True)
    moneda_origen_linea = Column(String(3), nullable=True)
    costo_base_linea = Column(DECIMAL(12, 2), nullable=True)
    # Snapshot SAT por línea (US-006/008): se copia al guardar la cotización,
    # de Producto para catálogo y del modal para fantasma. Los PDFs renderizan
    # desde aquí para quedar estables ante cambios posteriores del catálogo.
    clave_prod_serv = Column(String(8), nullable=True)
    clave_unidad_sat = Column(String(10), nullable=True)
    # Marca por línea (US-013/014): snapshot de la marca (de Producto para
    # catálogo, del modal para fantasma) + flag por producto que controla si
    # la marca se concatena en el PDF. mostrar_marca default False.
    marca = Column(String(80), nullable=True)
    mostrar_marca = Column(Boolean, nullable=False, server_default=text("false"))

    cantidad = Column(Numeric(12, 3), nullable=False)
    unidad = Column(String(20), nullable=True)
    precio_unitario = Column(DECIMAL(10, 2), nullable=False)
    utilidad_aplicada = Column(DECIMAL(10, 2), default=0.00)
    descuento_aplicado = Column(DECIMAL(10, 2), default=0.00)
    # Descuento que el PROVEEDOR le da a Dasic (reduce costo OC). Match a
    # CotProveedor!H6 del Excel V_03. Independiente de `descuento_aplicado`
    # (que es el descuento al CLIENTE — match a N6). Default 0 = sin descuento
    # del proveedor.
    descuento_proveedor = Column(DECIMAL(5, 2), nullable=False, default=0)
    subtotal = Column(DECIMAL(12, 2), nullable=False)

    tipo_linea = Column(String(20), nullable=False, default="producto_catalogo")
    proveedor_sugerido_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    fantasma_id = Column(Integer, ForeignKey("productos_fantasma.id"), nullable=True, index=True)

    # Tiempos de entrega por línea (estructurado). Los 3 viajan juntos: o
    # vienen los 3 o ninguno. unidad ∈ {'dias','semanas','tespv'}. min <= max
    # cuando aplica (NULL para tespv). Defaults NULL — los captura el usuario.
    entrega_min = Column(Integer, nullable=True)
    entrega_max = Column(Integer, nullable=True)
    entrega_unidad = Column(String(10), nullable=True)

    # Nota libre por línea: el vendedor captura productos similares o
    # comentarios que se imprimen en el PDF bajo el nombre del producto.
    # Mientras el stock no esté bien definido para sugerir similares
    # automáticamente, esto reemplaza al motor de "productos relacionados".
    observaciones_linea = Column(Text, nullable=True)

    orden = relationship("OrdenVenta", back_populates="detalles")
    producto = relationship("Producto", back_populates="detalles_orden")
    servicio = relationship("Servicio", foreign_keys=[servicio_id])
    proveedor_sugerido = relationship("Proveedor", foreign_keys=[proveedor_sugerido_id])
