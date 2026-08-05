# Estado Actual del Repo (dasic-atlas-api / Atlas ONE)

> **Actualizado:** 2026-08-04. Rama de referencia: `main` (autodeploy a Railway).
> Fuente de verdad del stack: `CLAUDE.md` (raíz) + `docs/Atlas-ONE-Proyecto.md`.

Es un **ERP/CRM en producción**: SPA React (migrada 2026-05-22) sobre FastAPI, con design system CIRCUITO, CRM v2, cotizador robusto, remisiones v2 con arquitectura por dominios, centro de cobranza, base instalada y consola de plataforma (super-admin). **Mono-tenant** — `app/models/nucleus.py` (Organization/Branch/UserOrganization) fue retirado; solo quedan columnas `organization_id` inertes.

## Cifras (verificadas 2026-08-04)

| | |
|---|---|
| Routers `app/routers/` | 25 (+ el router del dominio remisiones) |
| Dominios `app/domains/` | 1 (`remisiones`) |
| Modelos `app/models/` | 23 módulos de dominio (+ `__init__`) |
| Servicios `app/services/` | 11 |
| Revisiones Alembic | 54 (un solo head) |
| Features SPA `web/src/features/` | 25 · 35 páginas |
| Primitivas `web/src/components/ui/` | 21 |
| Tests backend (`pytest`) | 75 en `tests/` (11 archivos) |
| Tests frontend (`vitest`) | 35 en 2 archivos |
| Templates Jinja `app/templates/` | 20 (respaldo histórico, `_SSR_ROUTES` vacía) |

## Stack (resumen — ver `CLAUDE.md` para detalle)

- **Backend:** FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL (`psycopg`), Python 3.12.
- **Frontend:** SPA React 18 + Vite 5 + TypeScript + Tailwind (compilado) + shadcn/ui + Zustand + TanStack Query v5 + React Router v6 + recharts + `@dnd-kit`, en `web/src/features/<x>/`. Build a `app/static/dist/` (commiteado).
- **Auth:** JWT en cookie HttpOnly `access_token`.
- **Tests:** `pytest` (backend, SQLite en memoria vía `conftest.py` — excepción solo-tests) + `vitest` (frontend, colocated). `pytest` vive en `requirements-dev.txt`, no en `requirements.txt` (Railway no lo instala).
- **Deploy:** Railway (builder **Railpack**: solo instala dependencias Python; **NO compila la SPA** → el `app/static/dist/` commiteado ES el frontend de producción); Procfile = `uvicorn`. **Alembic NO corre en deploy** → shim `_BACKFILL_DDL` para columnas en tablas existentes; `create_all()` en lifespan crea tablas nuevas.

## Arquitectura por dominios (patrón vigente para módulos nuevos)

`app/domains/remisiones/` = `router.py` (HTTP/permisos) · `service.py` (reglas + transacciones) · `repository.py` (queries) · `schemas.py` · `documents.py` · `templates/`. El router legacy `app/routers/remisiones.py` fue **retirado**. Todo módulo nuevo va aquí; `ventas.py`/`productos.py`/`compras.py` siguen gordos y se migrarán por dominio.

## Qué está construido (módulos en producción)

**Comercial:** Dashboard (KPIs + recharts + panel recordatorios) · **CRM v2** (Kanban DnD + detalle de deal `/spa/crm/deals/:id`, actividades con timeline automático de eventos `sistema`, métricas de conversión por etapa con `tasa_ganado_pct`, CRUD/reorden de etapas, deal→cotización con re-vinculación automática) · **Cotizador** (costo+utilidad, multimoneda direccional, plantillas, recotización versionada, PDF desglose/unificado + Word + remisión + reporte de servicio, fase 1 móvil) · Borradores · Seguimiento · **Recordatorios** · Clientes/Empresas + Contactos (detalle en 8 tabs, dedup, estado de cuenta + PDF) · **Base instalada** (`Planta` + `ActivoInstalado` con garantía y estado, tabs Plantas/Activos en el detalle de empresa).

