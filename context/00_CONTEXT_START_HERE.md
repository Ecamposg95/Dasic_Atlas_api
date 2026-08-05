# Context Index (Atlas ONE — DASIC Industrial)

Este directorio contiene documentación del proyecto. La referencia de arquitectura original vino de Atlas ERP/POS, pero el producto vigente es **Atlas ONE** para DASIC Industrial.

> [!warning] **ESTE DIRECTORIO ES PARCIALMENTE LEGACY.** Varios docs describen el stack SSR (Jinja2 + Alpine) y multi-tenant que el proyecto tuvo hasta abril-2026, y uno describe un stack Next.js/Prisma que **nunca** se implementó. Los docs afectados llevan un bloque de advertencia al inicio. La fuente de verdad del stack actual es **`CLAUDE.md` (raíz del repo)** y **`docs/Atlas-ONE-Proyecto.md`**.

## Documentos canónicos vigentes

- **`CLAUDE.md` (raíz)** — stack real, reglas, arquitectura.
- **`docs/Atlas-ONE-Proyecto.md`** — overview completo (módulos, dominios, design system, gotchas, roadmap).
- **`02_REPO_CURRENT_STATE.md`** — fotografía del repo con cifras verificadas.
- `RBAC.md` — permisos (la implementación real vive en `app/security/permissions.py`).
- `CRM_SPEC.md` — spec de dominio; parcialmente realizado (Pipeline/Stage/Deal/DealActividad ya existen en `app/models/crm.py`).
- `docs/development/testing.md` — **desactualizado**: dice que el backend no tiene tests; sí los tiene (`tests/`).

## Documentos históricos (con bloque de advertencia, NO seguir)

`CLAUDE.md` (este directorio, no la raíz) · `UI_PATTERNS.md` · `ROADMAP.md` · `DASIC_Plataforma_Base.md` · `STACK_ADOPTION_CHECKLIST.md`.

## Golden Rules (actualizadas 2026-08-04)

1. **SPA React, no SSR** (migrado 2026-05-22): toda UI nueva en `web/src/features/<x>/`. NO crear `.html` nuevos en `app/templates/` (legacy de respaldo, `_SSR_ROUTES` está vacía). ~~Jinja/Alpine~~.
2. **Módulos backend nuevos = `app/domains/<x>/`** con `router.py` (HTTP/permisos) + `service.py` (reglas + transacciones) + `repository.py` (queries) + `schemas.py`. Referencia: `app/domains/remisiones/`. NO engordar `app/routers/`.
3. **Mono-tenant**: `app/models/nucleus.py` (Organization/Branch/UserOrganization) fue retirado. Las columnas `organization_id` que quedan son inertes. NO asumir aislamiento por org. ~~Multi-tenant siempre~~.
4. **Server-side**: folios, totales (subtotal/IVA/total) y movimientos de stock (`MovimientoStock` vía `stock_service.aplicar_movimiento`) se calculan en el backend. Nunca folios en el front.
5. **Mutaciones con estado: lock → refresh → re-check.** Adquirir el lock ANTES de leer el estado mutable y re-verificarlo DESPUÉS; nunca al revés (TOCTOU). Ver `app/domains/remisiones/service.py`.
6. **Alembic + `_BACKFILL_DDL`**: el Procfile no corre alembic; columnas nuevas en tablas existentes necesitan entrada paralela en `app/db/seeds.py::_BACKFILL_DDL`. Tablas nuevas las crea `create_all`. Verificar `alembic heads` = **un solo head** tras un merge.
7. **Diseño por dominio en modelos**: `app/models/<dominio>.py`, sin archivos todólogos. Re-exportar clases nuevas en `__init__.py` (+`__all__`) o la app crashea al arrancar.
8. **Auth con cookie HttpOnly** (`access_token`). No mover al cliente.
9. **Permisos con `require()`** de `app/security/permissions.py` en endpoints nuevos (los decoradores `allow_*` de `jwt.py` son compatibilidad).
10. **Marca del cliente vía `web/src/lib/branding.ts`** (preset por `VITE_TENANT`), nunca hardcodeada en componentes.
11. **Correr los tests + build antes de push**: ver abajo; `cd web && npm run build` y commitear `app/static/dist/`.

## Tests — sí existen (desde 2026-08)

```bash
pytest                     # backend: 75 tests en tests/ (pytest.ini → testpaths=tests)
cd web && npm run test     # frontend: 35 tests (vitest run)
cd web && npm run test:watch
cd web && npm run typecheck
```

- **`pytest` NO está en `requirements.txt`** — vive en `requirements-dev.txt` (Railway no lo instala): `pip install -r requirements.txt -r requirements-dev.txt`.
- Los tests de backend usan **SQLite en memoria** (`tests/conftest.py`), que shimea `hashtext` y `pg_advisory_xact_lock` como funciones no-op para ejercitar el código real sin Postgres. Es una **excepción exclusiva de tests**: la aplicación sigue siendo Postgres-only.
- Los tests de frontend corren en entorno `node` (sin jsdom) — hoy solo cubren lógica pura (`web/src/features/cotizador/lib/calc.ts` y el store del cotizador).
- Cobertura concentrada en remisiones y en el motor de cálculo del cotizador; el resto del backend aún no tiene tests.

## Lectura recomendada (orden)

1. **`CLAUDE.md` (raíz)** — stack real y reglas.
2. **`docs/Atlas-ONE-Proyecto.md`** — overview de módulos, dominios, design system y gotchas.
3. **`02_REPO_CURRENT_STATE.md`** — fotografía del repo, cifras y pendientes.
4. `app/domains/remisiones/` — el patrón de referencia, leído como código.
5. `RBAC.md` + `app/security/permissions.py` — permisos.
6. (Solo contexto histórico) `DASIC_Plataforma_Base.md`, `UI_PATTERNS.md`, `ROADMAP.md`, `STACK_ADOPTION_CHECKLIST.md`, `CLAUDE.md` de este directorio.
