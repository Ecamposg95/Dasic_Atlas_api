# RBAC (DASIC CRM Industrial)

Roles cerrados y reglas de visibilidad para un CRM industrial multi-tenant.

## Platform roles (cross-tenant)

- `SUPERADMIN`: acceso a todas las organizaciones (solo para plataforma)
- `SUPPORT`: soporte limitado y auditado
- `NONE`

## Fase 1 segura (alineacion de vocabulario)

Mientras conviven rutas legacy y el modelo tenant nuevo, el rol `usuarios.rol` se
normaliza a este vocabulario canonico en UI/API:

- `ADMINISTRADOR` (mapea legacy `ADMIN`)
- `GERENTE_COMERCIAL` (mapea legacy `ASISTENTE`)
- `VENTAS` (mapea legacy `VENDEDOR`)

Alcance de esta fase:

- No introduce enforcement tenant-aware fuera de gestion de usuarios.
- Mantiene compatibilidad de lectura/escritura con los roles legacy existentes.
- Gestion de usuarios sigue restringida al equivalente de `ADMINISTRADOR`.
- En despliegue se aplico hotfix adicional para aceptar filas legacy persistidas en DB (`ADMIN`, `ASISTENTE`, `VENDEDOR`) sin romper startup del ORM.

## Estado actual de implementacion

### Ya resuelto

- Normalizacion de rol en schemas y guards
- UI/API de gestion de usuarios alineada a vocabulario canonico
- Compatibilidad de lectura con enums legacy en `usuarios.rol`

### Aun pendiente

- Separar formalmente `platform role` y `tenant role`
- Hacer enforcement de permisos desde `UserOrganization`
- Aplicar branch scope real
- Auditar todos los routers legacy para dejar de depender de checks planos sobre `user.rol`

## Tenant roles (por organizacion)

1. `DUEÑO`
1. `ADMINISTRADOR`
1. `GERENTE_COMERCIAL`
1. `VENTAS`
1. `CRM`
1. `AUDITOR`
1. `LECTOR`

## Reglas de visibilidad (ownership)

Entidades CRM principales (Accounts, Deals, Activities) deben aplicar ownership/asignacion.

- `DUEÑO`/`ADMINISTRADOR`/`GERENTE_COMERCIAL`: visibilidad org-wide.
- `VENTAS`/`CRM`: visibilidad limitada a:
  - `owner_user_id == current_user.id` o
  - `assigned_to_user_id == current_user.id` o
  - asignacion explicita (si se implementa una tabla de assignment)
- `AUDITOR`: lectura org-wide (sin writes)
- `LECTOR`: lectura limitada (dashboard + lista/consulta; sin export masivo ni acciones)

## Branch scope

- Si `current_user.branch_id != NULL`, se restringe a esa branch en entidades que tengan `branch_id`.
- Usuarios HQ (`branch_id = NULL`) pueden consultar cualquier branch dentro de la org.

## Permisos (MVP)

### Pipelines y stages

- Crear/editar pipelines/stages: `ADMINISTRADOR`, `DUEÑO`
- Ver: todos los roles tenant

### Accounts (clientes)

- Crear: `CRM`, `VENTAS`, `GERENTE_COMERCIAL`, `ADMINISTRADOR`, `DUEÑO`
- Editar: `CRM`, `VENTAS` (si es owner/asignado), `GERENTE_COMERCIAL+`
- Ver: segun visibilidad

### Deals (oportunidades)

- Crear: `VENTAS`, `CRM`, `GERENTE_COMERCIAL+`
- Mover etapa: `VENTAS`, `CRM` (si es owner/asignado), `GERENTE_COMERCIAL+`
- Reasignar: `GERENTE_COMERCIAL`, `ADMINISTRADOR`, `DUEÑO`
- Cerrar ganado/perdido: `VENTAS`, `CRM` (owner/asignado), `GERENTE_COMERCIAL+`

### Activities (incluye WhatsApp manual)

- Crear: `VENTAS`, `CRM`, `GERENTE_COMERCIAL+`
- Completar/cerrar: asignado o `GERENTE_COMERCIAL+`
- Ver: segun visibilidad del deal/account asociado