**Operación:** Compras (OC desde cotización) · Fantasmas (promover a producto) · **Remisiones v2** (ver abajo) · Reportes de servicio · Gastos.

**Catálogo:** Inventario (costo-first, kardex auditable, reservas, import Excel) · Servicios · Precios proveedor · Diccionarios (marcas/categorías + **catálogo administrable `unidades_medida`** + navegador SAT).

**Finanzas:** Centro de cobranza (aging 0-30/31-60/61-90/90+, top deudores, pago distribuido FIFO, estado de cuenta PDF) · FX (Banxico + fallback, override manual).

**Reportes:** `/spa/analitica` con tabs `ventas`/`operativo` (las rutas viejas `/spa/reportes` y `/spa/reportes-servicio` redirigen ahí).

**Plataforma (Consola Super-Admin, solo dev — skin propio vía `PlatformShell`):** Usuarios de plataforma (CRUD + rol superadmin, blindajes anti-escalada) · Configuración runtime (IVA/vigencia/tolerancia TC sin redeploy) · Auditoría global · Salud del sistema · Mantenimiento (re-seeds, jobs, seed-context, zona roja drop-all-tables con doble guarda).

## Remisiones v2

- **Estados** `EstadoRemision`: `BORRADOR → EMITIDA → RECIBIDA`, con `CANCELADA` como salida. Emisión asigna folio bajo `pg_advisory_xact_lock` y descuenta stock; cancelación revierte.
- **Patrón lock → refresh → re-check** en toda mutación con estado (evita TOCTOU), con 404 explícito si la fila fue borrada durante la espera del lock.
- **Entregas parciales con acumulados:** `repository.entregado_por_detalle` / `pendientes_por_detalle`; emitir sobre el pendiente exige sobre-entrega autorizada. Stock híbrido: solo mueven inventario las líneas ligadas a partida de orden con producto real.
- **Unidades comerciales:** `cantidad` en `Numeric(12,3)`; `unidad` es snapshot string del catálogo `unidades_medida`. Documentos formatean a máx. 2 decimales (`app/services/formato.py`).
- **Remisión → cotización:** `POST /api/remisiones/{id}/crear-cotizacion`.
- **Editor híbrido:** `/spa/remisiones` **es el editor** (espejo del cotizador, comparte `web/src/components/document/`); historial en `/spa/remisiones/historial`; `/spa/remisiones/:id/editar`; `/spa/remisiones-nueva?orden=N` redirige conservando el query string.
- **Documentos** desde plantillas en archivo (branding configurable, marca de agua en borrador), PDF/HTML imprimible + Word.
- **Permisos:** recurso `remision` en la matriz (`read/create/emitir/recibir/cancel/sobreentrega/convertir`) con owner-scoping para VENTAS.

## Design system CIRCUITO (2026-08-04)

Reemplaza el "premium cyan" del 2026-06-04. Acento **esmeralda técnica `#2ee6a8`**; **sidebar negro absoluto en ambos temas** (solo el contenido responde a claro/oscuro). Tokens semánticos HSL en `web/src/index.css` + `tailwind.config.ts` (light = neutros verdosos + esmeralda profunda; dark = negro verdoso). **Marco fijo:** `.app-frame` a `100dvh`, solo `<main class="app-canvas">` scrollea. Primitivas nuevas: `page-header`, `empty-state`, `skeleton`, `drawer`, `timeline`, `form-field`. Componentes de documento compartidos en `components/document/`.

**Branding por tenant:** `web/src/lib/branding.ts` — presets seleccionados por `VITE_TENANT` (`dasic` default, `atlas` neutro). Nombre de organización, tagline, producto, logo, placeholders y copy del login salen de ahí. Nuevo tenant = nuevo preset, nunca un fork.

## Tipo de cambio — modelo direccional (2026-08-04)

