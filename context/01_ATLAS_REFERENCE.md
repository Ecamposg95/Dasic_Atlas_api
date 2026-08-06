# Atlas ERP/POS Reference (Upstream Context)

Este documento es **referencia** (no necesariamente coincide con el estado actual del repo). Se usa para tomar patrones/arquitectura del proyecto Atlas ERP & POS y adaptarlos al preset **DASIC ERP Industrial**.

Contenido fuente: pegado manualmente desde una guia tipo `CLAUDE.md`.

---

## Project Overview

**Atlas ERP & POS (Atlas BOS)** is a multi-tenant, modular ERP/POS system built as a Business Operating System. It uses a preset architecture to adapt to different industries (Retail, Workshop, Restaurant, CRM, etc.). The primary active preset is **DataXPOS (DAXPOS)** — treat it as the reference implementation and do not break it.

**Tech Stack:** FastAPI 0.127 + SQLAlchemy 2.0 + PostgreSQL + Jinja2 + Tailwind CSS + Alpine.js

## Development Commands

```bash
# Setup (first time)
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run development server — DataXPOS available at /dataxpos
uvicorn app.main:app --reload

# --- First-time initialization (run in order) ---

# 1. Create all tables (destructive — drops and recreates)
python scripts/reset_db.py          # interactive: type "yes"
python scripts/reset_db_force.py    # same, no prompt

# 2. Load DataXPOS and all industry presets
python scripts/init_presets_v2.py

# 3. Create superadmin (prints generated password)
python scripts/init_sa.py

# QA alternative: creates superadmin/admin123 + org "QA"
python scripts/init_users.py
```

**Environment:** Requires a `.env` file with `DATABASE_URL=postgresql://postgres:toor@localhost:5432/postgres`. Optionally set `INIT_USERS_ON_BOOT=true` to bootstrap users on startup.

**Tests:** Stress/integration tests live in `tests/` — run individually:
```bash
python tests/stress_test.py
python tests/test_cash_variance.py
python tests/test_partial_returns.py
python tests/test_pos_printer.py
python tests/test_auth_v2.py
python tests/test_excel_logic.py
```

**Deployment:** Deployed to Railway via Nixpacks. See `railway.json`, `nixpacks.toml`, `Procfile`. The start command runs `scripts/railway_init.py` before launching uvicorn.

## Architecture: Layered Concentric Design

```
Presets (DataXPOS, CRM, Taller, Restaurant, etc.)
        ↑ orchestrate
Engines (Resource, Transaction, Inventory, Relationship, HR/Finance)
        ↑ powered by
Nucleus (Org, Auth/JWT, RBAC, DB, EventBus)
```

### Nucleus (`app/core/`, `app/security/`, `app/database.py`, `app/dependencies.py`)

Multi-tenancy, JWT auth (HS256, 12h tokens), bcrypt password hashing, RBAC.

- **Auth flow:** `app/security/__init__.py` — `get_current_user` (API, reads Bearer token or cookie), `get_current_user_from_cookie` (SSR HTML routes), `get_optional_user_from_cookie` (public/hybrid pages).
- **Org context resolution:** `app/dependencies.py` — `get_current_active_organization` resolves org via `X-Organization-ID` header > `support_org_id` cookie > `UserOrganization` table > single-org fallback.
- **View permission gate:** `app/dependencies.py` — `check_view_permission(view_name)` is a dependency factory used on every HTML route. It checks role-based access via `can_access_template()`, enforces context routing (HQ-only, POS-only, Warehouse-only paths), determines layout, and builds the navigation sidebar.
- **Module gating:** `app/security/require_module.py` — `require_module(module_key)` dependency factory ensures a module is enabled for the current org before allowing API access. Admins/Owners bypass this check.
- **Event bus:** `app/core/events.py` — Simple synchronous pub/sub. Currently publishes `SalesDocumentCreated` events consumed by `app/subscribers/abasto.py` for purchase recommendation generation.
- **Database:** `app/database.py` — SQLAlchemy engine from `DATABASE_URL` env var, supports PostgreSQL (primary) and SQLite (fallback). `SessionLocal` factory, `get_db()` dependency.

