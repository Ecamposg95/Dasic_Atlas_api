> [!warning] DOCUMENTO HISTÓRICO — NO APLICA
> Roadmap congelado al **2026-04-28**. Sus "pendientes" ya se cerraron (folios, recotización, OC real, dashboard, CRM Kanban) y su **Fase 4 nucleus multi-tenant / Fase 5 RBAC tenant-aware fue revertida**: `app/models/nucleus.py` (Organization/Branch/UserOrganization) fue retirado y el proyecto es mono-tenant. Tampoco aplica el "baseline canónico" `atlas_erp_pos_stack.md`.
> **Se conserva como registro de la secuencia de trabajo original.** El roadmap vigente está en `docs/Atlas-ONE-Proyecto.md` (§11) y `context/02_REPO_CURRENT_STATE.md`.

---

# Roadmap de Implementacion (DASIC CRM Industrial)

Este roadmap es el orden recomendado de trabajo para convertir el prototipo actual en un CRM industrial multi-tenant basado en patrones de Atlas.

Baseline canonico: `context/atlas_erp_pos_stack.md`.
Control de ejecucion: `context/STACK_ADOPTION_CHECKLIST.md`.

## Estado de ejecucion al 2026-04-28

### Cerrado

1. RBAC fase 1 segura
1. Catalogo / inventario fase 1
1. Cotizador fase 2
1. Seguimiento read-only con antiguedad
1. Borrador de OC desde cotizacion
1. Hotfixes de despliegue Railway

### Pendiente inmediato

1. Folios por año/mes/usuario
1. Recotizaciones / versionado
1. Orden de compra real desde cotizacion
1. Correo + tracking de cotizaciones
1. Dashboard comercial operativo
1. RBAC tenant real con `UserOrganization`

## Fase 0: Documentacion y alineacion

1. Crear `context/` (este directorio)
1. Reescribir `README.md` para reflejar: CRM-first, PostgreSQL, multi-tenant, cookies HttpOnly
1. Declarar `atlas_erp_pos_stack.md` como baseline canonico
1. Mantener actualizado `STACK_ADOPTION_CHECKLIST.md`

## Fase 1: Base tecnica estable

1. Corregir imports para que `uvicorn app.main:app` sea estable
1. Normalizar paths de `templates/` y `static/`
1. Alinear hashing (bcrypt o argon2) y dependencias

## Fase 2: PostgreSQL + config por entorno

1. `DATABASE_URL` obligatorio (sin SQLite fallback)
1. Config central (`SECRET_KEY`, expiracion)
1. Conexion SQLAlchemy 2.x

## Fase 3: Alembic (migraciones)

1. Inicializar Alembic
1. Migracion inicial del esquema base
1. Workflow: cambios de modelos == revision Alembic

## Fase 4: Nucleus multi-tenant + multi-branch

1. Modelos: `Organization(UUID)`, `Branch(UUID)`, `User`, `UserOrganization`
1. Dependencias: `get_current_user`, `get_current_org`, `get_current_branch`
1. Enforcements: header `X-Organization-ID` y validacion contra JWT

## Fase 5: RBAC + visibilidad

1. Implementar `require_roles([...])`
1. Implementar filtros de visibilidad por ownership/asignacion
1. Branch scope para entidades que tengan `branch_id`

**Estado actual:**
- Parcialmente implementado
- Se cerro una fase segura de compatibilidad para `usuarios.rol`
- Falta el enforcement tenant-aware real

## Fase 6: CRM Engine MVP

1. Accounts, Contacts, Locations
1. Pipelines + Stages (multiples pipelines)
1. Deals + move stage + assign
1. Activities (incl WhatsApp Nivel A)
1. Timeline events

## Fase 7: SSR CRM-first

1. Layout base con Tailwind CDN + Alpine.js
1. Pantallas: dashboard, accounts, account detail, pipeline kanban, deal detail, activities, admin pipelines
1. Auth SSR con cookies HttpOnly

## Fase 8: Cotizaciones integradas (siguiente)

1. Quote ligado a Deal/Account
1. Partidas
1. PDF
1. Timeline: quote created/sent

**Estado actual:**
- Ya existe cotizador funcional SSR
- Ya soporta `utilidad`, `moneda`, `tipo_cambio` y PDF corregido
- Falta:
  - folios robustos
  - recotizaciones
  - envio/seguimiento
  - integracion con Deals/Timeline

## Fase 9: QA minima

1. Tests de aislamiento tenant
1. Tests branch scope
1. Tests RBAC/ownership

## Fase 10: Moonshot (iterativo)

1. Workflows (reglas simples → playbooks → engine)
1. Reporting industrial (forecast, ciclo, conversion, performance)
1. Cotizador industrial (quotes versionadas, aprobaciones, anexos)
1. Integraciones (webhooks, import/export, WhatsApp oficial cuando aplique)

## Orden Recomendado para la Proxima Sesion

1. Folios + recotizaciones
1. OC real desde cotizacion
1. Tracking por correo
1. Dashboard de KPIs
1. RBAC tenant real
