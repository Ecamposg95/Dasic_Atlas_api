# Inventario de rutas (SPA)

> Fuente: `web/src/router.tsx` (auditado 2026-08-03). Router: `createBrowserRouter` con code-splitting vía helper `lazyPage()` (auto-reload ante chunk stale tras deploy).

## Rutas públicas (fuera de `Layout`)

| Path | Página | Lazy |
|---|---|---|
| `/` | `features/auth/pages/LoginPage` | No (eager) |
| `/login` | `LoginPage` | No |

## Rutas bajo `/spa` (envueltas en `<Layout />`)

| Path | Feature / página | Grupo de menú |
|---|---|---|
| `/spa` | redirect → `/spa/dashboard` | — |
| `/spa/dashboard` | `dashboard/DashboardPage` | Comercial |
| `/spa/crm` | `crm/CrmKanbanPage` | Comercial |
| `/spa/cotizador` | `cotizador/CotizadorPage` | Comercial |
| `/spa/borradores` | `borradores/BorradoresPage` | Comercial |
| `/spa/seguimiento` | `seguimiento/SeguimientoPage` | Comercial |
| `/spa/recordatorios` | `recordatorios/RecordatoriosPage` | Comercial |
| `/spa/clientes` | `clientes/ClientesPage` | Clientes |
| `/spa/empresas/:id` | `clientes/EmpresaDetallePage` | (sin entrada de menú) |
| `/spa/empresas-unificar` | `clientes/UnificarEmpresasPage` | (sin entrada de menú) |
| `/spa/contactos` | `contactos/ContactosPage` | Clientes |
| `/spa/compras` | `compras/ComprasPage` | Operación |
| `/spa/remisiones` | `remisiones/RemisionesPage` | Operación |
| `/spa/remisiones-nueva` | `remisiones/CrearRemisionPage` | (sin entrada de menú) |
| `/spa/reportes-servicio-docs` | `reportes_servicio_docs/ReportesServicioDocsPage` | Operación |
| `/spa/inventario` | `inventario/InventarioPage` | Catálogo |
| `/spa/servicios` | `servicios/ServiciosPage` | Catálogo |
| `/spa/precios` | `precios/PreciosPage` | Catálogo |
| `/spa/fantasmas` | `fantasmas/FantasmasPage` | Catálogo |
| `/spa/catalogos` | `catalogos/CatalogosPage` | Catálogo (Diccionarios) |
| `/spa/cuentas-por-cobrar` | `cxc/CuentasPorCobrarPage` | Finanzas |
| `/spa/gastos` | `gastos/GastosPage` | Finanzas |
| `/spa/fx` | `fx/FxPage` | Finanzas |
| `/spa/analitica` | `analitica/KpisPage` | Analítica |
| `/spa/reportes` | redirect → `/spa/analitica?tab=ventas` | — |
| `/spa/reportes-servicio` | redirect → `/spa/analitica?tab=operativo` | — |
| `/spa/usuarios` | `usuarios/UsuariosPage` | Sistema |
| `/spa/hello` | `hello/HelloPage` | (huérfana — demo de migración) |
| `/spa/superadmin` | `superadmin/SuperAdminPage` | Plataforma |
| `/spa/superadmin/usuarios` | `superadmin/UsuariosPlataformaPage` | Plataforma |
| `/spa/superadmin/config` | `superadmin/ConfigPlataformaPage` | Plataforma |
| `/spa/superadmin/audit` | `superadmin/AuditPage` | Plataforma |
| `/spa/superadmin/salud` | `superadmin/SaludPage` | Plataforma |
| `/spa/superadmin/mantenimiento` | `superadmin/MantenimientoPage` | Plataforma |

## Rutas legacy (aliases con el mismo componente)

`/ventas/cotizador`, `/dashboard`, `/borradores`, `/seguimiento`, `/fantasmas`, `/clientes`, `/inventario`, `/catalogos`, `/compras`, `/remisiones`, `/gastos`, `/reportes-servicio-docs`, `/cuentas-por-cobrar`, `/fx`, `/precios`, `/usuarios`, `/servicios` + redirects de `/reportes` y `/reportes-servicio`.

## Protección y autorización

- **No existe `ProtectedRoute`/guard a nivel router.** El guard efectivo vive en `Layout.tsx:21-35`: si no hay usuario en el store, consulta `GET /api/auth/me`; si falla redirige a `/`. Es *post-render* (la página hija se monta mientras resuelve).
- Autorización por rol solo a nivel UI: hooks en `web/src/lib/permissions.ts` (`useIsAdmin`, `useIsSuperadmin`, `useIsAdminOrGerente`). Las rutas `/spa/superadmin/*` no se bloquean en el router; `PlatformShell` renderiza un mensaje si el usuario no es superadmin. (La API sí valida server-side.)
- `user.modulos_visibles` está tipado en `stores/auth.ts` pero **no se consume en ningún lugar** — candidato natural para navegación por módulos/feature flags.

## Huecos detectados

1. Sin ruta catch-all `*` / página 404.
2. Guard de auth post-render (flash de contenido antes de redirect).
3. Rutas de detalle (`/spa/empresas/:id`) sin breadcrumbs ni navegación contextual.
4. `hello` es una feature demo huérfana (candidata a retiro).