### Engines (Routers + Models + Services)

Business logic organized by domain. Routers live in `app/routers/`, models in `app/models/`, schemas in `app/schemas/`.

| Engine | Router(s) | Model(s) | Key Endpoints |
|---|---|---|---|
| **Resource (Catalog)** | `products.py` (2441 LOC), `brands.py`, `departments.py`, `commercial.py` | `products.py` (Product, ProductVariant, Brand, Department, UnitOfMeasure, ProductPrice, PackagingUnit, ProductBranchStatus) | `/api/products`, `/api/brands`, `/api/departments`, `/api/commercial` |
| **Transaction (Sales)** | `sales.py` (764 LOC), `quotes.py`, `returns.py`, `cash.py` (508 LOC), `printer.py` | `sales.py` (SalesDocument, SalesLineItem, Payment), `returns.py`, `cash.py` (CashSession, CashMovement), `print_job.py` | `/api/sales`, `/api/quotes`, `/api/returns`, `/api/cash`, `/api/printer` |
| **Inventory** | `inventory.py`, `transfers.py`, `logistics.py`, `purchases.py` | `inventory.py` (InventoryMovement, StockOnHand), `logistics.py` (ContainerType, BoxType, TransferOrder, InboundShipment, etc.), `abasto.py` (PurchaseRecommendation) | `/api/inventory`, `/api/transfers`, `/api/logistics`, `/api/purchases` |
| **Relationship (CRM/HR)** | `customers.py` (532 LOC), `crm.py`, `hr.py`, `portal.py` | `crm.py` (Customer, CustomerLedgerEntry), `hr.py` (Employee, BranchAssignment, Attendance) | `/api/customers`, `/api/crm`, `/api/hr`, `/api/portal` |
| **Finance** | `expenses.py`, `reports.py` (612 LOC) | `finance.py` (AccountTransaction, Expense, PurchaseOrder), `payments.py` | `/api/expenses`, `/api/reports` |
| **Platform (SaaS)** | `platform.py` (945 LOC), `org_capabilities.py` | `platform.py` (PlatformAuditLog), `modules.py` (Module, OrganizationModule, IndustryPreset) | `/api/platform`, `/api/org/capabilities` |
| **Identity** | `auth.py`, `users.py`, `organization.py`, `branches.py` | `users.py` (User, UserOrganization), `organization.py` (Organization, Branch) | `/api/auth`, `/api/users`, `/api/organization`, `/api/branches` |

### Presets (Industry Configuration)

Presets define which modules are active per organization. Managed via:

- `app/services/capabilities_service.py` — `INDUSTRY_PRESETS` dict maps `IndustryType` to module lists. `apply_industry_preset()` activates modules. `seed_global_modules()` runs on startup to populate the module catalog.
- `app/core/role_permissions.py` — **Active standard for DataXPOS**. `DATAXPOS_ROLE_VIEWS` maps roles to allowed templates. `get_dataxpos_nav()` builds the sidebar for DataXPOS orgs.
- `app/ui/nav_registry.py` — Generic nav registry for non-DataXPOS presets. Filters by context (HQ/BRANCH/WAREHOUSE), enabled modules, and user role.
- `scripts/init_presets_v2.py` — Seeds industry presets into the database.

**Supported Industry Types** (defined in `app/models/organization.py:IndustryType`):
DATAXPOS, DISTRIBUTOR_POS, RETAIL_CHAIN, ECOMMERCE, WHOLESALE_B2B, SALON, CLINIC, DENTAL, PROFESSIONAL_SERVICES, RESTAURANT_QSR, RESTAURANT_FULL, CAFE_BAKERY, AUTO_REPAIR_SHOP, FLEET_SERVICE, SALES_DISTRIBUTION, B2B_ENTERPRISE, WAREHOUSE_LOGISTICS, MANUFACTURING_LIGHT, CUSTOM

## Multi-Tenancy — The Golden Rule

