# CRM Spec (MVP Potente) — DASIC Industrial

Este documento define el MVP CRM-first: entidades, flujos, endpoints y notas de implementacion.

## Objetivo

CRM industrial multi-tenant y multi-branch con:

- Cuentas/Contactos/Sitios
- Pipeline(s) configurables por organizacion
- Oportunidades (Deals) con ownership/asignacion
- Actividades (incl. WhatsApp manual)
- Timeline/auditoria funcional
- Cotizaciones ligadas a Deals/Accounts (fase siguiente)

## Entidades (modelo)

### Nucleus

- `Organization` (UUID PK)
- `Branch` (UUID PK, FK org)
- `User` (global)
- `UserOrganization` (FK user + org, role, branch_id nullable)

### CRM

- `Account`
  - `organization_id`
  - `owner_user_id`
  - `branch_id` (nullable; si la cuenta esta ligada a una branch)
  - `name`, `rfc_tax_id`, `email`, `phone`
  - `tags` (tabla normalizada sugerida a futuro)

- `Contact`
  - `organization_id`
  - `account_id`
  - `name`, `email`, `phone`, `whatsapp`

- `AccountLocation`
  - `organization_id`
  - `account_id`
  - `name`, `address`, `notes`

- `Pipeline`
  - `organization_id`
  - `name`, `is_default`, `is_active`

- `PipelineStage`
  - `organization_id`
  - `pipeline_id`
  - `name`, `order`, `probability`
  - `is_won`, `is_lost`

- `Deal`
  - `organization_id`
  - `branch_id` (nullable)
  - `pipeline_id`, `stage_id`
  - `account_id`
  - `owner_user_id`
  - `assigned_to_user_id` (nullable)
  - `title`, `value_estimated`, `currency`
  - `close_date_estimated`
  - `status` (`OPEN|WON|LOST`)
  - `loss_reason` (nullable)

- `Activity`
  - `organization_id`
  - `branch_id` (nullable)
  - `account_id` (nullable)
  - `deal_id` (nullable)
  - `contact_id` (nullable)
  - `type` (`TASK|CALL|VISIT|NOTE|WHATSAPP`)
  - `direction` (solo WhatsApp, `INBOUND|OUTBOUND`, nullable)
  - `subject`, `body`
  - `due_at`, `done_at`
  - `assigned_to_user_id`
  - `created_by_user_id`

- `TimelineEvent`
  - `organization_id`
  - `entity_type` (`ACCOUNT|DEAL|QUOTE|...`)
  - `entity_id`
  - `event_type` (`CREATED|UPDATED|STAGE_CHANGED|WHATSAPP_LOGGED|...`)
  - `payload_json`
  - `created_by_user_id`
  - `created_at`

## Flujos

1. Admin crea pipelines y stages.
1. Ventas/CRM crea Account y Contact.
1. Ventas crea Deal en pipeline y lo mueve por etapas.
1. Ventas/CRM registra Activities (incl WhatsApp manual) y completa tareas.
1. Timeline se alimenta automaticamente (eventos clave).

## Endpoints (MVP)

### CRM

- `GET /api/crm/pipelines`
- `POST /api/crm/pipelines`
- `GET /api/crm/pipelines/{pipeline_id}/stages`
- `POST /api/crm/pipelines/{pipeline_id}/stages`

- `GET /api/crm/accounts`
- `POST /api/crm/accounts`
- `GET /api/crm/accounts/{account_id}`
- `PATCH /api/crm/accounts/{account_id}`

- `GET /api/crm/contacts?account_id=...`
- `POST /api/crm/contacts`

- `GET /api/crm/deals?pipeline_id=...&stage_id=...&assigned_to=...`
- `POST /api/crm/deals`
- `GET /api/crm/deals/{deal_id}`
- `PATCH /api/crm/deals/{deal_id}`
- `POST /api/crm/deals/{deal_id}/move-stage`
- `POST /api/crm/deals/{deal_id}/assign`

- `GET /api/crm/activities?deal_id=...&account_id=...&assigned_to=...`
- `POST /api/crm/activities`
- `POST /api/crm/activities/{activity_id}/complete`

### Timeline

- `GET /api/crm/timeline?entity_type=DEAL&entity_id=...`

## SSR (pantallas)

- `/crm/dashboard`
- `/crm/accounts`
- `/crm/accounts/{id}`
- `/crm/pipeline?pipeline_id=...` (kanban)
- `/crm/deals/{id}`
- `/crm/activities`
- `/admin/pipelines`

## Notas de seguridad

- `X-Organization-ID` debe validarse contra el `org_id` del JWT.
- RBAC no es solo UI: endpoints deben aplicar `require_roles` + filtros de visibilidad.
- WhatsApp Nivel A: solo logging manual. No almacenar tokens/API keys de WA si no hay integracion.
