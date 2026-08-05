# Inventario de módulos

> Auditoría Task Pack 00 · 2026-08-03 · **actualizada 2026-08-04**. Mapa: módulo en producción ↔ módulo objetivo Atlas Industrial Services. Conteo de endpoints verificado contra los decoradores `@router.*` (228 en total).

## Módulos en producción

| Módulo | Feature SPA | Router API (endpoints) | Estado |
|---|---|---|---|
| Dashboard | `dashboard` | `/api/dashboard` (7) — hero, pipeline, tendencia, alertas, tops, heatmap, kpis | ✅ Producción |
| CRM Pipeline (Kanban) | `crm` (+ detalle de deal) | `/api/crm` (14) — pipelines, board, **métricas de pipeline**, **CRUD de etapas**, deals CRUD+move, **detalle + actividades** | ✅ **CRM v2** |
| Cotizador | `cotizador` | `/api/ventas` (26) | ✅ Producción — corazón del sistema |
| Borradores | `borradores` | `/api/ventas/borradores` | ✅ |
| Seguimiento | `seguimiento` | `/api/ventas/historial` | ✅ |
| Recordatorios | `recordatorios` | `/api/recordatorios` (6) | ✅ Owner-scoped |
| Empresas (Clientes) | `clientes` (+ detalle, unificar, tabs Plantas/Activos) | `/api/clientes` (27) | ✅ Con maestro-detalle |
| **Base instalada** | tabs `PlantasTab` / `ActivosTab` dentro de `clientes` | `/api/clientes/{id}/plantas`, `/api/plantas/{id}`, `/api/clientes/{id}/activos`, `/api/activos/{id}` — `app/routers/plantas.py` (8) | ✅ **Nuevo** |
| Contactos | `contactos` | `/api/contactos` (2) + anidados en clientes | ✅ |
| Compras (OC) | `compras` | `/api/compras` (16) | ✅ |
| Fantasmas | `fantasmas` | `/api/fantasmas` (6) | ✅ |
| **Remisiones v2** | `remisiones` (editor híbrido + historial) | `/api/remisiones` (12) — **`app/domains/remisiones/router.py`** (Word + HTML imprimible) | ✅ **Ciclo de estados, entregas parciales, conversión a cotización** |
| Reportes de servicio | `reportes_servicio_docs` | `/api/reportes-servicio-docs` (5) | ✅ |
| Gastos | `gastos` | `/api/gastos` (5) | ✅ |
| Inventario | `inventario` | `/api/productos` (12) + `/api/inventario` (4) — kardex, reservas, import/export CSV, QR | ✅ |
| Servicios | `servicios` | `/api/servicios` (9) | ✅ |
| Precios proveedor | `precios` | `/api/precios` (4) | ✅ |
| Diccionarios | `catalogos` | `/api/catalogos` (15, incluye **catálogo `unidades_medida`**) + `/api/sat` (14 catálogos SAT) | ✅ |
| Cuentas por cobrar | `cxc` | `/api/cuentas-por-cobrar` (5) + endpoints en clientes | ✅ Aging + pago FIFO |
| Tipo de cambio | `fx` | `/api/fx` (4) | ✅ Banxico + override + **modelo direccional DOF±tolerancia** |
| Analítica/Reportes | `analitica` (envuelve `reportes` y `reportes_servicio`) | `/api/reportes` (10) | ✅ |
| Usuarios | `usuarios` | `/api/usuarios` (5) | ✅ |
| Consola super-admin | `superadmin` | `/api/superadmin` (7) + `/api/admin` (2) | ✅ Solo dev |
| Auth | `auth` | `/api/auth` (3) | ✅ Cookie HttpOnly |

## Mapa a módulos objetivo Atlas Industrial Services

| Módulo objetivo (Prompt Maestro) | Cobertura hoy | Gap |
|---|---|---|
| 1. Inicio / centro de trabajo | Dashboard KPIs + recordatorios | Franja ejecutiva accionable, agenda |
| 2. CRM industrial | Empresas + Contactos + notas + **plantas** + **actividades tipadas de deal** | Necesidades por planta |
| 3. Oportunidades | **Deals Kanban + vista de detalle + timeline `deal_actividades` + probabilidad / fecha de cierre estimada / próximo paso / notas + métricas de pipeline + CRUD de etapas** | Deal↔cotización **bidireccional** (hoy deal→cotización) |
| 4. Levantamientos técnicos | ❌ No existe | Modelo + captura en campo |
| 5. Cotizaciones / CPQ | Cotizador completo (multimoneda con TC direccional, versiones, plantillas, PDF/Word) | Aprobaciones por rol, alcance/exclusiones estructurados, CPQ por componentes |
| 6. Proyectos | ❌ No existe (lo más cercano: orden de venta + reporte de servicio) | Modelo Proyecto/Hitos/Tareas |
| 7. Órdenes de servicio | Parcial: `reportes_servicio_docs` (acta post-servicio) | Ciclo completo solicitud→programación→cierre |
| 8. Técnicos y agenda | ❌ No existe | Agenda, asignación |
| 9. Clientes/plantas/contactos | ✅ **Empresas + contactos + `plantas`** (nombre, dirección, ciudad, notas; N por cliente) | Contacto por planta |
| 10. Activos instalados | ✅ **Base mínima: `activos_instalados`** (tipo, fabricante, modelo, serie, ubicación, fecha de instalación, garantía, estado `operativo\|mantenimiento\|fuera_servicio\|baja`, planta opcional) | Historial de servicio por activo, jerarquía equipo/componente |
| 11. Equipos y componentes | Parcial (productos + activos instalados) | Jerarquía equipo/componente |
| 12. Inventarios | ✅ Completo (kardex, reservas, **unidades comerciales administrables**, cantidades `Numeric(12,3)`) | Multi-almacén |
| 13. Compras | ✅ OC desde cotización | Requisiciones |
| 14. Contratos y pólizas | ❌ No existe | Modelo completo |
| 15. Mantenimiento | ❌ No existe (los activos ya dan el ancla) | Planes preventivos |
| 16. Documentos | Parcial (PDF/Word/HTML por entidad; remisiones ya usa **plantilla en archivo** `templates/remision.html.j2`) | Repositorio documental; migrar el resto de plantillas inline |
| 17. Reportes | ✅ Analítica ventas/inventario/conversión/servicios + métricas de pipeline | Rentabilidad por proyecto |
| 18. Configuración | Parcial (`platform_config` vía `config_service`: IVA, vigencia, `empresa_nombre`, `stock_evento_descuento`) + **branding frontend por tenant (`lib/branding.ts`, `VITE_TENANT`)** | Config por tenant en backend |
| 19. Administración tenant | Consola superadmin (mono-tenant) | Tenant real, feature flags |

## Features huérfanas / especiales

- ~~`hello` — scaffold de migración SPA~~ ✅ **RETIRADA** (ya no existe la feature ni la ruta).
- `reportes` y `reportes_servicio` — sin ruta propia; embebidas como tabs de `analitica` (`/spa/reportes` y `/spa/reportes-servicio` redirigen a `/spa/analitica?tab=…`).
- `remisiones-nueva` — ruta legacy que redirige a `/spa/remisiones` conservando query.
- `app/templates/*.html` — 20 archivos, 19 muertos; solo `login.html` como fallback si falta el build del SPA (`_SSR_ROUTES` vacía).