**Every query on business data must filter by `organization_id`.** Users also have an optional `branch_id` (`None` = HQ/global user with org-wide visibility).

```python
# Correct pattern for every query:
query = db.query(Model).filter(Model.organization_id == current_user.organization_id)
if current_user.branch_id:  # branch-scoped user
    query = query.filter(Model.branch_id == current_user.branch_id)
```

Forgetting this in a SaaS context exposes one tenant's data to another.

### ORM Mixins (`app/models/mixins.py`)

- `TenantMixin` — Adds `organization_id` FK column. Use on all business tables.
- `AuditMixin` — Adds `created_at`, `updated_at`, `deleted_at` columns.
- `UUIDMixin` — Adds UUID string primary key (used selectively, most models use integer PKs).

## RBAC & Permission System

There are **two permission files** — this is a known technical debt:
- `app/core/role_permissions.py` — **Active standard** for DataXPOS. Contains 7 roles, the template-to-role matrix, nav group ordering, and template metadata (labels, icons, URLs).
- `app/core/role_matrix.py` — Legacy. Prefer `role_permissions.py`.

Authorization is enforced at two levels: (1) UI — which templates are rendered per role via `check_view_permission()`; (2) API — routers must also check roles directly. Do not rely on UI-only RBAC.

**Tenant Roles** (`app/models/users.py:Role`):
| Role | Context | Access |
|---|---|---|
| `ADMINISTRADOR` | HQ | Full admin — all modules, all branches |
| `DUEÑO` | HQ | Owner — most modules, financial visibility |
| `GERENTE` | BRANCH | Branch manager — POS + reports + inventory |
| `CAJERO` | BRANCH | Cashier — POS, sales, cash, returns |
| `VENDEDOR` | MOBILE | Mobile sales rep — mobile dashboard + sales |
| `SOPORTE_OPERATIVO` | MOBILE | Support — mobile query + dashboard |
| `CLIENTE` | PORTAL | Customer portal only |

**Platform Roles** (`PlatformRole`): `SUPERADMIN` (SaaS admin, cross-tenant), `SUPPORT`, `NONE`

**Context Routing** (enforced by `check_view_permission`):
- `/hq/*`, `/admin/*`, `/command-center`, `/organization`, `/users`, `/purchases`, `/expenses`, `/brands`, `/departments`, `/hr` — HQ-only (ADMINISTRADOR/DUEÑO bypass)
- `/pos/*`, `/mobile/*` — Branch/Store-only (ADMINISTRADOR/DUEÑO bypass)
- `/warehouse/*`, `/logistics/*`, `/boxes` — Warehouse-only (ADMINISTRADOR/DUEÑO bypass)
- `/hr/me` — Accessible to all employees regardless of context

## Key File Locations

| Purpose | Path |
|---|---|
| App entry point & all HTML routes | `app/main.py` |
| DB engine, session, `get_db()` | `app/database.py` |
| Auth (JWT, bcrypt, `get_current_user`) | `app/security/__init__.py` |
| Module gating dependency | `app/security/require_module.py` |
| Org context & view permission deps | `app/dependencies.py` |
| RBAC matrix (active) | `app/core/role_permissions.py` |
| RBAC matrix (legacy) | `app/core/role_matrix.py` |
| Event bus (pub/sub) | `app/core/events.py` |
| ORM model mixins | `app/models/mixins.py` |
| All ORM models (re-exported) | `app/models/__init__.py` |
| All API routers | `app/routers/` |
| Pydantic schemas | `app/schemas/` |
| Business logic services | `app/services/` |
| CRUD helpers | `app/crud/` |
| Event subscribers | `app/subscribers/` |
| Nav registry (non-DAXPOS) | `app/ui/nav_registry.py` |
| Capabilities/preset service | `app/services/capabilities_service.py` |
| POS thermal printer logic | `app/pos_printer.py` |
| PDF generation utilities | `app/utils/pdf_generator.py` |
| Folio generation | `app/utils/folios.py` |
| Jinja2 templates | `app/templates/` |
| Static assets (CSS/JS/img) | `app/static/` |
| DB init & preset scripts | `scripts/` |
| Architecture context docs | `context/` |
| DB migration scripts | `app/migrations/` |
| Print agent (external tool) | `tools/print_agent/` |
| Stress/integration tests | `tests/` |

