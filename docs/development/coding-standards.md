# Convenciones de código

Reglas reales del repo, extraídas del código y de `CLAUDE.md`. No son
aspiracionales: cada punto tiene un archivo detrás que puedes abrir.

---

## 1. Backend (`app/`)

### 1.1 Modelos por dominio + re-export obligatorio

`app/models/` está particionado por dominio de negocio (`catalog.py`,
`clients.py`, `sales.py`, `purchases.py`, `finance.py`, `inventory.py`,
`remisiones.py`, `crm.py`, `instalaciones.py`, …). **No existen archivos
todólogos** y no deben crearse.

Todo modelo nuevo se re-exporta en `app/models/__init__.py`: import con
`# noqa: F401` **y** entrada en `__all__`. Lo mismo para los schemas Pydantic en
`app/schemas/__init__.py`.

> Omitir el re-export tumba el arranque de la app, y `python -m py_compile` no lo
> detecta. Es la causa #1 de "compilaba pero no levanta".

### 1.2 Routers vs. el patrón `app/domains/<x>/`

Hay dos generaciones conviviendo:

**Legacy — `app/routers/<x>.py`:** 25 routers que mezclan HTTP, reglas de
negocio y persistencia (`ventas.py`, `productos.py`, `compras.py` son los más
gruesos). Se toleran cambios pequeños y dirigidos; no metas un refactor grande
dentro de un fix no relacionado.

**Patrón vigente para módulos nuevos — `app/domains/<x>/`**, con
`app/domains/remisiones/` como referencia:

```
app/domains/remisiones/
├── router.py       # HTTP: validación, permisos, owner-scoping, códigos de estado
├── service.py      # Reglas de negocio y transacciones (locks, estados, stock)
├── repository.py   # Queries SQLAlchemy puras — "sin reglas de negocio, sin HTTP"
├── schemas.py      # Pydantic in/out del dominio
├── documents.py    # Render de PDF/Word/HTML
└── templates/      # Plantillas Jinja en archivo (no inline en el router)
```

Reglas de la separación:

- El **router** es delgado a propósito: `require()`/scoping y delegación. No
  duplica los gates que ya aplica el `service` (evita chequeos dobles que se
  desincronizan).
- El **service** es dueño de las transacciones. El patrón para estados mutables
  es **lock → refresh → re-check**, en ese orden: si verificas antes de tomar el
  lock, una transacción concurrente pasa la verificación con datos obsoletos
  (TOCTOU). Ver `emitir`/`cancelar` en `app/domains/remisiones/service.py` y
  `convertir_cotizacion` en `app/routers/ventas.py`.
- El **repository** no importa FastAPI ni levanta `HTTPException`.

El router del dominio se monta explícitamente en `app/main.py`.

### 1.3 Migraciones: Alembic **y** `_BACKFILL_DDL`

Todo cambio de esquema necesita una revisión en `migrations/versions/`, con el
formato del repo: archivo `AAAAMMDD_NN_descripcion.py` y `revision = "AAAAMMDD_NN"`
(p. ej. `20260804_02_plantas_activos.py`). Un solo head — si un merge crea dos,
se reparenta.

**Además**, si la migración agrega una **columna a una tabla existente**, hay que
añadir la sentencia equivalente a `_BACKFILL_DDL` en `app/db/seeds.py`:

```python
"ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN NOT NULL DEFAULT false",
```

Motivo: **el deploy no corre `alembic upgrade head`** (ver
[`deployment.md`](deployment.md)). En producción, las tablas nuevas las crea
`create_all()` al boot, pero las columnas nuevas sobre tablas ya existentes solo
llegan por el backfill. Cada sentencia debe ser idempotente (`IF EXISTS` /
`IF NOT EXISTS`) porque se ejecuta en **cada arranque**.

Convención documentada en el propio archivo: solo se agregan entradas a
`_BACKFILL_DDL` para cambios que **ya** viven en `migrations/versions/`.

### 1.4 Lo que siempre se calcula en el servidor

- **Folios** — generados en backend (`app/services/folio_service.py`, con
  `pg_advisory_xact_lock` para consecutivos irrepetibles). Formato
  `COT-YYYYMM-<iniciales>-NNNN` / `VTA-…`. Nunca en el frontend.
- **Subtotal / IVA / total** — recalculados al guardar, con redondeo a 2
  decimales **por línea antes de sumar** (el frontend replica exactamente esta
  regla en `web/src/features/cotizador/lib/calc.ts` para que el preview cuadre
  con el PDF).
- **Stock** — solo cambia vía `app/services/stock_service.py::aplicar_movimiento`,
  que registra una fila en `movimientos_stock` (ENTRADA/SALIDA/AJUSTE/RESERVA/
  LIBERACION). Disponible = `stock_actual − reservas activas`.
