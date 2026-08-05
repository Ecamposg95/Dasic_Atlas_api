# Deuda técnica

> Auditoría Task Pack 00 · 2026-08-03 · **actualizada 2026-08-04**. Clasificación: 🔴 crítica · 🟠 importante · 🟡 deseable · ⚪ posponible. Los ítems cerrados se marcan **✅ RESUELTO** y se conservan como registro.

## Funcional / calidad

| # | Deuda | Clase | Estado 2026-08-04 |
|---|---|---|---|
| 1 | ~~**Cero tests**~~ → **Tests parciales, sin CI** | 🟠 | ✅ **PARCIALMENTE RESUELTO.** Ya existen dos harnesses: **pytest** (`pytest.ini`, `requirements-dev.txt`) con **9 archivos / 75 funciones `test_*`** en `tests/` — folios, `fmt_cantidad`, modelo/repository/service/documents/API de remisiones, guard de decimales de stock, unidades, smoke; y **Vitest** en `web/` con **2 archivos / 35 tests** (`cotizador/lib/calc.test.ts` + `cotizador/store.test.ts`, verde al correr `npm run test`). **Vigente:** no hay CI (`.github/workflows/` no existe) — nada corre automáticamente en push; `requirements-dev.txt` aún **sin trackear** en git. |
| 1b | **Tests de backend sobre SQLite in-memory con shims** | 🟠 | **Nuevo.** `tests/conftest.py` crea el engine sobre `sqlite://` y parchea las funciones Postgres-only (`hashtext`, `pg_advisory_xact_lock`) como funciones SQLite no-op. Contradice la regla del repo "PostgreSQL only, sin fakes en memoria" y deja sin cubrir todo lo específico de Postgres (advisory locks reales, tipos, `GROUP BY` estricto — precisamente la clase de bug de `f501338`). Siguiente paso: service container `postgres:16` en CI con DB efímera por sesión. |
| 1c | `docs/development/testing.md` desactualizado | 🟡 | **Nuevo.** Sigue afirmando "el backend no tiene tests todavía" y describe pytest como plan futuro. Debe reescribirse para documentar el harness que ya existe (incluida la limitación SQLite de #1b). |
| 2 | **Sin lint/format** | 🟠 | **Vigente.** No hay ESLint/Prettier/Ruff config en la raíz ni en `web/`. Consistencia depende de disciplina. |
| 3 | Decimales `number \| string` en types TS | 🟠 | **Vigente.** Backend serializa `Decimal` como string; los types lo modelan como unión (`clientes/types.ts:14`, `cotizador/types.ts:32,147-149`, `crm/types.ts:78`) y el front coacciona con `Number()`. Contrato frágil (ordenamientos, sumas). |
| 4 | `types:gen` (openapi-typescript) configurado pero sin uso | 🟡 | **Vigente.** El script sigue en `web/package.json`; `web/src/types/` no existe. Types curados a mano (convención aceptada), pero el script muerto confunde. |

## Arquitectura backend

| # | Deuda | Clase | Estado 2026-08-04 |
|---|---|---|---|
| 5 | **Thick routers** | 🟠 | **Vigente, con patrón de salida ya probado.** `ventas.py` 2,438 L (creció; incluye plantilla PDF inline), `compras.py` 1,191, `clientes.py` 1,162, `productos.py` 943. **Mitigación real:** remisiones se extrajo a `app/domains/remisiones/` (router 436 + service 437 + repository 96 + schemas 53 + documents 97 + plantilla `.j2`), y `app/routers/remisiones.py` desapareció. También se extrajeron `folio_service`, `config_service` y `formato` del código duplicado en routers. `ventas.py` es el siguiente candidato obvio. |
| 6 | Doble vía de esquema (`create_all` + `_BACKFILL_DDL` + Alembic) | 🟠 | **Vigente y creciendo.** 84 sentencias `ADD COLUMN IF NOT EXISTS` en `app/db/seeds.py` (897 L). Railway no ejecuta Alembic; toda columna nueva requiere entrada doble. Fuente conocida de crashes si se olvida el re-export o el backfill. Nota positiva: tras `ad5b796` el árbol de migraciones vuelve a tener **un solo head** (`20260803_03`, 53 revisiones). |
| 7 | Autorización inconsistente | 🟠 | **Vigente, mejor acotada.** Conteo verificado sobre los 228 endpoints: **6 sin ninguna dependencia de autenticación** (aparte de `/login` y `/logout`, que deben ser públicos) — `GET /api/clientes/{id}/pdf-estado-cuenta` y cinco de `compras.py`: `GET`/`POST /proveedores`, `GET /`, `GET /historial`, `GET /{id}/imprimir`. Otros **21 autentican pero no declaran rol en la firma**; de esos, los 12 de remisiones sí aplican la matriz vía `require()` en el cuerpo y los 6 de recordatorios son owner-scoped por `current_user` — los realmente sueltos son `POST /api/inventario/movimientos` (solo `get_current_user`) y `POST`/`PATCH /api/catalogos/unidades`. |
| 8 | RBAC por rol-string, sin enforcement tenant-aware | 🟡 | **Vigente, pero con matriz central.** `app/security/permissions.py` (287 L) define la matriz `(action, resource)` por rol con variantes `:own` y ya es el mecanismo real de remisiones (incluido el rol `OPERATIVO`). El resto de routers sigue con los helpers rol-string de `app/security/jwt.py`. Migrar el resto a la matriz es el trabajo pendiente; el enforcement por tenant sigue bloqueado por la realidad mono-tenant. |
| 9 | `SECRET_KEY` puede rotar por deploy en Railway | 🟠 | **Vigente** (no verificable desde el repo — config de plataforma). Invalida sesiones. |
| 10 | Branding hardcodeado en generadores de documentos backend | 🟠 | **Nuevo / parcial.** Remisiones ya lee `config_service.empresa_nombre` y usa plantilla en archivo. El resto sigue con "DASIC" inline en HTML de documento (`compras.py:85,116,170`, `clientes.py:865`) y en el título de la app (`main.py:48`). Bloquea la identidad neutra SaaS del lado servidor. |

## Frontend

| # | Deuda | Clase | Estado 2026-08-04 |
|---|---|---|---|
| 11 | ~~**~87 archivos con `slate-*`** (692 ocurrencias)~~ | 🟠 | ✅ **RESUELTO.** Quedan **11 ocurrencias en 4 archivos** (`Header.tsx`, `Sidebar.tsx`, `ui/button.tsx`, `LoginPage.tsx`), todas intencionales (texto oscuro sobre esmeralda / panel negro del login). Contra **796 ocurrencias en 96 archivos** medidas en `c59f89f` con el mismo patrón estricto. |
| 12 | ~~**Branding DASIC/Atlas hardcodeado** en ~20 sitios~~ | 🟠 | ✅ **RESUELTO en frontend.** `web/src/lib/branding.ts` con presets por `VITE_TENANT` (`dasic` / `atlas`), consumido por 6 archivos; las 2 menciones a "DASIC" que quedan en `web/src` son comentarios de reglas de negocio. El lado backend queda abierto — ver #10. |
| 13 | ~~Primitivas faltantes (PageHeader, EmptyState, Skeleton, Drawer, Breadcrumbs, Stepper, Timeline)~~ | 🟠 | ✅ **MAYORMENTE RESUELTO.** `components/ui/` pasó de 15 a **21 primitivas**: se agregaron `page-header`, `empty-state`, `skeleton` (+`SkeletonText`/`SkeletonRows`), `drawer`, `timeline`, `form-field`. Adopción: `PageHeader` en 28 archivos, `EmptyState` en 13, y **los 5 drawers de feature ya consumen `ui/drawer`** (no quedan drawers ad-hoc). **Vigente:** `Breadcrumbs` y `Stepper` siguen sin existir, y **7 archivos aún dibujan skeletons inline** con `animate-pulse` (dashboard ×3, reportes, reportes_servicio, reportes_servicio_docs, `compras/RegistrarPagoModal`) en vez de usar la primitiva. |
| 14 | Formularios sin `<form onSubmit>` ni field wrapper | 🟠 | ✅ **RESUELTO en el grueso.** `FormField` + `<form onSubmit>` adoptado en **15 modales** (clientes, compras OC, pagos compras y cxc, contactos, CRM deal y etapas, gastos, inventario, precios, recordatorios, servicios, usuarios, superadmin ×2) más `PlantasTab`, `ActivosTab` y `DealDetallePage`. |
| 15 | Hooks de catálogo duplicados (`useProveedores` ×4) | 🟡 | **Vigente.** Sigue habiendo 4 definiciones (`compras`, `cotizador`, `fantasmas`, `inventario`) con query keys divergentes → caches duplicados. Patrón correcto ya demostrado: `features/contactos/useContactoMutations` compartido. |
| 16 | `RegistrarPagoModal` ×2 casi-duplicado | 🟡 | **Vigente** (compras vs cxc). |
| 17 | Guard de auth post-render en `Layout` | 🟡 | **Vigente.** `Layout.tsx` rehidrata con `/api/auth/me` en `useEffect` y redirige a `/` en 401; sigue sin `ProtectedRoute`/loader → flash de contenido. |
| 18 | ~~Sin ruta 404 catch-all~~ | 🟡 | ✅ **RESUELTO.** `components/NotFound.tsx` montado como catch-all dentro de `/spa` (`router.tsx:133`) y a nivel raíz (`router.tsx:158`). |
| 19 | ~~Feature `hello` huérfana en ruta viva~~ | ⚪ | ✅ **RESUELTO.** La feature y su ruta fueron retiradas (25 features hoy). |
| 20 | Chunk recharts 325 kB | ⚪ | **Vigente y aceptable.** 325.4 kB / 99.8 kB gzip, ya code-split y lazy. Medir antes de optimizar. |
| 21 | 19/20 templates Jinja muertos en `app/templates/` | ⚪ | **Vigente.** Respaldo intencional post-migración (`_SSR_ROUTES` vacía en `main.py:199`); retirar cuando haya confianza (Fase 6). |

## TODOs reales en código (siguen siendo 2)

- `web/src/features/cotizador/types.ts:49` — backend (`app/routers/ventas.py:104`) no devuelve el default de un campo en `/config/cotizador-defaults`.
- `web/src/features/cotizador/store.ts:322` — exponer `detalle.id` en `/detalle-json` para preservar identidad de líneas.

## Documentación

- `context/` mezcla docs vigentes con legacy contradictorio (`context/CLAUDE.md` describe un stack Next.js/Prisma que nunca fue; `UI_PATTERNS.md` describe Jinja+Alpine retirado). Riesgo de confundir a agentes/desarrolladores nuevos. Los avisos existen pero la limpieza está pendiente. El corpus creció a **92 markdown** entre `docs/` y `context/`.
- `CLAUDE.md` (raíz) aún afirma "**no hay test suite**" y "multi-tenancy no negociable" — ambas frases quedaron obsoletas y deberían corregirse (ver #1 y la sección de multi-tenancy en `architecture-current.md`).