USD→MN multiplica por **DOF + tolerancia**; MN→USD divide entre **DOF − tolerancia**; el costo de OC al proveedor usa **DOF puro**. Sustituye al modelo unificado del 2026-06-10 (una sola tasa espejo) que dejaba MN→USD sin protección. Espejo exacto entre `app/routers/ventas.py::_resolve_directional_tcs` y `web/src/features/cotizador/lib/calc.ts::resolveDirectionalTcs`. Overrides del payload solo se honran dentro de la banda `[DOF·0.5, DOF·1.5]` (descarta el sentinela legacy `0.000001` que reventaba importes ×1,000,000).

## RBAC

Roles: `SUPERADMIN`, `ADMINISTRADOR` (="admin"), `GERENTE_COMERCIAL` (="asistente"), `VENTAS` (="vendedor"), `OPERATIVO`. **Matriz declarativa** en `app/security/permissions.py`: tuplas `(action, resource)`, helpers `can()` / `require()` (403) / `scope_query_by_owner()` para `:own`. ADMIN y SUPERADMIN tienen wildcard. Flags `can_*` + `modulos_visibles` se sirven a `/api/me` y el front los lee vía `lib/permissions.ts`. Decoradores `allow_*` de `jwt.py` siguen por compatibilidad; endpoints nuevos usan `require()`.

## Riesgos / deuda

1. **Routers gordos:** `ventas.py`, `productos.py`, `compras.py` mezclan dominio/persistencia/presentación. Solo `remisiones` migró al patrón `app/domains/`.
2. **Cobertura de tests desbalanceada:** 55 de 75 tests de backend son de remisiones; el frontend solo cubre `calc.ts`. Cotizador backend, CxC y CRM sin tests. No hay tests de componentes (vitest corre en entorno `node`, sin jsdom).
3. **`create_all()` + `_BACKFILL_DDL` coexisten con Alembic** (Railway no corre migraciones). Riesgo de drift entre lo que crea `create_all` y lo que declaran las revisiones.
4. **Decimales** serializados como string; los types TS dicen `number` (coerción).
5. **`docs/development/testing.md` está desactualizado** — afirma que el backend no tiene tests y describe `resolveDirectionalTcs` con el modelo unificado viejo.
6. **Multi-tenancy retirada a medias:** columnas `organization_id` siguen en varias tablas sin ninguna semántica de aislamiento.

## Pendientes (roadmap activo)

1. **Migrar más módulos a `app/domains/`** (ventas/cotizador, compras, inventario).
2. **Ampliar tests** — cotizador backend, CxC, CRM; tests de componentes con jsdom.
3. **Migrar las páginas slate restantes a tokens CIRCUITO** (cotizador, remisiones, primitivas y chrome ya están).
4. **RBAC:** terminar de mover endpoints viejos de `allow_*` a `require()`.
5. **Super-admin:** impersonación, feature flags, Módulo B v2 (`audit_log` + instrumentar login/CRUD usuarios/precio-stock), log de mantenimiento.
6. **Aprobaciones de descuento** por rol; **WhatsApp nivel B**.
7. **Fase 6 Alembic-only:** retirar `create_all()` y `_BACKFILL_DDL`.
8. **`SECRET_KEY` persistente en Railway.**
9. **Actualizar `docs/development/testing.md`.**

## Histórico (lanes cerrados — resumen)

RBAC fase 1 · catálogo costo-first · cotizador fase 2 (multimoneda) · seguimiento · folios/recotización · OC real · migración SPA (2026-05-22) · Atlas ONE rebrand + theme · arquitectura de documentos (OC/remisión/reporte desde cotización) · empresas+contactos · auditoría paralela · super-admin Módulos 0/A/B/C/D · design system premium (2026-06) · paginación · módulos activados (estado cuenta/kardex/SAT) · CRM Kanban · centro de cobranza · recordatorios · **2026-08:** base instalada (plantas/activos) · harness vitest · fase 1 móvil del cotizador · dominio remisiones (repository/service/router/documents) · remisiones v2 UI completa · unidades administrables · CRM v2 (detalle, actividades, métricas, etapas, deal→cotización) · editor híbrido de remisiones · modelo direccional de TC · design system CIRCUITO · branding por tenant. Detalle por commit en `git log`.
