# Repository Overview — dasic-atlas-api (Atlas ONE)

> Auditoría Task Pack 00 · 2026-08-03 · **actualizada 2026-08-04** (120 commits después de la auditoría original `c59f89f`). Fuentes canónicas: `CLAUDE.md` (raíz), `docs/Atlas-ONE-Proyecto.md`, `context/02_REPO_CURRENT_STATE.md`.

## Qué es

**Atlas ONE** — ERP/CRM industrial en **producción** para DASIC Industrial (Railway, autodeploy desde `main`). Monorepo con backend FastAPI (`app/`) y SPA React (`web/`). **No es un proyecto en arranque**: cotizador multimoneda costo+utilidad, CRM Kanban con detalle de oportunidad, centro de cobranza, inventario auditable, remisiones con ciclo de estados y consola super-admin ya operan en producción.

## Stack real (verificado)

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.x + Alembic, Python 3.11 (`runtime.txt`) |
| DB | PostgreSQL vía `psycopg` (única en producción) |
| Auth | JWT (`python-jose`) en cookie HttpOnly `access_token`; passlib+bcrypt 4.0.1 |
| Frontend | React 18.3 + Vite 5.4 + TS 5.6 + Tailwind 3.4 + shadcn-style + Zustand 5 + TanStack Query 5 + React Router 6.27 |
| Docs/PDF | `fpdf2`, `python-docx`, `openpyxl`, `qrcode` |
| IA | Anthropic SDK (`ai_service.py`) · FX: Banxico SIE + fallback |
| Tests | pytest (`pytest.ini`, `requirements-dev.txt`) + Vitest 4.1 (`web/`) |
| Deploy | Railway/nixpacks (`npm run build` en build, Procfile = uvicorn). **Alembic NO corre en deploy** → shim `_BACKFILL_DDL` |

## Dimensiones (conteo 2026-08-04)

- Backend: **19,733 líneas** Python en `app/` — **25 routers montados** (24 en `app/routers/` + 1 en `app/domains/remisiones/`), **228 endpoints**, **47 tablas** en 23 módulos de `app/models/`, **11 módulos** en `app/services/` (+ `UserService` en `services/__init__.py`), **53 migraciones** Alembic con **head único** `20260803_03_remision_origen`.
- Frontend: **25 features** en `web/src/features/` (la feature scaffold `hello` fue retirada), **121 archivos `.tsx`** de features, **21 primitivas** en `components/ui/`, ~40 rutas en `router.tsx`, **34,232 líneas** TS/TSX en `web/src/`.
- Docs: **92 markdown** entre `docs/` y `context/` (parte legacy — ver advertencias en `context/00_CONTEXT_START_HERE.md`).

## Baseline de validación (2026-08-04, ejecutado)

| Check | Resultado |
|---|---|
| `python3 -m compileall app scripts` | ✅ sin errores |
| `cd web && npm run typecheck` (`tsc -b --noEmit`) | ✅ sin errores |
| `cd web && npm run build` | ✅ 36.1s; chunk mayor: recharts `PieChart` 325.4 kB (99.8 kB gzip), `vendor-react` 200.2 kB |
| `cd web && npm run test` (Vitest) | ✅ **2 archivos / 35 tests** — `cotizador/lib/calc.test.ts` + `cotizador/store.test.ts` |
| `pytest -q` | ⚠️ **9 archivos / 75 funciones `test_*`** en `tests/` — no ejecutable en este entorno (pytest no instalado; requiere `pip install -r requirements-dev.txt`) |
| Lint | ❌ **no existe** (sin ESLint/Prettier/Ruff config) |
| Working tree tras build | `dist/` commiteado al día. Pendientes de commit: `README.md` (modificado) y `requirements-dev.txt` (sin trackear) |

## Multi-tenancy — estado real

**Mono-tenant en la práctica.** La migración `20260429_01_drop_multitenant.py` retiró el esquema multi-tenant anterior. Hoy solo 5 tablas conservan `organization_id` (`pipelines`, `pipeline_stages`, `deals`, `deal_actividades`, `servicios`); `Usuario` no lo tiene. Cualquier plan SaaS debe partir de esta realidad, no del CLAUDE.md histórico que decía "multi-tenant siempre".

El primer paso real hacia SaaS ya está en el repo pero **solo en frontend**: `web/src/lib/branding.ts` centraliza toda cadena de marca visible (presets `dasic` / `atlas`, seleccionados por `VITE_TENANT`). El backend sigue con branding inline en los generadores de documentos (excepto remisiones, que ya lee `config_service.empresa_nombre`).

## Convenciones activas

- **Nuevo — patrón dominio:** `app/domains/<dominio>/` con `router.py` + `service.py` + `repository.py` + `schemas.py` + `documents.py` + `templates/`. Primera implementación: `app/domains/remisiones/` (1,181 L, el router legacy `app/routers/remisiones.py` **ya no existe**). Es la referencia para futuras extracciones fuera de los thick routers.
- Features frontend: `types.ts` + `hooks/use<X>.ts` + `pages/<X>Page.tsx` + `components/`.
- Folios/totales/stock: server-side siempre (`app/services/folio_service.py` generaliza el patrón advisory-lock + `MAX(folio)` + regex).
- Cantidades en documentos: `app/services/formato.py::fmt_cantidad` (máx 2 decimales, sin ceros colgantes) — obligatorio desde que `cantidad` migró a `Numeric(12,3)`.
- Modelos por dominio (`app/models/<dominio>.py`), re-export obligatorio en `__init__.py`.
- Build de SPA commiteado en `app/static/dist/` antes de push.
- Commits semánticos en español (`feat(...)`, `refactor(...)`, `docs(...)`).
</content>
