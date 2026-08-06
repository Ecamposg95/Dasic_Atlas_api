# Moonshot Vision — DASIC CRM (Industrial)

Este documento define la vision ambiciosa del producto: construir un CRM industrial que sea mejor (en usabilidad, velocidad y capacidad) que Monday CRM (pipelines), Salesforce, HubSpot y Zoho, especialmente para operaciones industriales B2B.

## North Star

"Un equipo comercial industrial puede operar end-to-end (prospecto → oportunidad → cotizacion → seguimiento → cierre) en una sola herramienta, con data confiable, automatizacion, trazabilidad y reporting en tiempo real."

## Donde vamos a ganar (diferenciadores)

1. **CRM industrial-first**: cuentas con multiples ubicaciones/planta, multiples decisores, ciclos largos, RFQ, listas de precios, validez de cotizacion, terminos, anexos y requerimientos tecnicos.
1. **Pipelines y workflows de verdad**: multiples pipelines por organizacion; etapas configurables con reglas; validaciones y "gates" por rol.
1. **Velocidad y simplicidad**: SSR para navegacion instantanea, menos "spinner fatigue", y UX orientada a usuarios operativos.
1. **Actividad + timeline como fuente de verdad**: cada cambio relevante es un evento (quien/cuando/por que), con auditoria funcional.
1. **Ownership y visibilidad robustos**: RBAC + reglas de asignacion (owner/assigned/team) y branch-scope.
1. **Automatizacion incremental**: reglas simples primero (sin motor complejo), luego evolucion a engine de workflows.
1. **Integraciones pragmaticas**: WhatsApp manual (MVP) → luego integracion oficial; importacion/exportacion; webhooks.
1. **Multi-tenant desde el dia 1**: aislamiento estricto por `organization_id` y diseño para SaaS.

## Principios de producto

1. **Data model antes que UI**: el modelo debe soportar industria, no solo pantallas.
1. **No duplicar entidades**: una fuente de verdad por entidad (Account/Deal/Quote/Activity).
1. **Opinionated defaults, configurable cuando aporta**: pipelines preconfigurados para industria; permitir customizacion sin romper consistencia.
1. **Permisos como parte del dominio**: acciones y visibilidad son reglas del negocio.
1. **Reducir friccion**: capturar informacion en el punto de accion (actividad, nota, whatsapp) sin obligar a navegar 10 pantallas.

## Capacidades (vision por bloques)

### Bloque A: CRM Core (must-win)

1. Accounts + Contacts + Locations
1. Multiple Pipelines + Stages (kanban)
1. Deals con ownership/asignacion
1. Activities (TASK/CALL/VISIT/NOTE/WHATSAPP manual)
1. TimelineEvents y auditoria funcional
1. Busqueda y filtros guardados

### Bloque B: Sales Execution (cotizador integrado)

1. Quotes ligadas a Deal/Account
1. Templates PDF y anexos
1. Vigencias, terminos, aprobaciones
1. Versionado de cotizaciones

### Bloque C: Revenue Ops (operacion comercial)

1. Forecast por pipeline/owner/branch
1. Metas y performance (actividad, conversion, ciclo)
1. Reportes accionables (no dashboards decorativos)

### Bloque D: Automatizacion

Evolucion en 3 etapas:

1. **Reglas simples**: on stage change → crear tarea; on deal idle → recordatorio.
1. **Plantillas operativas**: playbooks por etapa (checklists).
1. **Workflow engine**: definiciones declarativas (eventos/condiciones/acciones) con auditoria.

### Bloque E: Integraciones

1. Importacion/exportacion (CSV/Excel)
1. Webhooks (event bus hacia afuera)
1. WhatsApp oficial (cuando aplique)
1. Email (logging y luego envio)

## Riesgos y como mitigarlos

1. **Complejidad infinita**: limitar configurabilidad; versionar features por fases.
1. **Seguridad/tenancy**: tests obligatorios de aislamiento tenant y ownership.
1. **Performance**: indices por `organization_id`, `owner_user_id`, `stage_id`; paginacion consistente.
1. **Deuda por presets**: un preset referencia (DASIC) que no se rompe; todo cambio debe mantenerlo funcional.

## Definition of Done (para features core)

1. Endpoints aplican `organization_id` y ownership.
1. SSR view con permisos consistentes.
1. Indices/migracion Alembic incluida.
1. Tests minimos: tenant isolation + role/ownership.
1. Evento de timeline para acciones clave.

## Benchmarks (competencia)

- Monday CRM: pipelines y usabilidad.
- Salesforce: extensibilidad, reporting, seguridad.
- HubSpot: UX y automatizaciones.
- Zoho: suite amplia a bajo costo.

El objetivo no es copiar todo. El objetivo es superar en el caso industrial B2B: velocidad operativa, trazabilidad, pipelines reales y cotizacion integrada.