- **Tipo de cambio** — `app/services/fx_service.py` con cache diario en
  `tipos_cambio_dia`.

### 1.5 Permisos

La matriz central es `app/security/permissions.py`: tuplas `(action, resource)`
por rol, con `_ALL = ("*","*")` para ADMINISTRADOR/SUPERADMIN y sufijo `:own`
para VENTAS.

```python
from app.security.permissions import require, is_owner_scoped, scope_query_by_owner

require(user, "create", "remision")                  # 403 si no puede
q = scope_query_by_owner(q, user, models.OrdenVenta.vendedor_id,
                         action="read", resource="cotizacion")
```

- `can()` devuelve True también cuando el rol tiene la variante `:own`: el
  **caller** es responsable de aplicar el scoping en la query.
- Los decoradores viejos (`allow_admin`, `allow_all_staff`, … en
  `app/security/jwt.py`) siguen por compatibilidad. **Endpoints nuevos usan
  `require()`**.
- Al agregar un recurso, actualiza también `CAPABILITY_FLAGS` y
  `MODULOS_VISIBLES_BY_ROL`: alimentan `capabilities_for(user)`, que el frontend
  consume para pintar botones y sidebar.
- **Enums en queries:** filtra con `RolUsuario.X`, nunca con strings crudos (los
  valores en DB son `superadmin/admin/asistente/vendedor/operativo`, no los
  nombres del enum).

### 1.6 Validación con Pydantic

Entrada y salida se declaran con schemas en `app/schemas/` (o
`app/domains/<x>/schemas.py`). No devuelvas dicts crudos desde un endpoint nuevo
si existe un schema; los schemas también son el filtro de datos sensibles (p. ej.
`ProductoResponseVendedor` oculta el costo al rol VENTAS).

Pydantic v2 serializa el `detail` de un 422 como **array de objetos** — el
frontend lo normaliza con `normalizeDetail` (`web/src/lib/api.ts`).

---

## 2. Frontend (`web/src/`)

### 2.1 Estructura por feature

Toda página vive en `web/src/features/<feature>/` con la misma anatomía:

```
features/gastos/
├── types.ts                   # tipos curados del contrato de API
├── hooks/useGastos.ts         # TanStack Query: queries + mutations
├── pages/GastosPage.tsx
└── components/GastoFormModal.tsx
```

No se crean `.html` nuevos en `app/templates/` (respaldo histórico de la era
SSR). Las rutas se registran en `web/src/router.tsx` con `lazyPage()` y, si la
URL debe existir también fuera de `/spa/*`, se agrega el handler
`_serve_spa_protected` correspondiente en `app/main.py`.

### 2.2 Primitivas de `components/ui/`

Antes de crear un componente, revisa si ya existe:

`badge` · `button` · `card` · `CollapsibleCard` · `data-table` · `drawer` ·
`empty-state` · `form-field` · `input` · `list-toolbar` · `modal` · `page-header` ·
`pagination` · `sat-combobox` · `select` · `skeleton` · `status-badge` · `tabs` ·
`textarea` · `timeline` · `toaster`

Los componentes compartidos de documento (cotizador y editor de remisiones) viven
en `components/document/`: `ProductSearchPanel`, `DocumentCartTable`,
`DocumentRow`, `DocumentTotalsBar`, `DocumentSectionDivider`.

### 2.3 Tokens semánticos — cero colores crudos

Usa siempre los tokens definidos en `web/src/index.css` + `tailwind.config.ts`:

| En vez de | Usa |
|---|---|
| `bg-white` / `bg-slate-900` | `bg-card` o `bg-background` |
| `bg-slate-100` | `bg-surface-2` |
| `text-slate-900` | `text-foreground` |
| `text-slate-500` | `text-muted-foreground` |
| `border-slate-200` | `border-border` / `border-border-strong` |
| `ring-cyan-500` | `ring-ring` |
| sombras ad-hoc | `shadow-elev-1/2/3`, `shadow-glow-accent` |

Los tokens son HSL con canal separado, así que aceptan alpha
(`bg-surface-2/60`). Un color crudo `slate-*` sin par `dark:` rompe el tema
claro/oscuro. Quedan ~14 de 158 archivos `.tsx` con `slate-*` (islas heredadas
del cotizador y superadmin): son deuda, no ejemplo a seguir.

Excepción consciente: el sidebar usa CSS vars propias (`--sidebar-*`) y es negro
absoluto en ambos temas por decisión de identidad.

### 2.4 Formularios

