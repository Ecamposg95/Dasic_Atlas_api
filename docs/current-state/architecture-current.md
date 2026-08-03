# Arquitectura actual

> Auditoría Task Pack 00 · 2026-08-03.

## Backend (`app/`)

### Bootstrap
`app/main.py` → `app/core/lifespan.py` → `app/db/seeds.py`:
1. `configure_logging()` + `get_settings()` (valida `DATABASE_URL`, `SECRET_KEY` ≥32 chars).
2. Lifespan: `Base.metadata.create_all()` (crea tablas nuevas) + `run_all_seeds()`:
   `run_backfill_ddl` (shim `ALTER TABLE … ADD COLUMN IF NOT EXISTS` porque Railway no corre Alembic) · `seed_super_admin` · `seed_dedicated_superadmin` (`SUPERADMIN_EMAIL/PASSWORD`) · `promote_superadmin_from_env` · `seed_marcas` · `seed_sat_*` · `seed_default_pipeline`.
3. 24 routers bajo `/api/*`. SPA servida desde `app/static/dist/` (rutas `/spa/*` devuelven `index.html` con `no-cache`). `_SSR_ROUTES` está **vacía** — Jinja solo queda como fallback de emergencia del login.

### Capas
- `app/models/` — 22 archivos por dominio, 43 tablas. Enums tolerantes a aliases legacy (`TolerantEnum`).
- `app/schemas/` — espejo Pydantic v2.
- `app/routers/` — **thick routers**: mezclan dominio, persistencia y presentación. `ventas.py` 2,339 líneas (incluye plantilla PDF inline), `compras.py` 1,189, `clientes.py` 1,131, `productos.py` 943.
- `app/services/` — 9 services reales: `stock_service` (kardex/reservas), `cuentas_por_cobrar` (aging/pagos FIFO), `fx_service`, `auto_oc_service`, `ai_service`, `email_service`, `word_service`, `fantasmas_service`, `UserService`.
- `app/security/jwt.py` — helpers RBAC por rol-string: `allow_superadmin`, `allow_user_admin`/`allow_admin`, `allow_admin_asistente`, `allow_all_staff`, `is_owner_scoped` (VENTAS ve solo lo suyo).

### Autenticación
JWT en cookie HttpOnly `access_token` (12h por defecto, `REMEMBER_SESSION_DAYS=30`). API acepta Bearer o cookie. CSRF vía `starlette-csrf`.

## Frontend (`web/src/`)

```
web/src/
├── App.tsx               # QueryClientProvider + Toaster + ConfirmHost
├── router.tsx            # createBrowserRouter, lazyPage() con auto-reload anti chunk-stale
├── components/
│   ├── layout/           # Layout, Sidebar (config SECTIONS[]), Header, Footer, ThemeToggle
│   ├── ui/               # 15 primitivas shadcn-style tokenizadas
│   ├── document/         # DocumentCartTable/Row/TotalsBar (compartidos cotizador/OC/remisión)
│   └── ErrorBoundary.tsx
├── features/<26 features> # types.ts + hooks/ + pages/ + components/
├── lib/                  # api (fetch credentials:'include'), permissions, toast, confirm, queryClient
└── stores/               # auth.ts (memoria), theme.ts (localStorage)
```

- **Estado servidor:** TanStack Query. **Estado global:** Zustand mínimo (auth + theme; stores de feature en cotizador y remisiones).
- **Guard de auth:** dentro de `Layout` (post-render, consulta `/api/auth/me`); no hay `ProtectedRoute` a nivel router ni catch-all 404.
- **Design system:** tokens semánticos HSL en `index.css` + `tailwind.config.ts` (`bg-card`, `text-foreground`, `border-border`, sombras `elev-*`, easing `premium`). Dark near-black azulado por defecto. Adopción parcial: 692 ocurrencias `slate-*` vs 306 de tokens (ver `ux-audit.md`).
- **Shell secundario:** `PlatformShell` (superadmin, skin emerald) — guard por rol dentro del componente.

## Flujo de dominio central

```
Cliente/Empresa → Deal (CRM Kanban) → Cotización (COT-YYYYMM-XX-NNNN, costo+utilidad,
multimoneda TC día) → [versionada / plantillas / PDF / Word / email / WhatsApp-log]
→ Convertir a Venta (VTA-…) → OC a proveedor (agrupada por proveedor, borrador→confirmar)
→ Recepción (stock ENTRADA) → Remisión → Reporte de servicio → CxC (cargo, aging, pago FIFO)
```

Reservas de stock al guardar cotización (solo catálogo); liberación/consumo al cancelar/convertir. Todo movimiento pasa por `stock_service.aplicar_movimiento` → fila en `movimientos_stock`.

## Multi-tenancy

Retirada en `20260429_01_drop_multitenant`. `organization_id` sobrevive solo en Pipeline/PipelineStage/Deal/Servicio (inerte). No hay `Organization` activa ni membresías. El camino SaaS documentado en `modernization-opportunities.md` parte de tenant-config frontend + branding, no de re-tenantizar la DB en esta etapa.
