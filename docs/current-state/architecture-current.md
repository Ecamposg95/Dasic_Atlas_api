# Arquitectura actual

> Auditoría Task Pack 00 · 2026-08-03 · **actualizada 2026-08-04**.

## Backend (`app/`)

### Bootstrap
`app/main.py` → `app/core/lifespan.py` → `app/db/seeds.py`:
1. `configure_logging()` + `get_settings()` (valida `DATABASE_URL`, `SECRET_KEY` ≥32 chars).
2. Lifespan: `Base.metadata.create_all()` (crea tablas nuevas; desactivable con `DASIC_AUTO_CREATE_TABLES=0`) + `run_all_seeds()`:
   `run_backfill_ddl` (shim `ALTER TABLE … ADD COLUMN IF NOT EXISTS` porque Railway no corre Alembic) · `seed_super_admin` · `seed_dedicated_superadmin` (`SUPERADMIN_EMAIL/PASSWORD`) · `promote_superadmin_from_env` · `seed_marcas` · `seed_sat_*` · `seed_default_pipeline`.
3. **25 routers** montados bajo `/api/*` (`app/main.py:96-120`). SPA servida desde `app/static/dist/` (rutas `/spa/*` devuelven `index.html` con `no-cache`). `_SSR_ROUTES` sigue **vacía** (`app/main.py:199`) — Jinja solo queda como fallback de emergencia del login.

### Capas

- **`app/domains/` (nuevo, 2026-08-03/04)** — patrón de extracción por dominio, sustituye al thick router. Único caso hoy: `app/domains/remisiones/` (1,181 L totales):
  - `router.py` (436 L, 12 endpoints) — HTTP + gates de permiso vía `permissions.require(user, action, "remision")` y `is_owner_scoped`; helpers `_check_owner`, `_check_operativo_estado`, `_validar_estado`.
  - `service.py` (437 L) — reglas de ciclo de vida: emisión con pendientes, sobre-entrega autorizada, stock híbrido, cancelación con reversa, conversión remisión→cotización.
  - `repository.py` (96 L) — acumulados de entrega por partida y listado filtrado.
  - `schemas.py` (53 L), `documents.py` (97 L) y `templates/remision.html.j2` (61 L) — documento en archivo, no HTML inline en el router.
  - **`app/routers/remisiones.py` ya no existe.**
- `app/models/` — 23 módulos por dominio, **47 tablas**. Enums tolerantes a aliases legacy (`TolerantEnum`). Nuevos hoy: `instalaciones.py` (`plantas`, `activos_instalados`), `unidades.py` (`unidades_medida`), `DealActividad` en `crm.py`.
- `app/schemas/` — 15 módulos Pydantic v2 espejo del dominio (los de remisiones ya viven en `app/domains/remisiones/schemas.py`).
- `app/routers/` — **thick routers** (siguen mezclando dominio, persistencia y presentación): `ventas.py` 2,438 L (incluye plantilla PDF inline), `compras.py` 1,191, `clientes.py` 1,162, `productos.py` 943, `crm.py` 684, `dashboard.py` 683.
- `app/services/` — 11 módulos: `stock_service` (kardex/reservas), `cuentas_por_cobrar` (aging/pagos FIFO), `fx_service`, `auto_oc_service`, `ai_service`, `email_service`, `word_service`, `fantasmas_service`, **`folio_service`** (advisory lock + `MAX(folio)` + regex, locker inyectable), **`config_service`** (lectura tipada de `PlatformConfig`, incl. `empresa_nombre`), **`formato`** (`fmt_cantidad`: display de cantidades `Numeric(12,3)` con máx 2 decimales). `UserService` vive en `services/__init__.py`.
- `app/security/permissions.py` (287 L) — **matriz central de permisos** `(action, resource)` por rol, con variantes `:own`. Recursos incluidos: `remision` (`read`/`create`/`write`/`emitir`/`cancel`/`sobreentrega`/`convertir`/`recibir`), entre otros. `app/security/jwt.py` (124 L) mantiene los helpers por rol-string (`allow_admin`, `allow_all_staff`, `allow_admin_asistente`, …) que aún usan la mayoría de routers.
- Roles en `RolUsuario`: `SUPERADMIN`, `ADMINISTRADOR`, `GERENTE_COMERCIAL`, `VENTAS`, **`OPERATIVO`** (almacén/soporte — recepción física de remisiones) + aliases legacy.