- Todo campo va envuelto en `FormField` (asocia `label`/`htmlFor` automáticamente,
  inyecta `id` y `aria-required`, y unifica asterisco de requerido, `hint` y
  `error`).
- Los modales de captura usan `<form onSubmit={…}>` con
  `e.preventDefault()` y un `<Button type="submit">`, para que Enter envíe.
- **Todo botón que no envía el formulario lleva `type="button"`** (cancelar,
  agregar fila, toggles). Es el default HTML contrario y provoca envíos
  fantasma. En el repo hay 135 usos explícitos: mantén la disciplina.

### 2.5 Página estándar

- Toda página abre con `PageHeader` (`title`, `description`, `actions`, `backTo`
  para vistas de detalle, y `children` como slot de filtros/toolbar). Unifica la
  jerarquía visual del sistema.
- Listados con `DataTable` + `maxBodyHeight` y `DataTableHead sticky`, para que
  el scroll ocurra **dentro** de la tabla y el shell no crezca sin límite:

```tsx
<DataTable maxBodyHeight="calc(100dvh - 320px)">
  <DataTableHead sticky>…</DataTableHead>
  <DataTableBody>…</DataTableBody>
</DataTable>
```

- Estados vacíos con `EmptyState`, cargas con `Skeleton`, avisos con el toaster
  (`@/lib/toast`), confirmaciones con `@/lib/confirm`.

### 2.6 Datos de servidor: TanStack Query

- Estado de servidor = TanStack Query. Estado de UI = `useState` o Zustand
  (`stores/auth.ts`, `stores/theme.ts`).
- Toda llamada pasa por `@/lib/api` (hace `credentials:'include'` y normaliza el
  error a `{status, detail}`). No uses `fetch` directo.
- **Query keys jerárquicas** empezando por el recurso, con los parámetros que
  afectan el resultado:

```ts
useQuery({ queryKey: ['gastos', page, filtros], queryFn: … , placeholderData: keepPreviousData })
useQuery({ queryKey: ['gastos', 'categorias'], queryFn: … })
```

- **Invalidación por prefijo** tras cada mutación:

```ts
onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gastos'] }); }
```

- Defaults globales en `lib/queryClient.ts`: `staleTime` 30 s,
  `refetchOnWindowFocus: false`, y **sin reintentos en 401/403**.
- Los chequeos de rol en UI usan los hooks de `@/lib/permissions`
  (`useIsAdmin`, `useIsSuperadmin`, `useIsAdminOrGerente`), que normalizan a
  minúsculas. Comparar contra `'ADMINISTRADOR'` en mayúsculas siempre da `false`.

---

## 3. Commits

Formato del repo (Conventional Commits, **en español**):

```
tipo(alcance): descripción en minúsculas, imperativa

Cuerpo opcional: explica el PORQUÉ y el caso que se rompía, no el diff.

Co-Authored-By: …
```

Tipos en uso: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. El alcance es
el módulo o capa (`cotizador`, `remisiones`, `remisiones-ui`, `clientes`,
`migrations`, `build`, `product`, `web`).

Ejemplos reales:

```
feat(remisiones): router v2 con permisos por rol y owner-scoping
fix(gastos): GroupingError de Postgres en total por moneda — reutilizar la expresión coalesce
refactor(contactos): hooks de contacto en features/contactos/useContactoMutations
chore(build): regenerar dist (fix tolerancia TC + formato cantidades)
docs(product): gap-analysis de remisiones v2
```

Convención específica: los rebuilds del SPA se commitean como
**`chore(build): regenerar dist (<qué cambió>)`**, ya sea en el mismo commit del
cambio o inmediatamente después.

---

## 4. Build y deploy

```bash
cd web && npm run typecheck     # tsc estricto
cd web && npm run test          # vitest
cd web && npm run build         # OBLIGATORIO antes de push si tocaste web/
pytest -q                       # backend (requiere requirements-dev.txt)
```

- **`app/static/dist/` va commiteado.** El build de producción **no** compila la
  SPA (ver [`deployment.md`](deployment.md)): lo que subes es exactamente lo que
  corre. Si editas `web/` y no reconstruyes, producción queda con la versión
  anterior aunque el backend sí se actualice.
- **`main` es producción.** Railway hace autodeploy en cada push a `main`; no hay
  staging. Trabaja en rama y mergea cuando el build esté regenerado y
  verificado.

---

## Ver también

- [`local-setup.md`](local-setup.md) · [`deployment.md`](deployment.md) · [`testing.md`](testing.md)
- `CLAUDE.md` (raíz) — reglas para agentes
- [`../current-state/ui-component-inventory.md`](../current-state/ui-component-inventory.md) — inventario de primitivas
