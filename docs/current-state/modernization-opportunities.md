# Oportunidades de modernización

> Auditoría Task Pack 00 · 2026-08-03. Priorizado según el Prompt Maestro Atlas Industrial Services (60% frontend/UX · 20% estandarización · 10% SaaS ligero · 10% backend mínimo). El repo ya cumplió varias fases del prompt (SPA, design system base, dashboard, Kanban) — las oportunidades son de **consolidación y configurabilidad**, no de reconstrucción.

## Quick wins (días, riesgo bajo, delta visible)

| # | Oportunidad | Task Pack | Esfuerzo |
|---|---|---|---|
| Q1 | **TenantBranding config** (`web/src/core/tenant/`): centralizar nombre, logo, colores de acento; Sidebar/Header/Footer/Login la consumen. Habilita identidad DASIC *y* neutra Atlas sin fork. | TP14 | S |
| Q2 | **Primitivas faltantes de mayor uso:** `PageHeader`, `EmptyState`, `Skeleton`, `Drawer` genérico. Desbloquean estandarización de todas las páginas. | TP03 | S–M |
| Q3 | **Ruta 404 + guard de auth pre-render** (loader o redirect temprano) + retiro de `/spa/hello`. | TP04 | S |
| Q4 | **Migración slate→tokens por feature** empezando por lo más visible: `dashboard` (53 occ.), `auth/login` (primera impresión), `superadmin` (76 occ., 0 tokens). Mapeo de 8 pares ya documentado. | TP03/04 | M (mecánico, por commits página a página) |
| Q5 | Hook compartido de catálogos (`useProveedores`, `useMarcas`, `useCategoriasServicio`) en `web/src/shared/` o `features/catalogos/` — elimina 8 duplicados. | TP17 | S |
| Q6 | Limpiar menú de promesas muertas ("Mi perfil"/"Configuración" disabled) y placeholders `@dasic.com`. | TP04 | XS |

## Primera fase (semanas — Fase 2 del prompt)

- **Application shell v2 (TP04):** sidebar colapsable con persistencia, breadcrumbs en top bar, título de documento dinámico, navegación construida desde config tenant+rol (ya es `SECTIONS[]` — extender con flags).
- **Estandarización de listados (TP06):** DataTable enriquecida (conteo, ordenamiento, estados loading/empty/error integrados, filtros persistentes en URL) aplicada a Clientes, Seguimiento, Inventario, Compras, Contactos.
- **Dashboard → centro de trabajo (TP05):** franja ejecutiva con navegación a vistas filtradas, panel de agenda (recordatorios ya existen), actividad reciente (quote_events ya existe).
- **FormField/FormSection (TP08):** extraer patrón de los 12 FormModals; adoptar en 2–3 formularios piloto.

## Cambios estructurales (Fases 3–4)

- **Maestro–detalle:** `EmpresaDetallePage` ya existe — usarla como patrón de referencia y replicar para Deal (vista detalle de oportunidad, hoy solo card en Kanban) y Cotización.
- **CRM v2** (roadmap ya activo): valor/probabilidad/próxima acción en deal, vínculo deal↔cotización bidireccional, actividades.
- **Feature flags de tenant** (`TenantFeatures`): navegación y rutas condicionadas; prepara módulos futuros (proyectos, field service) sin mostrarlos vacíos.
- **Capa service para ventas** (extraer PDF/Word de `ventas.py` a services) — solo cuando haya harness de tests.

## Pospuesto explícitamente (documentar, no ejecutar)

- Multi-tenancy real de DB (re-tenantizar 43 tablas + `Usuario`) — proyecto mayor; hoy mono-tenant por decisión (`20260429_01_drop_multitenant`).
- Módulos nuevos de dominio: Proyectos, Órdenes de servicio (ciclo completo), Técnicos/Agenda, Plantas, Activos instalados, Contratos/Mantenimiento — requieren modelado backend; entrarán como specs + feature flags.
- CPQ por componentes (TP10) — solo contratos TS + doc de evolución.
- Offline móvil para campo, facturación SaaS, aprovisionamiento de tenants.

## SaaS readiness — resumen

| Dimensión | Estado | Camino corto |
|---|---|---|
| Branding | Hardcodeado (~20 sitios) | Q1: TenantBranding config |
| Módulos por tenant | Menú estático (`SECTIONS[]`) + filtro superadmin | Extender config con feature flags; `user.modulos_visibles` ya tipado y sin uso |
| Config runtime | ✅ `platform_config` (IVA/vigencia sin redeploy) | Extender con branding/features |
| Tenant context backend | Retirado (mono-tenant) | Documentar como roadmap; no re-tenantizar ahora |
| Roles | 5 roles + owner-scoping | Capa frontend de permisos ya existe (`lib/permissions.ts`) — formalizar |
| Terminología | Fija en español industrial | Suficiente por ahora; glosario en TP02 |