## Template Structure

Templates use Jinja2 with Tailwind CSS and Alpine.js. Directory layout under `app/templates/`:

| Directory | Files | Purpose |
|---|---|---|
| `layouts/` | 9 | Base layouts: `base_daxpos.html`, `hq_layout.html`, `pos_layout.html`, `base_warehouse.html`, `base_tenant.html` |
| `core/` | 9 | Admin pages: users, departments, brands, organization, index, admin_catalog |
| `hq/` | 9 | HQ views: command center, branch detail, inventory overview, sales log, returns, purchases, expenses |
| `platform/` | 11 | SaaS admin: org management, user management, metrics, presets, branches |
| `pos/` | 6 | POS interface, mobile sales, mobile query, mobile dashboard, mobile profile, mobile inbox |
| `sales/` | 6 | Sales history, quotes, quote maker, returns, seguimiento (pipeline) |
| `shared/` | 7 | Auth/login, 404, construction placeholder, printer config |
| `crm/` | 3 | Customer management, portal dashboard |
| `finance/` | 2 | Reports, cash history |
| `inventory/` | 3 | Products, inventory management |
| `hr/` | 2 | HR management, employee self-service (hr_me) |
| `components/` | 4 | Reusable UI components |
| `dataxpos/` | 1 | DataXPOS preset home/dashboard |
| `logistics/` | 1 | Logistics module |
| `partials/` | 1 | Reusable partial templates |

## Org/Branch Semantics

- `BranchType`: `HQ` | `STORE` | `WAREHOUSE` | `OFFICE`
- HQ (`branch_type = HQ`) = command node; has org-wide visibility; not a mandatory POS operation point.
- A user with `branch_id = None` is an HQ/global user.
- `is_headquarters` field on Branch duplicates `branch_type = HQ` — treat `branch_type` as the source of truth.
- Organization has `industry_type` (nullable) — `None` means unconfigured (redirects to startup flow).
- Organization has `hq_branch_id` FK pointing to the designated HQ branch.

## Module System

Modules are the feature-flag mechanism. Defined in `app/models/modules.py`:

- `Module` — Global catalog (seeded on startup). Has `key`, `name`, `scope` (GLOBAL/HQ/BRANCH/WAREHOUSE), `status` (STABLE/BETA/DEPRECATED).
- `OrganizationModule` — Per-org enablement. Links `organization_id` + `module_key` + `is_enabled`.
- `IndustryPreset` — DB-stored preset definitions (module lists per industry type).

**Module keys** (from `app/services/capabilities_service.py`): `core`, `reports`, `pos`, `warehouse`, `quotes`, `appointments`, `clinical`, `services`, `crm`, `customer_portal`, `sales_pipeline`, `invoicing`, `payments`, `cash_management`, `returns`, `pricing`, `promotions`, `catalog`, `branch_catalog_enablement`, `inventory`, `purchasing`, `fulfillment`, `work_orders`, `technician_app`, `kds`, `tables`, `menu`, `delivery`, `pm`, `documents`

## API Route Conventions

- All API routes are prefixed with `/api/` (e.g., `/api/sales`, `/api/products`).
- HTML/SSR routes are at the root (e.g., `/pos`, `/sales`, `/command-center`).
- The `setup` and `daxpos` routers have their own prefixes defined internally (not `/api/`).
- Compatibility aliases exist for department endpoints (`/api/products/departments`, `/api/productos/departaments`).
- Error handlers: 404 returns JSON for `/api/*` paths, HTML for browser; 401 redirects to `/login`; 403 redirects to `/index?error=unauthorized`.

## Frontend Patterns

