> [!warning] DOCUMENTO HISTÓRICO — NO APLICA
> Blueprint de arranque (2026-04-13). Su modelo de datos y sus routers propuestos **nunca se implementaron así**: no existen `product_variants`, `warehouses`, `stock_items`, `price_lists` ni `product_prices`; el esquema real es en español (`productos`, `movimientos_stock`, `ordenes_venta`…) y los endpoints viven bajo `/api/*`. Tampoco existe la reserva de 48 h con expiración: las reservas se crean al guardar cotización y se liberan al cancelar/convertir. Sí sobrevive el rumbo estratégico (cotizar rápido con stock confiable, kardex, dashboard de KPIs).
> **Se conserva como registro de la visión y los KPIs originales de negocio.** Para el estado real ir a `docs/Atlas-ONE-Proyecto.md` y `context/02_REPO_CURRENT_STATE.md`.

---

# Blueprint: DASIC Sales-Stock Platform

**Version:** 0.1.0  
**Fecha:** 2026-04-13  
**Owner:** Atlas_Tech x DASIC  
**Propósito:** Blueprint base para iniciar el desarrollo de la plataforma comercial-operativa alineada a la estrategia de ventas y stock de DASIC 2025.

---

## 1. Alineación Estratégica

### Pilar: Proceso
- **Frameworks:** Lean Sales, Value Stream Mapping
- **Objetivos:** 
  - Reducir el tiempo de ciclo de cotización a menos de 10 minutos.
  - Estandarizar el flujo entre ventas y almacén.
  - Separar las responsabilidades de ventas y almacén.

### Pilar: Datos
- **Frameworks:** DDMRP, ABC-XYZ
- **Objetivos:** 
  - Una única fuente de la verdad para el stock.
  - Priorización de SKUs por impacto de ventas, riesgo de ruptura, stock muerto y calidad de datos.
  - Visibilidad semanal de rotación y antigüedad.

### Pilar: Tecnología
- **Frameworks:** FastAPI, PostgreSQL, Dashboard + Internal App + Quoter
- **Objetivos:** 
  - Stock en vivo para el equipo de ventas.
  - Cotización con lógica de reserva.
  - Dashboard ejecutivo con KPIs en tiempo real.

---

## 2. Alcance del Producto

| ID | Módulo | Prioridad | Objetivo | Features MVP |
|---|---|:---:|---|---|
| `inventory_core` | **Módulo de Stock** | 1 | Centralizar catálogo, almacenes, stock físico, reservado y disponible con trazabilidad. | Catálogo maestro, modelo de almacenes/ubicaciones, stock por SKU/almacén, Kardex, puntos de reorden, banderas críticas y de stock muerto. |
| `dashboard` | **Módulo de Dashboard** | 2 | Proveer visibilidad para gerencia y operaciones. | KPI precisión de inventario, SKUs críticos, antigüedad de stock muerto, tiempo de ciclo de cotizaciones, conflicto de stock, TOP marcas/SKUs inmovilizados. |
| `smart_quoter` | **Módulo Cotizador** | 3 | Acelerar cotizaciones con disponibilidad confiable y lógica de precios. | Búsqueda por SKU/marca, fotografía de disponibilidad al cotizar, sugerencia de precios, reserva de stock temporal (48h), versiones de cotización/PDF, pipeline de cotizaciones. |

---

## 3. Reglas de Negocio

### Modelo de Priorización de SKUs
Alineado a la estrategia DASIC para atención y replenishment:
- *Impacto comercial:* 35%
- *Riesgo de stock:* 30%
- *Riesgo de stock muerto:* 20%
- *Calidad de datos:* 15%

**Niveles:**
- **Nivel A:** Atención crítica inmediata para ventas.
- **Nivel B:** Control operativo / reposición.
- **Nivel C:** Monetización / liquidación.
- **Nivel D:** Monitoreo / limpieza de master data.

### Reglas de Cotización
1. **Nunca prometer stock no disponible.**
2. **Stock disponible** = Físico (`on_hand`) - Reservado (`reserved`).
3. Cotizaciones pueden **reservar stock por 48 horas**.
4. Las cotizaciones almacenan una **fotografía de costo y precio**.
5. Descuentos por debajo del margen mínimo requieren **autorización**.

---

## 4. Modelo de Datos (Core Entities)

1. **`brands`**: Catálogo de marcas.
2. **`categories`**: Catálogo de categorías.
3. **`products`**: Catálogo maestro por número de parte.
4. **`product_variants`**: Presentaciones comerciales a la venta.
5. **`warehouses`**: Almacenes y ubicaciones lógicas.
6. **`stock_items`**: Stock físico, reservado y disponible.
7. **`inventory_movements`**: Kardex y trazabilidad.
8. **`price_lists`**: Listas de precios comerciales (master).
9. **`product_prices`**: Precios por variante y canal.
10. **`product_costs`**: Historial de costos y referencia actual.
11. **`customers`**: Base de clientes.
12. **`quotes` / `quote_items` / `quote_versions`**: Cotizaciones, partidas y sus versiones estáticas.
13. **`users` / `roles`**: Usuarios y sus roles (Admin, Ventas, Almacén, Director).

---

## 5. Diseño de API Base

- **Stack:** FastAPI, PostgreSQL, SQLAlchemy 2.x, Alembic, JWT Auth, Pandas.
- **Routers MVP:**
  - `/products` (GET, POST, PATCH, Búsqueda)
  - `/inventory` (Stock, Críticos, Dead-stock, Movimientos, Kardex)
  - `/pricing` (Listas, Cálculo, Sugerencia de precios)
  - `/quotes` (Cotizar, Agregar ítems, Recalcular, Reservar stock, Generar PDF)
  - `/dashboard` (Resúmenes de inventario, cotizaciones, KPIs)

---

## 6. Roles y Necesidades

- **Director:** KPIs Ejecutivos, vista de antigüedad de stock, capital inmovilizado.
- **Ventas:** Cotización rápida, stock en vivo, funcionalidad de reserva, seguimiento de pipeline.
- **Almacén:** Captura de movimientos, ajustes de inventario, precisión de disponibilidad.
- **Admin:** Master data, reglas de precio, accesos y gobernanza de catálogo.

---

## 7. Roadmap Inicial de 90 Días

- **Pilar 1 (0-30 días) - Estabilizar la Base:** Limpieza de master de stock, importación inicial, schema/migraciones, APIs de inventario y definición de protocolo de cotización.
- **Pilar 2 (31-60 días) - Visibilidad Digital:** App interna de stock en vivo, Dashboard v1, lógica de reservas, listas de precios, capacitación de ventas.
- **Pilar 3 (61-90 días) - Optimizar y Escalar:** Pipeline de cotizaciones, reportes de stock muerto, alertas de reorden, base de integración con ERP/Facturación, KPIs gerenciales.

---

## 8. KPIs de Éxito a 6 Meses

| KPI | Baseline Actual | Target a 6 meses |
|---|---|---|
| Precisión de Inventario | ~60% | >=95% |
| Tiempo para cotizar | >45 min | <10 min |
| Conflictos de stock | ~30% | <3% |
| Stock muerto >90 días | Alto | <10% |
| Conversión de Cotizaciones | N/D | +25% |

---

## 9. Próximos pasos técnicos (Build Order)
1. Consolidar el esquema PostgreSQL.
2. Desarrollar el pipeline de importación (pandas/scripts) desde el maestro de stock actual.
3. Exponer endpoints de inventario.
4. Agregar el motor de precios y márgenes.
5. Desarrollar el cotizador con la lógica de reserva de 48 horas.
6. Construir el dashboard y la capa de KPIs.
