# Repository Overview — dasic-atlas-api (Atlas ONE)

> Auditoría Task Pack 00 · 2026-08-03. Fuentes canónicas: `CLAUDE.md` (raíz), `docs/Atlas-ONE-Proyecto.md`, `context/02_REPO_CURRENT_STATE.md`.

## Qué es

**Atlas ONE** — ERP/CRM industrial en **producción** para DASIC Industrial (Railway, autodeploy desde `main`). Monorepo con backend FastAPI (`app/`) y SPA React (`web/`). **No es un proyecto en arranque**: cotizador multimoneda costo+utilidad, CRM Kanban, centro de cobranza, inventario auditable y consola super-admin ya operan en producción.

## Stack real (verificado)

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.x + Alembic, Python 3.11 (`runtime.txt`) |
| DB | PostgreSQL vía `psycopg` (única) |
| Auth | JWT (`python-jose`) en cookie HttpOnly `access_token`; passlib+bcrypt 4.0.1 |
| Frontend | React 18.3 + Vite 5.4 + TS 5.6 + Tailwind 3.4 + shadcn-style + Zustand 5 + TanStack Query 5 + React Router 6.27 |
| Docs/PDF | `fpdf2`, `python-docx`, `openpyxl`, `qrcode` |
| IA | Anthropic SDK (`ai_service.py`) · FX: Banxico SIE + fallback |
| Deploy | Railway/nixpacks (`npm run build` en build, Procfile = uvicorn). **Alembic NO corre en deploy** → shim `_BACKFILL_DDL` |

## Dimensiones

- Backend: **17,409 líneas** Python en `app/` — 24 routers, 43 tablas, 9 services, 48 migraciones Alembic (head `20260611_01`).
- Frontend: **26 features** en `web/src/features/`, 111 archivos `.tsx` de features, 15 primitivas en `components/ui/`, ~35 rutas SPA.
- Docs previas: ~31 markdown entre `docs/` y `context/` (parte legacy — ver advertencias en `context/00_CONTEXT_START_HERE.md`).

## Baseline de validación (2026-08-03)

| Check | Resultado |
|---|---|
| `python3 -m compileall app scripts` | ✅ sin errores |
| `cd web && npm run typecheck` (`tsc -b`) | ✅ sin errores |
| `cd web && npm run build` | ✅ 30.9s; chunk mayor: recharts `PieChart` 325 kB (99.8 kB gzip), `vendor-react` 200 kB |
| Lint | ❌ **no existe** (sin ESLint/Prettier config) |
| Tests | ❌ **no existe ninguno** (ni pytest ni vitest, sin harness) |
| Working tree tras build | limpio (dist commiteado está al día) |

## Multi-tenancy — estado real

**Mono-tenant en la práctica.** La migración `20260429_01_drop_multitenant.py` retiró el esquema multi-tenant anterior. Hoy solo 4 tablas conservan `organization_id` (Pipeline, PipelineStage, Deal, Servicio); `Usuario` no lo tiene. Cualquier plan SaaS debe partir de esta realidad, no del CLAUDE.md histórico que decía "multi-tenant siempre".

## Convenciones activas

- Features frontend: `types.ts` + `hooks/use<X>.ts` + `pages/<X>Page.tsx` + `components/`.
- Folios/totales/stock: server-side siempre.
- Modelos por dominio (`app/models/<dominio>.py`), re-export obligatorio en `__init__.py`.
- Build de SPA commiteado en `app/static/dist/` antes de push.
- Commits semánticos en español (`feat(...)`, `refactor(...)`, `docs(...)`).