- **Server-side rendered** — Jinja2 templates, not a SPA. Do not introduce client-side routing.
- **Tailwind CSS** — Dark theme based on `slate` palette. See `context/UI_PATTERNS.md` for full style guide.
- **Alpine.js** — Used for client-side interactivity (dropdowns, modals, reactive state).
- **Layout selection** — Determined by `check_view_permission`: DataXPOS orgs use `base_daxpos.html`, HQ context uses `hq_layout.html`, branch uses `pos_layout.html`, warehouse uses `base_warehouse.html`.
- **`dax-card`** — Standard card component class (`slate-900/80` bg, `slate-700/50` border, backdrop-blur).
- **Template context** — Every HTML route calls `inject_template_context()` which provides `user_json`, `active_layout`, `ctx_id`, `ctx_type`, `nav_items`, and Cloudinary config.

## Development Principles

1. **Do not break multi-tenancy** — `organization_id` must be present in every write and every query on business tables.
2. **Stability over speed** — Atlas handles money. Test error flows (failed payments, insufficient stock).
3. **Extend engines, don't create industry-specific tables** — keep the core agnostic (e.g., add `type="WORK_ORDER"` to `sales_orders` rather than creating `taller_ordenes`).
4. **Frontend is server-side** — Jinja2 + Tailwind + Alpine.js. Keep logic in Python. Do not introduce a SPA.
5. **DAXPOS is the reference preset** — every change must leave DAXPOS fully functional.
6. **Reusable code** — If writing inventory logic for one industry, make it generic enough for others.

## Known Technical Debt

- **Dual RBAC systems**: `role_matrix.py` vs `role_permissions.py` — consolidate toward `role_permissions.py`.
- **No Row-Level Security in PostgreSQL** — all tenant isolation is Python-side.
- **Some KPI endpoints** in the Command Center dashboard may return mocked/proxy data.
- **`Customers` entity** is tightly coupled to `sales.py` router — planned extraction to a Relationship Engine.
- **`SECRET_KEY` hardcoded** in `app/security/__init__.py` — should be moved to environment variable for production.
- **`TenantMixin.organization_id`** is `nullable=True` for migration ease — logic should enforce non-null on business tables.
- **Large router files**: `products.py` (2441 LOC) and `platform.py` (945 LOC) could benefit from splitting.

## Scripts Reference

| Script | Purpose |
|---|---|
| `scripts/reset_db.py` | Drop and recreate all tables (interactive — type "yes") |
| `scripts/reset_db_force.py` | Same as above, no prompt |
| `scripts/init_presets_v2.py` | Seed DataXPOS and all industry presets into the database |
| `scripts/init_sa.py` | Create superadmin user (prints generated password) |
| `scripts/init_users.py` | QA bootstrap: creates superadmin/admin123 + org "QA" |
| `scripts/init_rmazh.py` | Initialize specific org/user setup |
| `scripts/railway_init.py` | Pre-startup script for Railway deployment |
| `scripts/wait_and_launch.py` | Utility for delayed startup |
| `scripts/migrate_add_brand_logo.py` | Migration: add logo field to brands |
| `scripts/migrate_add_product_image.py` | Migration: add image field to products |

## Context Documentation

Architecture and design docs live in `context/`:

| File | Content |
|---|---|
| `00_CONTEXT_START_HERE.md` | Original project context and technical debt inventory |
| `01_CONTEXT_START_HERE.md` | Extended context with recent decisions |
| `AGENTS.md` | Rules for AI agents working on this codebase |
| `ARCHITECTURE.md` | Layered BOS architecture, engine domains, tenancy rules |
| `DATAXPOS_PRESET_SYSTEM.md` | DataXPOS preset system design and implementation |
| `MAP.md` | Maps conceptual engines to physical files (routers/models) |
| `MOONSHOT_VISION.md` | Future vision: AI and blockchain integration |
| `ORG_HQ_BRANCHES.md` | Organization, HQ, and branch semantics in depth |
| `ROLES_Y_MODULOS.md` | Role definitions and module access matrix |
| `UI_PATTERNS.md` | Tailwind CSS patterns, component styles, color palette |
| `pos_refactor_phases.md` | POS refactoring plan and phases |