### Autenticación
JWT en cookie HttpOnly `access_token` (12h por defecto, `REMEMBER_SESSION_DAYS=30`). API acepta Bearer o cookie. CSRF vía `starlette-csrf`.

## Frontend (`web/src/`)

```
web/src/
├── App.tsx               # QueryClientProvider + Toaster + ConfirmHost
├── router.tsx            # createBrowserRouter, lazyPage() anti chunk-stale, catch-all <NotFound/>
├── components/
│   ├── layout/           # Layout (.app-frame), Sidebar, Header, Footer, ThemeToggle, nav-config.ts
│   ├── ui/               # 21 primitivas shadcn-style tokenizadas
│   ├── document/         # DocumentCartTable/Row/TotalsBar/SectionDivider + ProductSearchPanel
│   │                     #   (compartidos cotizador / OC / remisión)
│   ├── NotFound.tsx
│   └── ErrorBoundary.tsx
├── features/<25 features> # types.ts + hooks/ + pages/ + components/ (+ lib/ y store.ts donde aplica)
├── lib/                  # api, permissions, branding, status-tones, toast, confirm, queryClient,
│                         #   utils, useDismiss, useFocusTrap
└── stores/               # auth.ts (memoria), theme.ts (localStorage)
```

- **Estado servidor:** TanStack Query. **Estado global:** Zustand mínimo (auth + theme; stores de feature en cotizador y remisiones).
- **Guard de auth:** sigue dentro de `Layout` (post-render, rehidrata vía `/api/auth/me` y redirige a `/` en 401) — no hay `ProtectedRoute` a nivel router. **Sí hay catch-all 404** (`router.tsx:133` y `:158`).
- **Design system (identidad CIRCUITO):** tokens semánticos HSL en `index.css` (182 L: bloques `:root` y `.dark`) + `tailwind.config.ts`. Acento esmeralda técnica `#2ee6a8` (glow) / `#0d9f6e` (deep). **Sidebar negro absoluto en ambos temas** (`--sidebar-bg: #000000` definido una sola vez, sin override en `.dark`), con `--sidebar-active: #2ee6a8`. Shell de marco fijo: `.app-frame` (`height: 100dvh`, `overflow-hidden`) + `.app-canvas` (fondo con radiales de `--ring`/`--primary`) — solo el `<main>` scrollea.
- **Adopción de tokens: prácticamente total.** Quedan **11 ocurrencias** de `*-slate-*` en **4 archivos** (`Header.tsx`, `Sidebar.tsx`, `ui/button.tsx`, `LoginPage.tsx`), todas intencionales: texto oscuro sobre fondo esmeralda o sobre el panel negro del login. Contra **796 ocurrencias en 96 archivos** en la auditoría original (`c59f89f`).
- **Primitivas nuevas:** `page-header`, `empty-state`, `skeleton`, `drawer`, `timeline`, `form-field`, `status-badge`, `list-toolbar`, `pagination`, `sat-combobox`, `collapsible-card`. `PageHeader` se usa en 28 archivos, `EmptyState` en 13, `Drawer` en 5. **`FormField` + `<form onSubmit>` adoptado en 15 modales** (+ `PlantasTab`, `ActivosTab`, `DealDetallePage`).
- **Branding por tenant:** `web/src/lib/branding.ts` — presets `dasic` / `atlas` seleccionados por `VITE_TENANT`; expone `organizationName`, `tagline`, `productName`, `logoUrl`, `loginHeadline`, `loginBullets` y `documentTitle()`. 6 archivos lo consumen; **no queda ninguna cadena de marca hardcodeada en la UI** (las 2 menciones a "DASIC" restantes en `web/src` son comentarios de reglas de negocio).
- **Shell secundario:** `PlatformShell` (superadmin) — guard por rol dentro del componente.

## Flujo de dominio central

