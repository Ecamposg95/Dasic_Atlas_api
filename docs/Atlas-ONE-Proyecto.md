---
title: Atlas ONE — DASIC Industrial (ERP/CRM)
tags: [proyecto, dasic, atlas-one, erp, crm, fastapi, react, documentacion]
updated: 2026-08-04
repo: dasic-atlas-api
estado: producción (Railway, autodeploy desde main)
---

# Atlas ONE · DASIC Industrial

> [!abstract] Qué es
> **Atlas ONE** es el ERP/CRM industrial de **DASIC Industrial**: cotizador inteligente acoplado a inventario, CRM de pipeline, compras, remisiones con entregas parciales, cobranza y reportería, más una **consola de plataforma** separada para el dev/operador. Hoy es una **SPA React** servida por un backend **FastAPI**, desplegada en **Railway** con autodeploy desde `main`.

> [!warning] Documentos legacy
> El `README` y varios docs en `context/` describen estados **anteriores** (SSR Jinja2 + Alpine, multi-tenant estricto, e incluso un boceto Next.js/Prisma que nunca se implementó). **Nada de eso aplica.** La fuente de verdad del stack es `CLAUDE.md` (raíz) y este documento. Migración a SPA: **2026-05-22**. Multi-tenancy: **retirada** — `app/models/nucleus.py` (Organization/Branch/UserOrganization) ya no existe; quedan columnas `organization_id` inertes en algunas tablas.

---

## 1. Stack

| Capa | Tecnología |
|------|-----------|
| **Backend** | FastAPI + SQLAlchemy 2.x + Alembic, Python 3.12 |
| **DB** | PostgreSQL (solo), vía `psycopg`. Sin SQLite en producción |
| **Auth** | JWT (`python-jose`) en cookie HttpOnly `access_token`; `passlib[bcrypt]` |
| **Frontend** | SPA React 18 + Vite 5 + TypeScript + Tailwind (compilado) + shadcn/ui + Zustand + TanStack Query v5 + React Router v6 |
| **PDF / export** | Plantillas Jinja imprimibles (en archivos para remisiones, inline en routers para el resto) + `fpdf2`, `openpyxl`, `python-docx`, `qrcode` |
| **Email** | SMTP (stdlib), vía `SMTP_*` |
| **IA** | Anthropic SDK (`app/services/ai_service.py`) |
| **FX** | Banxico SIE (TC FIX SF63528) + fallback `open.er-api.com` |
| **Gráficos** | recharts · **DnD:** `@dnd-kit` |
| **Tests** | `pytest` (backend, `tests/`) + `vitest` (frontend, colocated) |
| **Deploy** | Railway (builder **Railpack**: solo `pip install`, **NO compila la SPA** — el `dist/` commiteado es el frontend de producción); Procfile = `uvicorn`. **`alembic` NO corre en el deploy.** |

> [!tip] Dónde vive el código del front
> Toda página del sistema vive en `web/src/features/<feature>/` (25 features, 35 páginas). Build a `app/static/dist/` (commiteado a git). Cookie auth se preserva entre Vite dev (`:5173` proxy a `:8000`) y producción.

---

## 2. Arquitectura

### Bootstrap (`app/main.py` → `app/core/lifespan.py` → `app/db/seeds.py`)
1. `configure_logging()` + `get_settings()` (valida `DATABASE_URL`, `SECRET_KEY`).
2. **lifespan startup:** `Base.metadata.create_all()` (transicional — crea tablas nuevas automáticamente) + `run_all_seeds()`:
   - `run_backfill_ddl` — `ALTER TABLE … ADD COLUMN IF NOT EXISTS` idempotente (shim porque Railway no corre Alembic).
   - `seed_super_admin` — admin inicial si la DB está vacía.
   - `seed_dedicated_superadmin` — superadmin DEDICADO desde env (`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`).
   - `promote_superadmin_from_env` — promueve `BOOTSTRAP_SUPERADMIN_EMAIL`.
   - `seed_marcas`, `seed_sat_*`, `seed_contactos_principal`, `seed_default_pipeline`.
