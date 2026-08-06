# Arquitectura Objetivo (DASIC CRM Industrial)

Este documento define la arquitectura objetivo inspirada en Atlas, ajustada al preset **DASIC ERP Industrial** con CRM como nucleo.

Baseline tecnico obligatorio: `context/atlas_erp_pos_stack.md`.
Seguimiento de adopcion: `context/STACK_ADOPTION_CHECKLIST.md`.

## Capas (concentric / layered)

```
Preset DASIC ERP Industrial (config, modulos habilitados, nav)
        ↑ orquesta
Engines (CRM/Relationship, Quotes/Docs, Catalog, Reports)
        ↑ dependen de
Nucleus (Org/Tenancy, Branch, Auth/JWT, RBAC, DB, Events)
```

## Nucleus (minimo viable)

Componentes requeridos:

1. **Config**: `.env` con `DATABASE_URL`, `SECRET_KEY`, expiracion tokens.
1. **DB**: SQLAlchemy 2.x con PostgreSQL.
1. **Tenancy**:
   - Header obligatorio `X-Organization-ID`.
   - `Organization.id` UUID.
   - Cada usuario pertenece a una sola organizacion.
1. **Branch**:
   - `Branch.id` UUID.
   - Usuarios pueden ser HQ/global (`branch_id = NULL`) o branch-scoped.
   - Header `X-Branch-ID` opcional pero validado.
1. **Auth**:
   - JWT HS256 en cookie HttpOnly para SSR.
   - Claims minimos: `sub`, `org_id`, `role`, `branch_id`, `exp`.
1. **RBAC**:
   - Roles cerrados.
   - Dependencias `require_roles([...])`.
   - Regla adicional: visibilidad por asignacion/ownership en CRM.

## Engines (prioridad)

1. **CRM Engine** (core): accounts, contacts, pipelines, stages, deals, activities, timeline.
1. **Quotes Engine**: cotizaciones como documento ligado a `Deal`/`Account`.
1. **Catalog Engine**: productos/servicios para cotizar (minimo viable).
1. **Reports Engine**: KPIs comerciales y reportes operativos.

## Convenciones criticas

### Tenancy: regla de oro

Toda tabla de negocio tiene `organization_id` y toda query filtra por `organization_id`.

### Branch scope

Si el usuario es branch-scoped, se restringen consultas a su `branch_id` cuando aplique (deals/activities/quotes con `branch_id`).

### SSR

No introducir SPA. Alpine.js solo para interactividad local (kanban, modals, dropdowns).