```
Cliente/Empresa (+ Plantas + Activos instalados) → Deal (CRM Kanban, detalle + timeline de
actividades + métricas de pipeline) → Cotización (COT-YYYYMM-XX-NNNN, costo+utilidad,
multimoneda TC direccional) → [versionada / plantillas / PDF / Word / email / WhatsApp-log]
→ Convertir a Venta (VTA-…) → OC a proveedor (agrupada, borrador→confirmar)
→ Recepción (stock ENTRADA) → Remisión v2 (BORRADOR → EMITIDA → RECIBIDA | CANCELADA,
   entregas parciales con acumulados) → Reporte de servicio → CxC (cargo, aging, pago FIFO)
```

Reservas de stock al guardar cotización (solo catálogo); liberación/consumo al cancelar/convertir. Todo movimiento pasa por `stock_service.aplicar_movimiento` → fila en `movimientos_stock`. El evento que descuenta stock físico es configurable (`config_service.stock_evento_descuento`: `venta` | `remision`).

### Remisiones v2

- Estados en `EstadoRemision` (`app/models/enums.py:159`): `BORRADOR` / `EMITIDA` / `RECIBIDA` / `CANCELADA`, con `emitida_at/por_id`, `cancelada_at/por_id`, `motivo_cancelacion`, `sobre_entrega_autorizada_por_id`, `stock_descontado`.
- **Entregas parciales con acumulados**: `repository.entregado_por_detalle` suma lo ya remisionado por `detalle_orden_id`; `GET /api/ventas/{id}/avance-entrega` (`app/routers/ventas.py:2071`) expone el avance desde la venta.
- **Unidades comerciales**: catálogo administrable `unidades_medida` (`app/models/unidades.py`, endpoints en `app/routers/catalogos.py:400+`). Las partidas guardan la unidad como **string snapshot** — renombrar no reescribe documentos históricos.
- **Cantidades `Numeric(12,3)`** en `detalles_remision.cantidad`; display vía `formato.fmt_cantidad`.
- **Conversión remisión→cotización**: `POST /api/remisiones/{id}/crear-cotizacion`.
- **Permisos por rol**: matriz en `app/security/permissions.py:74-115` — ADMIN/GC gestión completa, VENTAS `:own` (sin cancelar ni sobre-entrega, con lectura ampliada a remisiones de sus propias órdenes), OPERATIVO solo `read` + `recibir` y **nunca ve BORRADOR/CANCELADA** (404, no 403).
- **Documentos**: `.docx` (`GET /{id}/word`) y HTML imprimible (`GET /{id}/imprimir`, autoescape activo) desde `templates/remision.html.j2`, con marca de agua BORRADOR/CANCELADA y `empresa_nombre` configurable. No hay PDF nativo de remisión.
- **Editor híbrido**: `/spa/remisiones` es un editor espejo del cotizador (mismo `DocumentCartTable`/`ProductSearchPanel`); el listado vive en `/spa/remisiones/historial`.

### Tipo de cambio — modelo direccional (2026-08-04)

`_resolve_directional_tcs` (`app/routers/ventas.py:171`) y su espejo exacto `resolveDirectionalTcs` (`web/src/features/cotizador/lib/calc.ts:215`):

- **USD→MN**: multiplica por `DOF + tolerancia` (más pesos por dólar cobrado).
- **MN→USD**: divide entre `DOF − tolerancia` (más dólares por peso cobrado), con guarda a `DOF` si `tolerancia ≥ DOF`.
- Sustituye al "modelo unificado" del 2026-06-10 (una sola tasa espejo), que dejaba MN→USD sin protección.
- Overrides del payload se honran **por dirección** solo si caen en la banda de plausibilidad `[DOF·0.5, DOF·1.5]` (descarta sentinelas legacy como `0.000001`).
- El costo de OC al proveedor usa **DOF puro** (`convertCostDOF`), sin spread.

## Multi-tenancy

Retirada en `20260429_01_drop_multitenant`. `organization_id` sobrevive solo en `pipelines`, `pipeline_stages`, `deals`, `deal_actividades` y `servicios` (inerte). No hay `Organization` activa ni membresías. El camino SaaS documentado en `modernization-opportunities.md` parte de tenant-config frontend + branding — ese primer paso ya está dado en `lib/branding.ts`; el backend aún no tiene equivalente salvo `config_service.empresa_nombre` (usado solo por remisiones).