3. Routers bajo `/api/*` (25 en `app/routers/` + el router del dominio remisiones). Las rutas `/spa/*` sirven el `index.html` del SPA (`Cache-Control: no-cache`); `_SSR_ROUTES` está **vacía** a propósito.

### Modelos por dominio (`app/models/` — "design by domain", sin archivos todólogos)
`enums`, `users`, `catalog`, `clients`, `sales`, `purchases`, `finance`, `quote_events`, `inventory`, `fx`, `expenses`, `plantillas`, `sat`, `services`, `fantasmas`, `precios`, `remisiones`, **`unidades`** (UnidadMedida), `reportes_servicio`, `platform`, `crm` (Pipeline/PipelineStage/Deal/**DealActividad**), `recordatorios`, **`instalaciones`** (Planta/ActivoInstalado).

> [!important] `nucleus.py` ya no existe
> Organization/Branch/UserOrganization fueron retirados. No hay tenancy en runtime; `organization_id` sobrevive como columna en algunas tablas (p.ej. `deals`) pero no aísla nada.

### Patrón de dominios (`app/domains/<x>/`) — obligatorio para módulos nuevos

`app/domains/remisiones/` es la referencia y el primer módulo migrado (el router legacy `app/routers/remisiones.py` fue **retirado**):

```
app/domains/remisiones/
├── router.py        # HTTP: validación, permisos, códigos de estado. Sin lógica.
├── service.py       # Reglas de negocio + transacciones (locks, estados, stock).
├── repository.py    # Queries SQLAlchemy (acumulados, listado filtrado).
├── schemas.py       # Pydantic in/out del dominio.
├── documents.py     # Render de PDF/Word/HTML.
└── templates/       # Plantillas Jinja en archivo (no inline).
```

Los routers viejos (`ventas.py`, `productos.py`, `compras.py`) siguen mezclando dominio/persistencia/presentación — se migran por dominio, no de golpe.

### Frontend (`web/src/`)
- `features/<x>/` con patrón `types.ts` + `hooks/use<X>.ts` (TanStack Query) + `pages/<X>Page.tsx` + `components/`.
- **Primitivas** en `components/ui/`: `button`, `card`, `input`, `select`, `textarea`, `modal`, `tabs`, `badge`, `status-badge`, `data-table`, `pagination`, `list-toolbar`, `toaster`, `sat-combobox`, `CollapsibleCard` + las nuevas **`page-header`, `empty-state`, `skeleton`, `drawer`, `timeline`, `form-field`**.
- **Componentes de documento compartidos** en `components/document/`: `ProductSearchPanel`, `DocumentCartTable`, `DocumentRow`, `DocumentTotalsBar`, `DocumentSectionDivider` — la base común del cotizador y del editor de remisiones.
- Chrome en `components/layout/` (Sidebar, Header, Footer, ThemeToggle, Layout).
- `lib/branding.ts` (marca por tenant), `lib/permissions.ts`, `lib/api.ts`, `lib/status-tones.ts`.
- Router en `router.tsx` (code-split lazy + auto-reload ante chunk stale tras deploy + redirects de URLs legacy).

---

## 3. Design system CIRCUITO (2026-08-04)

> [!note] Identidad industrial fija
> Reemplaza el "premium cyan" del 2026-06-04. Acento **esmeralda técnica `#2ee6a8`**; el **sidebar es negro absoluto (`#000000`) en ambos temas** — solo el área de contenido responde a claro/oscuro.

- **Tokens semánticos HSL** (`web/src/index.css` + `tailwind.config.ts`): `background`, `surface`, `surface-2`, `foreground`, `muted-foreground`, `border`, `border-strong`, `ring`, `primary`, `accent`, `shadow-color`.
  - **Light:** neutros verdosos (`--background: 150 20% 97%`) + esmeralda profunda (`--primary: 161 90% 30%`).
  - **Dark:** negro absoluto verdoso (`--background: 155 12% 5%`) + esmeralda brillante (`--primary: 160 79% 54%`).
- **Marco fijo:** `.app-frame` = `100dvh` con `overflow-hidden`; solo el `<main class="app-canvas">` scrollea. El shell (sidebar/header/footer) nunca se mueve. `.app-canvas` lleva gradientes radiales `background-attachment: fixed`.
- **Microinteracciones:** `modal-in`, `drawer-in`, animaciones escalonadas del login (`login-fade-up`, `login-blob`, `login-sweep`), todas anuladas bajo `prefers-reduced-motion`.
- **Sidebar colapsable** (persistido en `localStorage`).

### Branding por tenant (`web/src/lib/branding.ts`)
Toda cadena de marca visible (nombre de organización, tagline, producto, versión, `poweredBy`, logo, placeholder de email, headline y bullets del login) sale de un **preset** seleccionado por `VITE_TENANT` (default `dasic`; existe también `atlas`, identidad neutra del producto SaaS). Regla: **nuevo tenant = nuevo preset, nunca un fork**. Helper `documentTitle(page)`.

---

## 4. Módulos

### Comercial
- **Dashboard** — KPIs, sparklines, tendencia (recharts), pipeline donut, alertas, panel de recordatorios.
- **CRM v2** (`/spa/crm`)
  - **Kanban** de deals por etapa con drag-and-drop y update optimista.
  - **Detalle de deal** (`/spa/crm/deals/:id`): datos comerciales (monto, moneda, probabilidad 0-100, cierre estimado, próximo paso, notas), cotización ligada y **actividades**.
  - **Actividades + timeline automático** — `DealActividad` (`nota|llamada|email|reunion|visita|sistema`). El backend inyecta eventos `sistema` en el mismo commit que la mutación: *"Deal creado"*, *"Movido a &lt;etapa&gt;"*.
  - **Métricas de pipeline** — `GET /api/crm/pipelines/{id}/metricas?dias=90`: deals abiertos por etapa, cerrados ganados/perdidos en el período y `tasa_ganado_pct`. (Los montos se suman **sin** conversión de moneda: `Deal` no guarda `tipo_cambio`.)
  - **CRUD de etapas** — crear/editar/eliminar/reordenar stages y renombrar el pipeline.
  - **Deal → cotización** — el botón abre `/spa/cotizador?deal_id=&cliente_id=`; al guardar la orden el cotizador hace `PATCH` del deal para ligarla de vuelta (y limpia el query param para no re-vincular).
- **Cotizador** — el corazón. Costo + utilidad (NO lista menos descuento). Multimoneda con TC del día. Líneas catálogo / fantasma / servicio / libres. Plantillas. Recotización versionada. PDF (desglose o unificado), Word, remisión, reporte de servicio.
- **Borradores · Seguimiento** — historial de cotizaciones con vigencia, filtros, acciones (recotizar, convertir, cancelar, recordar seguimiento).
- **Recordatorios** (`/spa/recordatorios`) — tareas de próximo contacto; vistas vencidos/hoy/próximos; panel en dashboard. Owner-scoped.
- **Clientes (Empresas) · Contactos** — CRM de cuentas con detalle en tabs: Resumen · Contactos · **Plantas** · **Activos** · Estado de cuenta · Actividad · Notas · Deals. Dedup/unificación de empresas.
- **Base instalada** (`app/models/instalaciones.py`, `app/routers/plantas.py`) — `Planta` (sitio físico del cliente) y `ActivoInstalado` (equipo con tipo, fabricante, modelo, serie, ubicación, fecha de instalación, garantía y estado `operativo|mantenimiento|fuera_servicio|baja`). Sin cascade: el router impide borrar una planta con activos.

### Operación
- **Compras** — OC desde cotización (borrador → persistencia), historial paginado.
- **Fantasmas** — productos no-catálogo solicitados; promover a producto real (con SAT).
- **Remisiones v2** — ver §5.
- **Reportes de servicio** — actas de servicio (PDF).
- **Gastos** — egresos operativos.

### Catálogo
- **Inventario** — productos costo-first, stock auditable (`movimientos_stock`/kardex), reservas, importación Excel/CSV.
- **Servicios · Precios (proveedor) · Diccionarios** (marcas/categorías + **catálogo administrable de unidades** + navegador SAT).

### Finanzas
- **Centro de cobranza** (CxC) — aging 0-30/31-60/61-90/90+ (donut), top deudores, registrar pago distribuido (FIFO), estado de cuenta PDF.
- **Tipo de cambio (FX)** — Banxico + fallback; override manual; modelo direccional (§6).

### Reportes
- **Analítica** (`/spa/analitica`, con tabs `ventas`/`operativo`) — `/spa/reportes` y `/spa/reportes-servicio` redirigen ahí.

### Plataforma (Consola Super-Admin — solo dev) — `/spa/superadmin/*`
> [!important] Identidad visual distinta vía `PlatformShell`, mismo Layout.
- **Overview · Usuarios de plataforma · Configuración · Auditoría · Salud · Mantenimiento.**
- **Usuarios** — CRUD con rol superadmin; blindajes anti-escalada (solo superadmin modifica/elimina/resetea otro superadmin), protección último-superadmin-activo, anti-auto-bloqueo.
- **Configuración** — IVA/vigencia/tolerancia de TC en runtime (sin redeploy).
- **Auditoría** — timeline global (cotizaciones + fusiones).
- **Salud** — versión/git/uptime, conteos DB, FX, integraciones (booleanos, sin secretos).
- **Mantenimiento** — re-seeds idempotentes, jobs (CxC vencidas, refresh FX), seed-context, **ZONA ROJA** (drop-all-tables con doble guarda: type-to-confirm "BORRAR TODO" + diálogo danger; solo superadmin).

---

## 5. Remisiones v2 (`app/domains/remisiones/`)

> [!success] Primer dominio con la arquitectura por capas y con tests
> Router legacy retirado. 55 de los 75 tests de backend cubren este módulo.

**Ciclo de vida** — `EstadoRemision`: `BORRADOR → EMITIDA → RECIBIDA`, con `CANCELADA` como salida. La emisión asigna folio bajo `pg_advisory_xact_lock` y descuenta stock; la cancelación revierte. Patrón obligatorio en toda mutación con estado: **lock → refresh → re-check** (nunca al revés: evita TOCTOU), con 404 explícito si otra transacción borró la fila mientras se esperaba el lock.

**Entregas parciales con acumulados** — `repository.entregado_por_detalle(orden)` suma lo ya remisionado por cada `DetalleOrden` y `pendientes_por_detalle` calcula el saldo. El editor muestra el avance por partida; emitir más de lo pendiente exige **sobre-entrega autorizada** (`sobre_entrega_autorizada_por_id`). Stock híbrido: solo las líneas ligadas a una partida de orden con producto real mueven inventario (`stock_descontado`).

**Unidades comerciales** — `DetalleRemision.cantidad` es `Numeric(12,3)` (igual que las demás cantidades tras la migración `20260803_02_numeric_unidades`), y `unidad` es un **snapshot string** tomado del catálogo administrable `unidades_medida` — renombrar una unidad no reescribe documentos históricos. Los documentos formatean cantidades a **máximo 2 decimales** (`app/services/formato.py`).

**Remisión → cotización** — `POST /api/remisiones/{id}/crear-cotizacion` genera una `OrdenVenta` en estatus cotización a partir de lo entregado (cierra el flujo "entregamos primero, formalizamos después").

**Editor híbrido** — `/spa/remisiones` **es el editor**, con interfaz espejo del cotizador (mismos `ProductSearchPanel` / `DocumentCartTable` / `DocumentTotalsBar`). El **listado/historial** vive en `/spa/remisiones/historial`; `/spa/remisiones/:id/editar` reabre un borrador y `/spa/remisiones-nueva?orden=N` redirige al editor **conservando el query string**. Documentos: PDF/HTML imprimible (con marca de agua en borrador) y Word, desde plantillas en archivo con branding configurable.

**Permisos** — recurso `remision` en la matriz: `read`/`create`/`emitir`/`recibir`/`cancel`/`sobreentrega`/`convertir`, con owner-scoping para VENTAS.

---

## 6. Tipo de cambio — modelo direccional (2026-08-04)

Regla de negocio DASIC: **la tolerancia protege la volatilidad en ambas direcciones**.

| Dirección | Tasa efectiva |
|-----------|---------------|
| USD → MN | multiplicar por **DOF + tolerancia** (más pesos por dólar cobrado) |
| MN → USD | dividir entre **DOF − tolerancia** (más dólares por peso cobrado) |
| Costo OC al proveedor | **DOF puro**, sin spread |

Sustituye al "modelo unificado" del 2026-06-10 (una sola tasa espejo), que dejaba MN→USD sin protección. Implementado en espejo exacto: `app/routers/ventas.py::_resolve_directional_tcs` y `web/src/features/cotizador/lib/calc.ts::resolveDirectionalTcs`.

> [!warning] Banda de plausibilidad
> Un override direccional del payload solo se honra si cae en `[DOF·0.5, DOF·1.5]`. Fuera de banda se **ignora** y se deriva del DOF — esto descarta el sentinela legacy `0.000001` persistido en cotizaciones viejas, que producía `costo / 0.000001` = importes ×1,000,000. Guarda extra: si la tolerancia alcanzara al DOF (divisor ≤ 0), cae al DOF.

---

## 7. Reglas no negociables (Golden Rules)

> [!danger] Cambió respecto a docs viejos
> - ~~SSR Jinja/Alpine~~ → **SPA React** en `web/src/features/<x>/`. NO crear `.html` nuevos en `app/templates/` (se conservan como respaldo histórico).
> - ~~Multi-tenant siempre~~ → **mono-tenant**: `nucleus.py` fue retirado. No asumir aislamiento por org.

- **Módulos nuevos = `app/domains/<x>/`** con `router` / `service` / `repository` / `schemas` (referencia: `remisiones`). No engordar `app/routers/`.
- **Folios, totales y movimientos de stock = server-side.** Nunca calcular folios en el front. Recalcular subtotal/IVA/total en el backend al guardar. Stock solo vía filas `MovimientoStock` (`stock_service.aplicar_movimiento`).
- **Mutaciones con estado: lock → refresh → re-check**, nunca leer estado antes del lock.
- **Cookie auth.** No mover auth al cliente. `@/lib/api` ya hace `credentials:'include'`.
- **Alembic para schema** + entrada paralela en `_BACKFILL_DDL` (Railway no corre alembic). Tablas NUEVAS las crea `create_all`; columnas en tablas existentes SÍ requieren backfill. **Un solo head** — verificar tras un merge.
- **Re-exportar** clases nuevas de modelos/schemas en `__init__.py` (+`__all__`) o la app crashea al arrancar (py_compile NO lo detecta).
- **Build SPA antes de push:** `cd web && npm run build`. Commitear `app/static/dist/`.
- **Enums en query:** nunca filtrar `rol` con strings crudos — usar `RolUsuario.X` (los valores de DB son `superadmin/admin/asistente/vendedor/operativo`, NO los nombres).
- **Marca del cliente = `lib/branding.ts`**, nunca hardcodeada en componentes.
- **Correr los tests** antes de declarar terminado (§9).

---

## 8. RBAC

Roles canónicos: `SUPERADMIN`, `ADMINISTRADOR` (="admin"), `GERENTE_COMERCIAL` (="asistente"), `VENTAS` (="vendedor"), `OPERATIVO`. Aliases legacy tolerados al leer.

**Matriz declarativa** en `app/security/permissions.py`: permisos como tuplas `(action, resource)` — `can(user, action, resource)`, `require(...)` (403) y `scope_query_by_owner(query, user, model)` para el sufijo `:own` (VENTAS ve/edita solo lo suyo). ADMIN/SUPERADMIN tienen wildcard `("*","*")`. Recursos: `cotizacion`, `venta`, `cliente`, `producto`, `oc`, `stock`, `remision`, `usuario`, `gasto`, `fx`, `costo`, `reportes`, `dashboard:{full,team,own,inventory}`. Los flags `can_*` + `modulos_visibles` se sirven a `/api/me` y el front los consume vía `lib/permissions.ts`.

Los decoradores viejos (`allow_admin`, `allow_admin_asistente`, `allow_all_staff`…) siguen en `app/security/jwt.py` por compatibilidad; **endpoints nuevos prefieren `require()`**.

---

## 9. Cómo correr

```bash
# Backend (auto-reload) — necesita DATABASE_URL + SECRET_KEY
uvicorn app.main:app --reload          # Swagger en /docs

# Frontend
cd web && npm install && npm run dev    # Vite :5173 (proxy a :8000)
cd web && npm run build                 # build a app/static/dist (pre-push)

# Tests
pytest                                  # backend: 75 tests en tests/ (pytest.ini → testpaths=tests)
cd web && npm run test                  # frontend: 35 tests (vitest run)
cd web && npm run test:watch            # modo watch

# Alembic
alembic upgrade head
alembic revision --autogenerate -m "desc"
alembic heads                           # debe devolver UN solo head
```

> [!warning] `pytest` no está en `requirements.txt`
> Vive en `requirements-dev.txt` (Railway no lo instala): `pip install -r requirements.txt -r requirements-dev.txt`. Los tests de backend usan **SQLite en memoria** vía `tests/conftest.py`, que shimea `hashtext`/`pg_advisory_xact_lock` como funciones no-op para poder ejercitar el código de producción sin Postgres. Esto es una excepción **exclusiva de tests** — la app sigue siendo Postgres-only.

**Env requeridas:** `DATABASE_URL`, `SECRET_KEY`. Opcionales clave: `BANXICO_TOKEN`, `ANTHROPIC_API_KEY`, `SMTP_*`, `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, `BOOTSTRAP_SUPERADMIN_EMAIL`, `VITE_TENANT` (build del front).

> [!tip] Crear tu cuenta superadmin (dev)
> Setear `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD` en Railway → redeploy → login. Idempotente, nunca pisa el password si ya existe.

---

## 10. Gotchas / lecciones

- **Chunk stale tras deploy:** `index.html` es `no-cache`, pero una SPA abierta puede pedir un chunk con hash viejo → `lazyPage` auto-recarga una vez (guarda en `sessionStorage`).
- **Enums lowercase:** el backend serializa enums en minúsculas (cargo/abono, entrada/salida, borrador/emitida). Comparar case-insensitive en el front.
- **Decimales:** el backend manda strings, los types TS dicen `number` (funciona por coerción).
- **Redondeo por línea:** subtotal/IVA/total se redondean a 2 decimales **por línea antes de sumar** — el preview del front debe replicar el `quantize` por línea del backend o el PDF no cuadra.
- **Pydantic v2** manda `detail` 422 como array de objetos → usar `normalizeDetail` en el front.
- **PDF cotización paginado:** pagina con encabezado de tabla repetido, filas sin partir, totales una vez, footer en flujo normal (última hoja).
- **Alembic multi-head:** un merge de rama de feature puede dejar dos heads (pasó con `20260803_01` vs `20260804_02`) — reparentar, no crear merge revision a ciegas.
- **`GROUPING ERROR` en Postgres:** al agrupar por una expresión (`coalesce(...)`) hay que **reutilizar la misma expresión** en el `GROUP BY`, no el alias.
- **Autoescape en Jinja:** las plantillas cargadas desde archivo necesitan `autoescape=True` explícito (`Environment` no lo activa solo).

---

## 11. Roadmap

> [!todo] Pendiente
> - **Migrar más módulos al patrón `app/domains/`** (siguientes candidatos: ventas/cotizador, compras, inventario) y sacar lógica de los routers gordos.
> - **Ampliar cobertura de tests** — hoy backend concentra remisiones/folios/stock/unidades; frontend solo el motor de cálculo del cotizador. Falta: cotizador backend, CxC, CRM, y tests de componentes (jsdom).
> - **Migrar las páginas slate restantes a tokens CIRCUITO** (cotizador, remisiones, primitivas y chrome ya están).
> - **RBAC:** completar la migración de decoradores `allow_*` a `require()` en endpoints viejos.
> - **Superadmin:** impersonación, feature flags, Módulo B v2 (`audit_log` + instrumentar login/CRUD usuarios/precio-stock), log de mantenimiento.
> - **Aprobaciones de descuento** por rol; **WhatsApp nivel B** (API oficial).
> - **Fase 6 Alembic-only:** retirar `create_all()` del lifespan y el shim `_BACKFILL_DDL` (requiere que Railway corra migraciones).
> - **`SECRET_KEY` persistente en Railway** (para que no rote por deploy).
> - **Actualizar `docs/development/testing.md`** — sigue diciendo que el backend no tiene tests.

> [!done] Cerrado recientemente (2026-08)
> Remisiones v2 completa (dominio, estados, entregas parciales, unidades, permisos, editor híbrido, remisión→cotización) · CRM v2 (detalle de deal, actividades + timeline automático, métricas, CRUD de etapas, deal→cotización) · Base instalada (plantas + activos) · Design system CIRCUITO · Branding por tenant · Primer harness de tests (pytest + vitest) · Modelo direccional de TC · Fase 1 móvil del cotizador.

---

## 12. Mapa rápido de archivos

| Necesito… | Archivo |
|-----------|---------|
| Stack real / reglas | `CLAUDE.md` (raíz) |
| Estado del repo | `context/02_REPO_CURRENT_STATE.md` |
| Patrón de dominios (referencia) | `app/domains/remisiones/` |
| Modelos por dominio | `app/models/*.py` |
| Matriz de permisos | `app/security/permissions.py` |
| Tokens / tema CIRCUITO | `web/src/index.css`, `web/tailwind.config.ts` |
| Marca por tenant | `web/src/lib/branding.ts` |
| Chrome / layout | `web/src/components/layout/` |
| Primitivas UI | `web/src/components/ui/` |
| Carrito compartido (cotizador/remisión) | `web/src/components/document/` |
| Rutas SPA | `web/src/router.tsx` |
| Seeds / bootstrap | `app/db/seeds.py`, `app/core/lifespan.py` |
| Consola dev | `web/src/features/superadmin/`, `app/routers/superadmin.py` |
| Cálculo de dinero (front) | `web/src/features/cotizador/lib/calc.ts` (+ `calc.test.ts`) |
| PDF cotización | `app/routers/ventas.py` (`PDF_TEMPLATE_VENTA`) |
| Tests backend | `tests/` (+ `tests/conftest.py`) |

---

> [!quote] TL;DR
> SPA React + FastAPI, mono-tenant, cotizador costo+utilidad multimoneda como corazón, remisiones v2 con entregas parciales y arquitectura por dominios, CRM v2 con timeline y métricas, base instalada, cobranza con aging, consola de plataforma dev, design system CIRCUITO (esmeralda + sidebar negro), branding por tenant y primer harness de tests. Deploy continuo a Railway desde `main`.
