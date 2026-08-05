> [!warning] DOCUMENTO HISTÓRICO — NO APLICA
> Checklist congelado en abril-2026 contra el baseline Atlas ERP/POS. Sus estados ya no son ciertos: `Organization`/`Branch`/`UserOrganization` figuran como `ADOPTADO` pero **fueron retirados** (mono-tenant), la UI SSR que asume fue reemplazada por la SPA React (2026-05-22), y la "capa de repositories `PENDIENTE`" existe hoy como el patrón `app/domains/<x>/` (router/service/repository), estrenado en `app/domains/remisiones/`.
> **Se conserva como registro del checklist original.** El estado real y verificado está en `context/02_REPO_CURRENT_STATE.md` y `docs/Atlas-ONE-Proyecto.md`.

---

# Stack Adoption Checklist (Atlas -> DASIC)

Este checklist detalla el estado real del repositorio tras la refactorización a la arquitectura base recomendada para DASIC.

Estados:
- `ADOPTADO`: ya implementado en el repo.
- `EN_PROGRESO`: parcialmente implementado.
- `PENDIENTE`: definido, no implementado.
- `NO_APLICA`: no entra en este producto.

## 1) Nucleus
- DB session y engine centralizados (`app/db/`) — `ADOPTADO`
- `DATABASE_URL` por entorno + `.env` — `ADOPTADO`
- PostgreSQL como objetivo local/prod — `ADOPTADO`
- Mixins `TenantMixin/AuditMixin/UUIDMixin` — `PENDIENTE`
- `Organization` + `Branch` + `UserOrganization` separadas en `models/nucleus.py` — `ADOPTADO`
- DDL Base automatizado (`db/seeds.py`) — `ADOPTADO`

## 2) Arquitectura por capas
- Split modular: `app/models`, `app/schemas` separados por contexto de dominio — `ADOPTADO`
- Extracción de Bootstrap central: `core/lifespan.py`, `core/logging.py`, `main.py` depurado — `ADOPTADO`
- Capa de Repositories para validación estricta de queries (`app/repositories`) — `PENDIENTE` (Fase 4)
- Routers delgados + servicios con lógica de negocio aislada — `EN_PROGRESO`

## 3) Seguridad y Auth
- JWT y dependencias de auth separadas (`app/security/`) — `ADOPTADO`
- Hashings con `bcrypt` integrados en el User Schema — `ADOPTADO`
- Cookie HttpOnly como flujo principal SSR — `EN_PROGRESO`
- RBAC por dependencias + ownership — `EN_PROGRESO`

## 4) CRM y Blueprint Comercial (core)
- Blueprint integral definido en `context/DASIC_Plataforma_Base.md` — `ADOPTADO`
- Cuentas/Contactos/Múltiples Pipelines — `PENDIENTE` (Fase 7)
- Actividades y Timeline CRM — `PENDIENTE` (Fase 7)
- Lógica de Cotizador Smart (< 10 mins) con Reserva a 48H — `PENDIENTE` (Fase 8)
- Dead Stock & Alertas Críticas — `PENDIENTE` (Fase 8)

## 5) Quality Gates
- Aislamiento tenant por `organization_id` en todas las queries — `EN_PROGRESO`
- Alembic como flujo obligatorio de cambios de schema — `PENDIENTE` (Fase 6)
- Reglas de UI estandarizadas según `UI_PATTERNS.md` puro Tailwind Oscuro sin SPA — `ADOPTADO`
