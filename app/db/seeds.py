"""
Database seeding.

Single-tenant: solo crea el usuario administrador inicial si la tabla está vacía.

También aplica DDL idempotente para columnas/tablas nuevas, como puente
entre instancias en producción que arrancan sin correr `alembic upgrade head`
(el Procfile sólo levanta uvicorn). Las migraciones siguen siendo la
fuente de verdad para entornos limpios.
"""

import json
import logging
from pathlib import Path

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app import models
from app.schemas import UsuarioCreate
from app.services import UserService

logger = logging.getLogger(__name__)

MARCA_TAXONOMY_FILE = Path(__file__).resolve().parent.parent / "data" / "marca_abreviaturas.json"


# DDL idempotente: cada sentencia debe ser segura de re-ejecutar.
# Solo agregar entradas para cambios que YA viven en migrations/versions/.
_BACKFILL_DDL = [
    # 20260430_01: cotizador robusto
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS proveedor_principal_id INTEGER REFERENCES proveedores(id)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS proveedor_alterno_id INTEGER REFERENCES proveedores(id)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS tiempo_entrega_dias INTEGER NOT NULL DEFAULT 7",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN NOT NULL DEFAULT false",
    "CREATE INDEX IF NOT EXISTS ix_productos_proveedor_principal_id ON productos (proveedor_principal_id)",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS tipo_linea VARCHAR(20) NOT NULL DEFAULT 'producto_catalogo'",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS proveedor_sugerido_id INTEGER REFERENCES proveedores(id)",
    # 20260429_02: marca + unidad
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS marca VARCHAR(80)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS unidad VARCHAR(20) DEFAULT 'PZA'",
    "CREATE INDEX IF NOT EXISTS ix_productos_marca ON productos (marca)",
    # 20260430_02: RBAC owner scoping para clientes
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS creado_por_id INTEGER REFERENCES usuarios(id)",
    "CREATE INDEX IF NOT EXISTS ix_clientes_creado_por_id ON clientes (creado_por_id)",
    # 20260430_03 (no migration formal): gastos.moneda
    "ALTER TABLE IF EXISTS gastos ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'MXN'",
    # plantillas_cotizacion (create_all la genera; este DDL es seguro idempotente)
    """CREATE TABLE IF NOT EXISTS plantillas_cotizacion (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        descripcion TEXT,
        usuario_id INTEGER REFERENCES usuarios(id),
        lineas TEXT NOT NULL DEFAULT '[]',
        creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS ix_plantillas_cotizacion_usuario_id ON plantillas_cotizacion (usuario_id)",
    # 20260510_01: tabla de marcas (taxonomía DASIC + SKU prefix)
    """CREATE TABLE IF NOT EXISTS marcas (
        id SERIAL PRIMARY KEY,
        abreviatura VARCHAR(20) NOT NULL UNIQUE,
        nombre VARCHAR(150) NOT NULL,
        categoria VARCHAR(150),
        creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_marcas_abreviatura ON marcas (abreviatura)",
    # 20260512_03: FK Producto.marca_id → marcas.id (SET NULL en delete)
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS marca_id INTEGER REFERENCES marcas(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_productos_marca_id ON productos (marca_id)",
    # 20260513_01: tiempos de entrega por línea (sin CHECK aquí; CHECK solo en migración formal)
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS entrega_min INTEGER",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS entrega_max INTEGER",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS entrega_unidad VARCHAR(10)",
    # 20260513_02: términos y condiciones editables por cotización
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS terminos_condiciones TEXT",
    # 20260515_01: nota libre por línea (productos similares manuales)
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS observaciones_linea TEXT",

    # ====================================================================
    # Fase 1 — Catálogos SAT chicos (10 tablas; las masivas viven aparte).
    # Producción: create_all() ya las crea desde el metadata. Estas líneas
    # son redundantes pero garantizan idempotencia si create_all falla.
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS sat_forma_pago (
        codigo VARCHAR(3) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        vigencia_desde DATE,
        vigencia_hasta DATE,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_metodo_pago (
        codigo VARCHAR(3) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        vigencia_desde DATE,
        vigencia_hasta DATE,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_uso_cfdi (
        codigo VARCHAR(5) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        vigencia_desde DATE,
        vigencia_hasta DATE,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_regimen_fiscal (
        codigo VARCHAR(3) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        aplica_persona_fisica BOOLEAN NOT NULL DEFAULT false,
        aplica_persona_moral BOOLEAN NOT NULL DEFAULT false,
        activo BOOLEAN NOT NULL DEFAULT true,
        vigencia_desde DATE,
        vigencia_hasta DATE,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_objeto_imp (
        codigo VARCHAR(2) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_impuesto (
        codigo VARCHAR(3) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        aplica_traslado BOOLEAN NOT NULL DEFAULT false,
        aplica_retencion BOOLEAN NOT NULL DEFAULT false,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_tipo_factor (
        codigo VARCHAR(10) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_tasa_o_cuota (
        id_local VARCHAR(30) PRIMARY KEY,
        impuesto VARCHAR(3) NOT NULL,
        tipo_factor VARCHAR(10) NOT NULL,
        valor NUMERIC(7,6) NOT NULL,
        descripcion TEXT NOT NULL,
        es_retencion BOOLEAN NOT NULL DEFAULT false,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_moneda (
        codigo VARCHAR(3) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        decimales VARCHAR(2) NOT NULL DEFAULT '2',
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_tipo_comprobante (
        codigo VARCHAR(2) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_clave_prodserv (
        codigo VARCHAR(8) PRIMARY KEY,
        descripcion TEXT NOT NULL,
        palabras_clave TEXT,
        incluir_iva_basico BOOLEAN NOT NULL DEFAULT true,
        vigencia_desde DATE,
        vigencia_hasta DATE,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    """CREATE TABLE IF NOT EXISTS sat_clave_unidad (
        codigo VARCHAR(3) PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        simbolo VARCHAR(20),
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",

    # ====================================================================
    # Fase 2 — Producto: campos SAT + clasificación interna
    # `abreviatura` y `catalogo_fabricante` fueron eliminados en
    # 20260517_01 (duplicaban `sku` y `sku_comercial`). Los drops están
    # más abajo en este array para que Railway los aplique.
    # ====================================================================
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS clave_prod_serv VARCHAR(8)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS clave_unidad_sat VARCHAR(10)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS objeto_imp VARCHAR(2)",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS descripcion_fiscal TEXT",
    "ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(80)",
    "CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos (categoria)",
    "CREATE INDEX IF NOT EXISTS ix_productos_clave_prod_serv ON productos (clave_prod_serv)",

    # ====================================================================
    # Fase 3 — Servicios (catálogo)
    # create_all() debería crear la tabla; este DDL la garantiza.
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS servicios (
        id SERIAL PRIMARY KEY,
        organization_id VARCHAR(36),
        codigo VARCHAR(30) NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        categoria_servicio VARCHAR(40),
        costo NUMERIC(12,2) NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
        tiempo_estimado NUMERIC(8,2),
        unidad_tiempo VARCHAR(10),
        clave_prod_serv VARCHAR(8) NOT NULL DEFAULT '81111500',
        clave_unidad_sat VARCHAR(10) NOT NULL DEFAULT 'E48',
        objeto_imp VARCHAR(2) DEFAULT '02',
        descripcion_fiscal TEXT,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_por_id INTEGER REFERENCES usuarios(id),
        creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_servicios_org_codigo ON servicios (organization_id, codigo)",
    "CREATE INDEX IF NOT EXISTS ix_servicios_activo ON servicios (activo)",
    "CREATE INDEX IF NOT EXISTS ix_servicios_categoria ON servicios (categoria_servicio)",
    "CREATE INDEX IF NOT EXISTS ix_servicios_nombre ON servicios (nombre)",

    # ====================================================================
    # Fase 4 — DetalleOrden.servicio_id FK
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_detalles_orden_servicio_id ON detalles_orden (servicio_id)",

    # ====================================================================
    # Fase 5 — DetalleCompra: producto_id nullable + fantasma + moneda
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_compra ALTER COLUMN producto_id DROP NOT NULL",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS sku_libre VARCHAR(80)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS descripcion_libre VARCHAR(255)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS moneda_origen_linea VARCHAR(3)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS costo_base_linea NUMERIC(12,2)",

    # ====================================================================
    # Fase 6 — CRM: créditos en Cliente + CxC formal en TransaccionCliente
    # ====================================================================
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0",
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS dias_credito INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS dia_corte INTEGER",
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS moneda_credito VARCHAR(3) NOT NULL DEFAULT 'MXN'",
    "ALTER TABLE IF EXISTS transacciones_clientes ADD COLUMN IF NOT EXISTS orden_venta_id INTEGER REFERENCES ordenes_venta(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_tx_cli_orden_venta ON transacciones_clientes (orden_venta_id)",
    "ALTER TABLE IF EXISTS transacciones_clientes ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE",
    "ALTER TABLE IF EXISTS transacciones_clientes ADD COLUMN IF NOT EXISTS estatus_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente'",
    "ALTER TABLE IF EXISTS transacciones_clientes ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2) NOT NULL DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS ix_tx_cli_estatus_pago ON transacciones_clientes (estatus_pago)",

    # ====================================================================
    # 20260517_01 — drop columnas redundantes (abreviatura, catalogo_fabricante)
    # Idempotente: si ya no existen, no-op. Si existen con datos, primero
    # copiamos a sku_comercial cuando aplica para no perder info del usuario.
    # El UPDATE se envuelve en un bloque PL/pgSQL que primero verifica
    # `information_schema.columns` — así DBs frescas (Railway) que nunca
    # tuvieron la columna no spamean WARNINGs en cada boot.
    # ====================================================================
    """DO $$
       BEGIN
         IF EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_name = 'productos'
              AND column_name = 'catalogo_fabricante'
         ) THEN
           UPDATE productos
              SET sku_comercial = catalogo_fabricante
            WHERE catalogo_fabricante IS NOT NULL
              AND catalogo_fabricante <> ''
              AND (sku_comercial IS NULL OR sku_comercial = '');
         END IF;
       END $$""",
    "DROP INDEX IF EXISTS ix_productos_abreviatura",
    "DROP INDEX IF EXISTS ix_productos_catalogo_fabricante",
    "ALTER TABLE IF EXISTS productos DROP COLUMN IF EXISTS abreviatura",
    "ALTER TABLE IF EXISTS productos DROP COLUMN IF EXISTS catalogo_fabricante",

    # ====================================================================
    # 20260517_02 — detalles_orden.descripcion_libre VARCHAR(255) → TEXT
    # Líneas fantasma/servicio reciben descripciones reales que rebasan 255.
    # Idempotente: ALTER TYPE TEXT cuando ya es TEXT es no-op en Postgres.
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_orden ALTER COLUMN descripcion_libre TYPE TEXT",

    # ====================================================================
    # 20260519_01 — cotizador edición + TC override
    # Spec 2026-05-19 — edit timestamps en ordenes_venta + nota/actualizado_por
    # en tipos_cambio_dia. FK constraint se gestiona solo en la migración Alembic.
    # ====================================================================
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS enviada_at TIMESTAMP WITH TIME ZONE NULL",
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS pdf_generado_at TIMESTAMP WITH TIME ZONE NULL",
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()",
    "CREATE INDEX IF NOT EXISTS ix_ordenes_venta_enviada_at ON ordenes_venta(enviada_at)",
    "ALTER TABLE IF EXISTS tipos_cambio_dia ADD COLUMN IF NOT EXISTS nota TEXT NULL",
    "ALTER TABLE IF EXISTS tipos_cambio_dia ADD COLUMN IF NOT EXISTS actualizado_por INTEGER NULL",

    # ====================================================================
    # 20260519_02 — sub-proyecto B: Productos Fantasma apilados
    # ====================================================================
    "CREATE TABLE IF NOT EXISTS productos_fantasma (id SERIAL PRIMARY KEY, descripcion_normalizada VARCHAR(500) NOT NULL, descripcion_original TEXT NOT NULL, sku_libre VARCHAR(80), costo_referencia NUMERIC(12, 2) NOT NULL, moneda_referencia VARCHAR(3) NOT NULL DEFAULT 'MXN', proveedor_sugerido_id INTEGER REFERENCES proveedores(id), estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', promovido_a_producto_id INTEGER REFERENCES productos(id), veces_solicitado INTEGER NOT NULL DEFAULT 1, creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), ultimo_visto_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS ix_productos_fantasma_descripcion ON productos_fantasma(descripcion_normalizada)",
    "CREATE INDEX IF NOT EXISTS ix_productos_fantasma_estado ON productos_fantasma(estado)",
    "CREATE INDEX IF NOT EXISTS ix_productos_fantasma_sku ON productos_fantasma(sku_libre)",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS fantasma_id INTEGER REFERENCES productos_fantasma(id)",
    "CREATE INDEX IF NOT EXISTS ix_detalles_orden_fantasma_id ON detalles_orden(fantasma_id)",

    # ====================================================================
    # 20260520_01 — sub-proyecto D: PDF unificado por proyecto
    # ====================================================================
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS pdf_unificado INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS concepto_unificado TEXT NULL",

    # ====================================================================
    # 20260520_02 — sub-proyecto E: comparador precios
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS precios_proveedor (id SERIAL PRIMARY KEY, proveedor_id INTEGER NOT NULL REFERENCES proveedores(id), producto_id INTEGER REFERENCES productos(id), descripcion_busqueda VARCHAR(500), sku_libre VARCHAR(80), precio NUMERIC(12,2) NOT NULL, moneda VARCHAR(3) NOT NULL DEFAULT 'MXN', fecha_vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE, fecha_vigencia_hasta DATE, notas TEXT, fuente VARCHAR(20) NOT NULL DEFAULT 'MANUAL', referencia_oc_id INTEGER REFERENCES ordenes_compra(id), creado_por_id INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW())""",
    "CREATE INDEX IF NOT EXISTS ix_precios_proveedor_proveedor_id ON precios_proveedor(proveedor_id)",
    "CREATE INDEX IF NOT EXISTS ix_precios_proveedor_producto_id ON precios_proveedor(producto_id)",
    "CREATE INDEX IF NOT EXISTS ix_precios_proveedor_descripcion ON precios_proveedor(descripcion_busqueda)",
    "CREATE INDEX IF NOT EXISTS ix_precios_proveedor_sku ON precios_proveedor(sku_libre)",

    # ====================================================================
    # 20260520_03 — sub-proyecto F: remisiones
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS remisiones (
        id SERIAL PRIMARY KEY,
        folio VARCHAR(40) UNIQUE,
        orden_venta_id INTEGER NOT NULL REFERENCES ordenes_venta(id),
        fecha_remision TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        transportista VARCHAR(150),
        recibido_por VARCHAR(150),
        recibido_at TIMESTAMP WITH TIME ZONE,
        observaciones TEXT,
        creado_por_id INTEGER REFERENCES usuarios(id),
        creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_remisiones_orden_venta_id ON remisiones(orden_venta_id)",
    """CREATE TABLE IF NOT EXISTS detalles_remision (
        id SERIAL PRIMARY KEY,
        remision_id INTEGER NOT NULL REFERENCES remisiones(id),
        detalle_orden_id INTEGER REFERENCES detalles_orden(id),
        descripcion TEXT NOT NULL,
        sku VARCHAR(80),
        cantidad INTEGER NOT NULL,
        observaciones_linea TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS ix_detalles_remision_remision_id ON detalles_remision(remision_id)",

    # ====================================================================
    # 20260523_01 — Modelo TC Excel V_03: tc_mn_a_usd + tc_usd_a_mn
    # tipo_cambio se reinterpreta como "DOF" oficial; los otros 2 son los
    # TCs efectivos por dirección de conversión (default DOF±1 peso, spread
    # que cubre riesgo cambiario entre cotización y cobro). OC al proveedor
    # usa tipo_cambio (DOF) puro.
    # ====================================================================
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS tc_mn_a_usd NUMERIC(12, 6)",
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS tc_usd_a_mn NUMERIC(12, 6)",
    # Backfill total para cotizaciones legacy. Idempotente vía COALESCE +
    # WHERE: ya seteados no se tocan, y el GREATEST evita negativos cuando
    # tipo_cambio < 1 (poco probable pero defensivo).
    """UPDATE ordenes_venta
          SET tc_mn_a_usd = COALESCE(tc_mn_a_usd, GREATEST(tipo_cambio - 1, 0.000001)),
              tc_usd_a_mn = COALESCE(tc_usd_a_mn, tipo_cambio + 1)
        WHERE tc_mn_a_usd IS NULL OR tc_usd_a_mn IS NULL""",

    # ====================================================================
    # 20260524_01 — descuento_proveedor en detalles_orden (Excel V_03 H6).
    # Separa el descuento al cliente (descuento_aplicado, N6) del descuento
    # del proveedor a Dasic (descuento_proveedor, H6). Filas existentes
    # quedan con 0 — semánticamente equivalente al comportamiento anterior.
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS descuento_proveedor NUMERIC(5, 2) NOT NULL DEFAULT 0",

    # ====================================================================
    # 20260525_01 — reportes_servicio (acta de servicio ejecutado).
    # Documento hijo de OrdenVenta análogo a remisiones, pero para líneas
    # de tipo `servicio_catalogo`. Una cot con líneas servicio puede
    # generar 1+ reportes (uno por intervención del técnico).
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS reportes_servicio (
        id SERIAL PRIMARY KEY,
        folio VARCHAR(40) UNIQUE,
        orden_venta_id INTEGER NOT NULL REFERENCES ordenes_venta(id),
        fecha_reporte TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        tecnico_nombre VARCHAR(150),
        cliente_recibe_nombre VARCHAR(150),
        recibido_at TIMESTAMP WITH TIME ZONE,
        observaciones TEXT,
        creado_por_id INTEGER REFERENCES usuarios(id),
        creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_reportes_servicio_orden_venta_id ON reportes_servicio(orden_venta_id)",
    "CREATE INDEX IF NOT EXISTS ix_reportes_servicio_folio ON reportes_servicio(folio)",

    # ====================================================================
    # 20260526_01 — tolerancia_tc: spread configurable del TC USD/MXN
    # Reemplaza el ±1 hardcoded por valor configurable por cotización
    # (rango efectivo 0.1-1.0 validado en Pydantic/Zod). Postgres backfilea
    # filas existentes con 1.0 vía server_default → comportamiento previo.
    # ====================================================================
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS tolerancia_tc NUMERIC(3,2) NOT NULL DEFAULT 1.0",

    # ====================================================================
    # 20260601_01 — EPIC 02 / Spec (a): homologación fantasma + snapshot SAT
    # en línea. Homologa productos_fantasma con producto (marca + claves SAT +
    # observaciones) y guarda snapshot SAT por línea para PDFs estables.
    # Todas NULL → filas existentes intactas.
    # ====================================================================
    "ALTER TABLE IF EXISTS productos_fantasma ADD COLUMN IF NOT EXISTS marca VARCHAR(80)",
    "ALTER TABLE IF EXISTS productos_fantasma ADD COLUMN IF NOT EXISTS marca_id INTEGER REFERENCES marcas(id) ON DELETE SET NULL",
    "ALTER TABLE IF EXISTS productos_fantasma ADD COLUMN IF NOT EXISTS clave_prod_serv VARCHAR(8)",
    "ALTER TABLE IF EXISTS productos_fantasma ADD COLUMN IF NOT EXISTS clave_unidad_sat VARCHAR(10)",
    "ALTER TABLE IF EXISTS productos_fantasma ADD COLUMN IF NOT EXISTS observaciones TEXT",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS clave_prod_serv VARCHAR(8)",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS clave_unidad_sat VARCHAR(10)",

    # ====================================================================
    # 20260601_02 — EPIC 04 / US-013-014: snapshot de marca por línea +
    # flag mostrar_marca (checkbox por producto que controla si la marca
    # aparece en el PDF de cotización). mostrar_marca default FALSE → PDFs
    # existentes sin cambios.
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS marca VARCHAR(80)",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS mostrar_marca BOOLEAN NOT NULL DEFAULT FALSE",

    # ====================================================================
    # 20260601_03 — EPIC 06: creación de remisiones. Snapshot de precio/
    # unidad SAT por línea + moneda y toggle mostrar_precios por remisión.
    # ====================================================================
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS moneda VARCHAR(3)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS mostrar_precios BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE IF EXISTS detalles_remision ADD COLUMN IF NOT EXISTS clave_unidad_sat VARCHAR(10)",
    "ALTER TABLE IF EXISTS detalles_remision ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10,2)",
    "ALTER TABLE IF EXISTS detalles_remision ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2)",

    # ====================================================================
    # 20260601_04 — US-026/027: snapshot SAT/marca + recepción parcial en
    # líneas de OC. Todo aditivo.
    # ====================================================================
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS marca VARCHAR(80)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS clave_prod_serv VARCHAR(8)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS clave_unidad_sat VARCHAR(10)",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS cantidad_recibida INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE IF EXISTS detalles_compra ADD COLUMN IF NOT EXISTS fecha_recepcion TIMESTAMP WITH TIME ZONE",

    # ====================================================================
    # 20260601_05 — contactos (personas por empresa). Aditivo.
    # ====================================================================
    """CREATE TABLE IF NOT EXISTS contactos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        nombre VARCHAR(120) NOT NULL,
        cargo VARCHAR(80),
        email VARCHAR(120),
        telefono VARCHAR(40),
        es_principal BOOLEAN NOT NULL DEFAULT FALSE,
        creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_contactos_cliente_id ON contactos (cliente_id)",

    # 20260601_06 — contacto de la orden (sub-2). FK a contactos (creada en 05).
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS contacto_id INTEGER REFERENCES contactos(id)",

    # 20260602_05 — remisión libre (sin orden): cliente propio + orden nullable
    "ALTER TABLE IF EXISTS remisiones ALTER COLUMN orden_venta_id DROP NOT NULL",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",

    # 20260603_01 — audit log de fusión de empresas (Sub-3 dedup)
    "CREATE TABLE IF NOT EXISTS cliente_merge_log (id SERIAL PRIMARY KEY, survivor_id INTEGER, loser_id INTEGER, loser_nombre VARCHAR(150), loser_rfc VARCHAR(50), loser_saldo NUMERIC(12,2), n_ordenes INTEGER, n_transacciones INTEGER, n_remisiones INTEGER, n_contactos INTEGER, merged_by_id INTEGER, merged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())",

    # 20260603_02 — config de plataforma editable en runtime (consola super-admin)
    "CREATE TABLE IF NOT EXISTS platform_config (clave VARCHAR(60) PRIMARY KEY, valor TEXT, actualizado_por_id INTEGER, actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW())",

    # 20260608_01 — enum nativo → VARCHAR (TolerantEnum). El enum nativo de PG
    # (estatusorden / tipomovimiento) revienta la HIDRATACIÓN de SQLAlchemy con
    # `LookupError` ante cualquier label legacy (minúsculas / valores viejos),
    # tirando 500 en TODO endpoint que cargue la fila (no solo el reportado).
    # Convertimos a VARCHAR para que el `TolerantEnum` coaccione en Python sin
    # validación rígida de la DB, y normalizamos labels legacy → NOMBRE canónico
    # (UPPER) para que los filtros SQL por estatus sigan siendo correctos.
    # DROP DEFAULT defensivo: si la columna trae un default `'x'::estatusorden`,
    # el cambio de tipo fallaría; el default es Python-side, así que es seguro.
    "ALTER TABLE IF EXISTS ordenes_venta ALTER COLUMN estatus DROP DEFAULT",
    "ALTER TABLE IF EXISTS ordenes_venta ALTER COLUMN estatus TYPE VARCHAR(50) USING estatus::text",
    "UPDATE ordenes_venta SET estatus = UPPER(estatus) WHERE estatus IS NOT NULL AND estatus <> UPPER(estatus)",
    "ALTER TABLE IF EXISTS transacciones_clientes ALTER COLUMN tipo DROP DEFAULT",
    "ALTER TABLE IF EXISTS transacciones_clientes ALTER COLUMN tipo TYPE VARCHAR(50) USING tipo::text",
    "UPDATE transacciones_clientes SET tipo = UPPER(tipo) WHERE tipo IS NOT NULL AND tipo <> UPPER(tipo)",
    "ALTER TABLE IF EXISTS transacciones_proveedores ALTER COLUMN tipo DROP DEFAULT",
    "ALTER TABLE IF EXISTS transacciones_proveedores ALTER COLUMN tipo TYPE VARCHAR(50) USING tipo::text",
    "UPDATE transacciones_proveedores SET tipo = UPPER(tipo) WHERE tipo IS NOT NULL AND tipo <> UPPER(tipo)",

    # Empresas vista 360 (2026-06-08) — espejo de migración 20260608_02
    "ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS estatus VARCHAR(12) NOT NULL DEFAULT 'activo'",
    """CREATE TABLE IF NOT EXISTS notas_empresa (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        autor_id INTEGER REFERENCES usuarios(id),
        texto TEXT NOT NULL,
        creado_en TIMESTAMPTZ DEFAULT now()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_notas_empresa_cliente_id ON notas_empresa(cliente_id)",

    # 20260611_01 — recordatorio libre (sin orden): orden_id nullable + cliente_id propio
    "ALTER TABLE IF EXISTS recordatorios ALTER COLUMN orden_id DROP NOT NULL",
    "ALTER TABLE IF EXISTS recordatorios ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
    "CREATE INDEX IF NOT EXISTS ix_recordatorios_cliente_id ON recordatorios (cliente_id)",

    # 20260804_01 — CRM v2 detalle de oportunidad: campos extra en deals.
    # (deal_actividades es tabla nueva → la crea create_all, sin backfill.)
    "ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS probabilidad INTEGER",
    "ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS fecha_cierre_estimada DATE",
    "ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS proximo_paso VARCHAR(300)",
    "ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS notas TEXT",

    # 20260803_01: remisiones v2 estados
    # NOMBRE en mayúsculas (no el `value` lowercase): TolerantEnum persiste el
    # nombre del miembro al escribir vía ORM (ver
    # app/models/enums.py:TolerantEnum.process_bind_param) — mismo criterio
    # que la normalización UPPER de ordenes_venta.estatus (20260608_01, arriba).
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS emitida_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS emitida_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS cancelada_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS cancelada_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS sobre_entrega_autorizada_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT false",
    "CREATE INDEX IF NOT EXISTS ix_remisiones_estado ON remisiones (estado)",
    "UPDATE remisiones SET estado = CASE WHEN recibido_at IS NOT NULL THEN 'RECIBIDA' ELSE 'EMITIDA' END WHERE estado = 'BORRADOR' AND folio IS NOT NULL",
]


def run_backfill_ddl(db: Session) -> None:
    """Ejecuta DDL idempotente para columnas nuevas. Tolera errores individuales."""
    for stmt in _BACKFILL_DDL:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Backfill DDL skip (%s): %s", stmt[:80], exc)


def seed_super_admin(db: Session) -> None:
    """Crea el usuario administrador inicial si no existe ningún usuario."""
    if db.query(models.Usuario).first():
        logger.info("DASIC ERP online")
        return

    logger.info("Inicializando sistema DASIC ERP — creando administrador...")
    admin = UsuarioCreate(
        nombre="Administrador Principal",
        email="admin@dasic.mx",
        password="784512",
        rol=models.RolUsuario.SUPERADMIN,
        activo=True,
    )
    UserService.create_user(db, admin)
    logger.info("Admin creado: admin@dasic.mx")


def seed_dedicated_superadmin(db: Session) -> None:
    """Crea o promueve al superadmin dedicado definido por variables de entorno.

    Variables:
        SUPERADMIN_EMAIL    — email del superadmin (requerido; si falta, no-op).
        SUPERADMIN_PASSWORD — contraseña inicial (requerido; si falta, no-op).
        SUPERADMIN_NOMBRE   — nombre del usuario (opcional; default "Super Admin").

    Idempotente:
        - Si el usuario existe y ya es SUPERADMIN → no hace nada.
        - Si el usuario existe pero NO es SUPERADMIN → lo promueve (sin tocar password).
        - Si el usuario no existe → lo crea con bcrypt vía UserService.create_user.
    """
    import os

    email = (os.getenv("SUPERADMIN_EMAIL") or "").strip().lower()
    password = (os.getenv("SUPERADMIN_PASSWORD") or "").strip()
    nombre = (os.getenv("SUPERADMIN_NOMBRE") or "Super Admin").strip()

    if not email or not password:
        return

    try:
        u = db.query(models.Usuario).filter(func.lower(models.Usuario.email) == email).first()
        if u:
            if u.rol == models.RolUsuario.SUPERADMIN:
                return
            u.rol = models.RolUsuario.SUPERADMIN
            db.commit()
            logger.info("seed_dedicated_superadmin: usuario %s promovido a SUPERADMIN", email)
        else:
            UserService.create_user(
                db,
                UsuarioCreate(
                    nombre=nombre,
                    email=email,
                    password=password,
                    rol=models.RolUsuario.SUPERADMIN,
                    activo=True,
                ),
            )
            logger.info("seed_dedicated_superadmin: superadmin dedicado creado (%s)", email)
    except Exception as exc:
        db.rollback()
        logger.warning("seed_dedicated_superadmin: error al procesar env superadmin (%s): %s", email, exc)


def promote_superadmin_from_env(db: Session) -> None:
    """Promueve a SUPERADMIN el usuario cuyo email == BOOTSTRAP_SUPERADMIN_EMAIL.
    Idempotente. Para elevar un admin existente en prod sin auto-escalado por UI."""
    import os
    email = (os.getenv("BOOTSTRAP_SUPERADMIN_EMAIL") or "").strip().lower()
    if not email:
        return
    u = db.query(models.Usuario).filter(func.lower(models.Usuario.email) == email).first()
    if not u:
        logger.warning("BOOTSTRAP_SUPERADMIN_EMAIL=%s no coincide con ningún usuario", email)
        return
    if u.rol == models.RolUsuario.SUPERADMIN:
        return
    u.rol = models.RolUsuario.SUPERADMIN
    db.commit()
    logger.info("Usuario %s promovido a SUPERADMIN por BOOTSTRAP_SUPERADMIN_EMAIL", email)


def seed_marcas(db: Session) -> None:
    """Carga marca_abreviaturas.json en la tabla `marcas` si está vacía.

    Idempotente: solo inserta lo que no existe (por `abreviatura`). En
    re-arranques no toca filas existentes, así el CRUD desde la UI no se
    pierde aunque el JSON cambie.
    """
    if not MARCA_TAXONOMY_FILE.exists():
        return
    try:
        data = json.loads(MARCA_TAXONOMY_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("No se pudo leer marca_abreviaturas.json: %s", exc)
        return

    existentes = {m.abreviatura for m in db.query(models.Marca).all()}
    nuevas = 0
    for it in data.get("items", []):
        abrev = (it.get("abreviatura") or "").strip().upper()
        nombre = (it.get("marca") or "").strip()
        if not abrev or not nombre or abrev in existentes:
            continue
        db.add(models.Marca(
            abreviatura=abrev,
            nombre=nombre,
            categoria=(it.get("categoria") or "").strip() or None,
        ))
        existentes.add(abrev)
        nuevas += 1
    if nuevas:
        db.commit()
        logger.info("Sembradas %d marcas desde taxonomía DASIC.", nuevas)


def seed_sat_catalogos_pequenos(db: Session) -> None:
    """Siembra los 10 catálogos SAT chicos desde `app/data/sat/*`.

    Idempotente: usa `ON CONFLICT DO NOTHING` por código. Si el SAT actualiza
    una descripción, re-correr no la sobreescribe (preserva ediciones manuales
    si las hubiera). Para forzar refresh, vaciar la tabla antes del seed.
    """
    try:
        from app.data.sat import (
            FORMAS_PAGO, METODOS_PAGO, USOS_CFDI, REGIMENES_FISCALES,
            OBJETOS_IMP, IMPUESTOS, TIPOS_FACTOR, TASAS_O_CUOTAS,
            MONEDAS, TIPOS_COMPROBANTE,
        )
    except Exception as exc:
        logger.warning("No se pudo importar datos SAT (%s); skip seed SAT.", exc)
        return

    plan: list[tuple[str, str, list[tuple]]] = [
        (
            "sat_forma_pago",
            "INSERT INTO sat_forma_pago (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in FORMAS_PAGO],
        ),
        (
            "sat_metodo_pago",
            "INSERT INTO sat_metodo_pago (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in METODOS_PAGO],
        ),
        (
            "sat_uso_cfdi",
            "INSERT INTO sat_uso_cfdi (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in USOS_CFDI],
        ),
        (
            "sat_regimen_fiscal",
            "INSERT INTO sat_regimen_fiscal (codigo, descripcion, aplica_persona_fisica, aplica_persona_moral) "
            "VALUES (:codigo, :descripcion, :pf, :pm) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d, "pf": pf, "pm": pm} for (c, d, pf, pm) in REGIMENES_FISCALES],
        ),
        (
            "sat_objeto_imp",
            "INSERT INTO sat_objeto_imp (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in OBJETOS_IMP],
        ),
        (
            "sat_impuesto",
            "INSERT INTO sat_impuesto (codigo, descripcion, aplica_traslado, aplica_retencion) "
            "VALUES (:codigo, :descripcion, :tr, :re) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d, "tr": tr, "re": re} for (c, d, tr, re) in IMPUESTOS],
        ),
        (
            "sat_tipo_factor",
            "INSERT INTO sat_tipo_factor (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in TIPOS_FACTOR],
        ),
        (
            "sat_tasa_o_cuota",
            "INSERT INTO sat_tasa_o_cuota (id_local, impuesto, tipo_factor, valor, descripcion, es_retencion) "
            "VALUES (:id_local, :imp, :tf, :val, :desc, :ret) ON CONFLICT (id_local) DO NOTHING",
            [
                {"id_local": idl, "imp": imp, "tf": tf, "val": val, "desc": desc, "ret": ret}
                for (idl, imp, tf, val, desc, ret) in TASAS_O_CUOTAS
            ],
        ),
        (
            "sat_moneda",
            "INSERT INTO sat_moneda (codigo, descripcion, decimales) VALUES (:codigo, :descripcion, :dec) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d, "dec": str(dec)} for (c, d, dec) in MONEDAS],
        ),
        (
            "sat_tipo_comprobante",
            "INSERT INTO sat_tipo_comprobante (codigo, descripcion) VALUES (:codigo, :descripcion) ON CONFLICT (codigo) DO NOTHING",
            [{"codigo": c, "descripcion": d} for (c, d) in TIPOS_COMPROBANTE],
        ),
    ]

    total = 0
    for table_name, stmt, rows in plan:
        try:
            res = db.execute(text(stmt), rows)
            inserted = res.rowcount if res.rowcount and res.rowcount > 0 else 0
            db.commit()
            total += inserted
            if inserted:
                logger.info("SAT %s: %d filas insertadas.", table_name, inserted)
        except Exception as exc:
            db.rollback()
            logger.warning("SAT seed skip %s: %s", table_name, exc)

    if total == 0:
        logger.info("SAT catálogos chicos ya estaban completos.")


def seed_sat_clave_unidad(db: Session) -> None:
    """Siembra un set curado de claves de unidad SAT (idempotente). El catálogo
    completo requiere importer; esto da datos al dropdown de captura."""
    from app.data.sat.claves_unidad import CLAVE_UNIDAD_COMUNES

    existentes = {row[0] for row in db.query(models.SatClaveUnidad.codigo).all()}
    nuevos = 0
    for codigo, nombre in CLAVE_UNIDAD_COMUNES:
        if codigo in existentes:
            continue
        db.add(models.SatClaveUnidad(codigo=codigo, nombre=nombre, activo=True))
        nuevos += 1
    if nuevos:
        db.commit()
        logger.info("seed_sat_clave_unidad: %s claves de unidad sembradas", nuevos)


def seed_contactos_principal(db: Session) -> None:
    """Backfill idempotente: por cada Cliente con contacto_nombre y SIN contactos,
    crea un Contacto principal copiando nombre/email/telefono."""
    clientes = db.query(models.Cliente).all()
    creados = 0
    for c in clientes:
        if not (c.contacto_nombre or "").strip():
            continue
        existe = db.query(models.Contacto.id).filter(models.Contacto.cliente_id == c.id).first()
        if existe:
            continue
        db.add(models.Contacto(
            cliente_id=c.id,
            nombre=c.contacto_nombre.strip(),
            email=(c.email or None),
            telefono=(c.telefono or None),
            es_principal=True,
        ))
        creados += 1
    if creados:
        db.commit()
        logger.info("seed_contactos_principal: %s contactos principales creados", creados)


def seed_default_pipeline(db: Session) -> None:
    """Crea el pipeline 'Ventas' con 5 stages si no existe ninguno en la DB.

    Idempotente: si ya existe al menos un pipeline, no hace nada.
    El sistema es mono-tenant en la práctica (Usuario no tiene organization_id),
    así que el pipeline se crea con organization_id=None, consistente con cómo
    el router /api/crm crea los deals.
    """
    from app.models.crm import Pipeline, PipelineStage

    if db.query(Pipeline).first():
        return

    org_id = None

    pipeline = Pipeline(
        organization_id=org_id,
        nombre="Ventas",
        es_default=True,
    )
    db.add(pipeline)
    db.flush()  # necesitamos pipeline.id para las stages

    stages_def = [
        (1, "Prospecto",    False, False, "slate"),
        (2, "Cotizado",     False, False, "cyan"),
        (3, "Negociación",  False, False, "amber"),
        (4, "Ganado",       True,  False, "emerald"),
        (5, "Perdido",      False, True,  "rose"),
    ]
    for orden, nombre, es_ganado, es_perdido, color in stages_def:
        db.add(PipelineStage(
            organization_id=org_id,
            pipeline_id=pipeline.id,
            nombre=nombre,
            orden=orden,
            color=color,
            es_ganado=es_ganado,
            es_perdido=es_perdido,
        ))

    db.commit()
    logger.info("seed_default_pipeline: pipeline 'Ventas' con 5 stages creado.")


def run_all_seeds(db: Session) -> None:
    """Punto de entrada único para tareas de startup."""
    run_backfill_ddl(db)
    seed_super_admin(db)
    seed_dedicated_superadmin(db)
    promote_superadmin_from_env(db)
    seed_marcas(db)
    seed_sat_catalogos_pequenos(db)
    seed_sat_clave_unidad(db)
    seed_contactos_principal(db)
    seed_default_pipeline(db)
    logger.info("Startup completado correctamente.")
