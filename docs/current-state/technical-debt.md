# Deuda técnica

> Auditoría Task Pack 00 · 2026-08-03. Clasificación: 🔴 crítica · 🟠 importante · 🟡 deseable · ⚪ posponible.

## Funcional / calidad

| # | Deuda | Clase | Detalle |
|---|---|---|---|
| 1 | **Cero tests** | 🔴 | Ni pytest ni vitest; validación actual = compileall + tsc + build + QA manual. Cualquier rediseño amplio sin red de seguridad. |
| 2 | **Sin lint/format** | 🟠 | No hay ESLint/Prettier/Ruff config. Consistencia depende de disciplina. |
| 3 | Decimales string vs `number` en types TS | 🟠 | Backend serializa Decimal como string; funciona por coerción. Contrato frágil (ordenamientos, sumas en front). |
| 4 | `types:gen` (openapi-typescript) configurado pero sin uso | 🟡 | `web/src/types/` no existe; types curados a mano (esto es convención aceptada, pero el script muerto confunde). |

## Arquitectura backend

| # | Deuda | Clase | Detalle |
|---|---|---|---|
| 5 | **Thick routers** | 🟠 | `ventas.py` 2,339 L (con plantilla PDF inline), `compras.py` 1,189, `clientes.py` 1,131. Sin capa repository/service para dominio de ventas. Refactor en roadmap; no bloquea la etapa visual. |
| 6 | Doble vía de esquema (`create_all` + `_BACKFILL_DDL` + Alembic) | 🟠 | Railway no ejecuta Alembic; toda columna nueva requiere entrada doble. Fuente conocida de crashes si se olvida el re-export o el backfill. |
| 7 | Autorización inconsistente | 🟠 | ~9 endpoints sin dependencia de rol explícita (detalle en `api-consumption-map.md`), destaca `POST /api/inventario/movimientos`. |
| 8 | RBAC por rol-string, sin enforcement tenant-aware | 🟡 | Aceptado mientras sea mono-tenant; bloqueante para SaaS real. |
| 9 | `SECRET_KEY` puede rotar por deploy en Railway | 🟠 | Config pendiente (roadmap) — invalida sesiones. |

## Frontend

| # | Deuda | Clase | Detalle |
|---|---|---|---|
| 10 | **~87 archivos con `slate-*`** (692 ocurrencias) | 🟠 | Design system tokenizado existe pero 78% de features no migradas → inconsistencia visual light/dark. |
| 11 | **Branding DASIC/Atlas hardcodeado** en ~20 sitios | 🟠 | Sin TenantBranding config — bloquea identidad neutra SaaS. |
| 12 | Primitivas faltantes (PageHeader, EmptyState, Skeleton, Drawer, Breadcrumbs, Stepper, Timeline) | 🟠 | Cada feature improvisa → duplicación (4 drawers ad-hoc, ≥4 skeletons ad-hoc). |
| 13 | Hooks de catálogo duplicados (`useProveedores` ×4, etc.) | 🟡 | Query keys divergentes → caches duplicados. Patrón correcto ya demostrado: `features/contactos/useContactoMutations` compartido. |
| 14 | `RegistrarPagoModal` ×2 casi-duplicado | 🟡 | compras vs cxc. |
| 15 | Guard de auth post-render en `Layout` | 🟡 | Flash de contenido; sin `ProtectedRoute`/loader. |
| 16 | Sin ruta 404 catch-all | 🟡 | URL inválida = pantalla vacía dentro del shell. |
| 17 | Feature `hello` huérfana en ruta viva | ⚪ | Scaffold de migración; retirar. |
| 18 | Chunk recharts 325 kB | ⚪ | Ya code-split y lazy; aceptable. Medir antes de optimizar. |
| 19 | 19/20 templates Jinja muertos en `app/templates/` | ⚪ | Respaldo intencional post-migración; retirar cuando haya confianza (Fase 6). |

## TODOs reales en código (solo 2)

- `web/src/features/cotizador/types.ts:49` — backend no devuelve default de un campo en `/config/cotizador-defaults`.
- `web/src/features/cotizador/store.ts:322` — exponer `detalle.id` en `/detalle-json` para preservar identidad de líneas.

## Documentación

- `context/` mezcla docs vigentes con legacy contradictorio (`context/CLAUDE.md` describe un stack Next.js/Prisma que nunca fue; `UI_PATTERNS.md` describe Jinja+Alpine retirado). Riesgo de confundir a agentes/desarrolladores nuevos. Los avisos existen pero la limpieza está pendiente.
