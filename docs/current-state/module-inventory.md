# Inventario de módulos

> Auditoría Task Pack 00 · 2026-08-03. Mapa: módulo en producción ↔ módulo objetivo Atlas Industrial Services.

## Módulos en producción

| Módulo | Feature SPA | Router API | Estado |
|---|---|---|---|
| Dashboard | `dashboard` | `/api/dashboard` (hero, pipeline, tendencia, alertas, tops, heatmap, kpis) | ✅ Producción |
| CRM Pipeline (Kanban) | `crm` | `/api/crm` (pipelines, board, deals CRUD+move) | ✅ Producción |
| Cotizador | `cotizador` | `/api/ventas` (25 endpoints) | ✅ Producción — corazón del sistema |
| Borradores | `borradores` | `/api/ventas/borradores` | ✅ |
| Seguimiento | `seguimiento` | `/api/ventas/historial` | ✅ |
| Recordatorios | `recordatorios` | `/api/recordatorios` | ✅ Owner-scoped |
| Empresas (Clientes) | `clientes` (+ detalle, unificar) | `/api/clientes` (28 endpoints) | ✅ Con maestro-detalle |
| Contactos | `contactos` | `/api/contactos` + anidados en clientes | ✅ |
| Compras (OC) | `compras` | `/api/compras` (17 endpoints) | ✅ |
| Fantasmas | `fantasmas` | `/api/fantasmas` | ✅ |
| Remisiones | `remisiones` | `/api/remisiones` (PDF + Word) | ✅ |
| Reportes de servicio | `reportes_servicio_docs` | `/api/reportes-servicio-docs` | ✅ |
| Gastos | `gastos` | `/api/gastos` | ✅ |
| Inventario | `inventario` | `/api/productos` + `/api/inventario` (kardex, reservas, import/export CSV, QR) | ✅ |
| Servicios | `servicios` | `/api/servicios` | ✅ |
| Precios proveedor | `precios` | `/api/precios` | ✅ |
| Diccionarios | `catalogos` | `/api/catalogos` + `/api/sat` (14 catálogos SAT) | ✅ |
| Cuentas por cobrar | `cxc` | `/api/cuentas-por-cobrar` + endpoints en clientes | ✅ Aging + pago FIFO |
| Tipo de cambio | `fx` | `/api/fx` | ✅ Banxico + override |
| Analítica/Reportes | `analitica` (envuelve `reportes` y `reportes_servicio`) | `/api/reportes` | ✅ |
| Usuarios | `usuarios` | `/api/usuarios` | ✅ |
| Consola super-admin | `superadmin` | `/api/superadmin` + `/api/admin` | ✅ Solo dev |

## Mapa a módulos objetivo Atlas Industrial Services

| Módulo objetivo (Prompt Maestro) | Cobertura hoy | Gap |
|---|---|---|
| 1. Inicio / centro de trabajo | Dashboard KPIs + recordatorios | Franja ejecutiva accionable, agenda |
| 2. CRM industrial | Empresas + Contactos + notas + actividad | Plantas, necesidades, actividades tipadas |
| 3. Oportunidades | Deals Kanban | Vista detalle de deal, valor/probabilidad/próxima acción, deal↔cotización bidireccional (CRM v2 en roadmap) |
| 4. Levantamientos técnicos | ❌ No existe | Modelo + captura en campo |
| 5. Cotizaciones / CPQ | Cotizador completo (multimoneda, versiones, plantillas, PDF/Word) | Aprobaciones por rol, alcance/exclusiones estructurados, CPQ por componentes |
| 6. Proyectos | ❌ No existe (lo más cercano: orden de venta + reporte de servicio) | Modelo Proyecto/Hitos/Tareas |
| 7. Órdenes de servicio | Parcial: `reportes_servicio_docs` (acta post-servicio) | Ciclo completo solicitud→programación→cierre |
| 8. Técnicos y agenda | ❌ No existe | Agenda, asignación |
| 9. Clientes/plantas/contactos | Empresas + contactos ✅ | **Plantas** (no modeladas) |
| 10. Activos instalados | ❌ No existe | Base instalada completa |
| 11. Equipos y componentes | Parcial (productos) | Jerarquía equipo/componente |
| 12. Inventarios | ✅ Completo (kardex, reservas) | Multi-almacén |
| 13. Compras | ✅ OC desde cotización | Requisiciones |
| 14. Contratos y pólizas | ❌ No existe | Modelo completo |
| 15. Mantenimiento | ❌ No existe | Planes preventivos |
| 16. Documentos | Parcial (PDF/Word por entidad) | Repositorio documental |
| 17. Reportes | ✅ Analítica ventas/inventario/conversión/servicios | Rentabilidad por proyecto |
| 18. Configuración | Parcial (`platform_config`: IVA/vigencia runtime) | Config por tenant, branding |
| 19. Administración tenant | Consola superadmin (mono-tenant) | Tenant real, feature flags |

## Features huérfanas / especiales

- `hello` — scaffold de migración SPA (ruta `/spa/hello` viva). Candidata a retiro.
- `reportes` y `reportes_servicio` — sin ruta propia; embebidas como tabs de `analitica`.
- `app/templates/*.html` — 19 de 20 muertos; solo `login.html` como fallback si falta el build del SPA.
