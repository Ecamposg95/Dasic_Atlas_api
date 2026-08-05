# Setup local

Puesta en marcha del proyecto en una máquina de desarrollo. Todo lo de aquí está
verificado contra el código actual (`app/core/config.py`, `app/core/lifespan.py`,
`app/db/seeds.py`, `web/vite.config.ts`).

---

## 1. Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| **Python** | **3.11** | `runtime.txt` fija `3.11`; Railway instala 3.11.15. Local funciona con 3.12 (los `.pyc` de `tests/` son de 3.12), pero produce contra 3.11 |
| **PostgreSQL** | 14+ | Único motor soportado. No hay SQLite en producción ni en el arranque |
| **Node.js** | 18+ | Requisito de Vite 5. Verificado con Node 24 / npm 12 |
| **git** | — | |

En Debian/Ubuntu/WSL, `python3 -m venv` necesita el paquete del sistema:

```bash
sudo apt install python3.11-venv   # o python3.12-venv según tu Python
```

---

## 2. Variables de entorno

Se cargan con `python-dotenv` desde un `.env` en la raíz (`get_settings()` llama
`load_dotenv()`). Parte de la base:

```bash
cp .env.example .env
```

### Obligatorias — la app **no arranca** sin ellas

| Variable | Para qué | Detalle |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | `normalize_database_url()` reescribe `postgres://` y `postgresql://` a `postgresql+psycopg://`. Sin ella: `RuntimeError: DATABASE_URL no está configurada.` |
| `SECRET_KEY` | Firma HS256 del JWT | **Mínimo 32 caracteres** — con menos, el boot falla con un `RuntimeError` explícito. Genera con `openssl rand -hex 32` |

### Opcionales

| Variable | Default | Para qué |
|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Vigencia del JWT (12 h) |
| `TOKEN_COOKIE_NAME` | `access_token` | Nombre de la cookie HttpOnly de sesión |
| `COOKIE_SECURE` | `false` | `Secure` en la cookie. En local debe ser `false` (HTTP); en producción `true` |
| `ENV` / `ENVIRONMENT` | *(vacío)* | Si vale `production`/`prod` y `COOKIE_SECURE=false`, se loguea un error de seguridad al boot. También lo reporta `/api/superadmin/health` |
| `ALLOWED_ORIGINS` | *(vacío)* | Orígenes CORS separados por coma. **Vacío bloquea todos los orígenes** (se loguea un warning). No hace falta en local: el proxy de Vite es same-origin |
| `LOG_LEVEL` | `INFO` | Nivel de logging (`app/core/logging.py`) |
| `IVA_RATE` | `0.16` | IVA por defecto. La consola de plataforma puede sobrescribirlo en runtime (`app/core/runtime_config.py`) |
| `QUOTE_VALIDITY_DAYS` | `15` | Vigencia de cotizaciones. También sobrescribible en runtime |
| `BANXICO_TOKEN` | *(vacío)* | TC oficial vía Banxico SIE (serie SF63528). Sin token, `app/services/fx_service.py` cae a `open.er-api.com`. Registro gratuito: <https://www.banxico.org.mx/SieAPIRest/service/v1/token/registro> |
| `ANTHROPIC_API_KEY` | *(vacío)* | Habilita las sugerencias de IA (`app/services/ai_service.py`) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Modelo usado por el servicio de IA |
| `SMTP_HOST` | *(vacío)* | Envío de cotizaciones por correo |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | *(vacío)* | |
| `SMTP_PASSWORD` | *(vacío)* | |
| `SMTP_FROM` | `= SMTP_USER` | Remitente; si no se define, usa `SMTP_USER` |
| `SMTP_USE_TLS` | `true` | |
| `SUPERADMIN_EMAIL` | *(vacío)* | Con `SUPERADMIN_PASSWORD`, crea (o promueve) un superadmin dedicado al boot. Idempotente: si el usuario ya existe, **no** pisa su contraseña |
| `SUPERADMIN_PASSWORD` | *(vacío)* | Requerida junto con `SUPERADMIN_EMAIL`; si falta cualquiera de las dos, el seed es no-op |
| `SUPERADMIN_NOMBRE` | `Super Admin` | Nombre del superadmin dedicado |
| `BOOTSTRAP_SUPERADMIN_EMAIL` | *(vacío)* | Promueve a SUPERADMIN un usuario **existente** por email, sin tocar su contraseña |
| `DASIC_AUTO_CREATE_TABLES` | `1` | `0` desactiva el `create_all()` del arranque (solo si quieres validar un camino Alembic puro) |
| `SEED_CONTEXT_DISABLED` | *(vacío)* | `1` desactiva la ingesta de datos de `context/` en el bootstrap inicial |
| `RAILWAY_GIT_COMMIT_SHA` / `GIT_SHA` | *(vacío)* | Solo informativo: lo muestra `/api/superadmin/health` |

Booleanos: se consideran verdaderos `1`, `true`, `yes`, `on` (case-insensitive).

> `REMEMBER_SESSION_DAYS` aparece en `app/core/config.py` (default `30`) pero
> hoy **no se propaga** a `Settings` — cambiarla no tiene efecto.

---

## 3. Base de datos

```bash
# Crear la base (el nombre debe coincidir con tu DATABASE_URL)
createdb -h localhost -U postgres dasi_crm_local
# o: psql -h localhost -U postgres -c "CREATE DATABASE dasi_crm_local;"
```

`.env.example` apunta a
`postgresql+psycopg://postgres:toor@localhost:5432/dasi_crm_local`. Ajusta
usuario/contraseña a tu instalación.

**Migraciones (opcional en local, recomendado):**

```bash
alembic upgrade head    # migrations/env.py toma DATABASE_URL de get_settings()
```

No es estrictamente necesario para arrancar: el `lifespan` ejecuta
`Base.metadata.create_all()` y el backfill DDL idempotente. Pero correr Alembic
mantiene tu base alineada con el historial canónico (53 revisiones en
`migrations/versions/`).

---

## 4. Instalar dependencias y arrancar el backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload
# App:     http://127.0.0.1:8000/
# Swagger: http://127.0.0.1:8000/docs
# Health:  http://127.0.0.1:8000/health
```

### Qué hace el primer arranque

`app/core/lifespan.py` corre, en orden:

1. **`Base.metadata.create_all()`** — crea las tablas que falten (idempotente).
   Desactivable con `DASIC_AUTO_CREATE_TABLES=0`.
2. **`run_all_seeds()`** (`app/db/seeds.py`), todos idempotentes:
   - `run_backfill_ddl` — `ALTER TABLE … ADD COLUMN IF NOT EXISTS` para columnas
     agregadas por migraciones (tolera fallos individuales, solo loguea).
   - `seed_super_admin` — crea el usuario admin **solo si la tabla `usuarios`
     está vacía**.
   - `seed_dedicated_superadmin` / `promote_superadmin_from_env` — superadmin
     desde variables de entorno (ver tabla arriba).
   - `seed_marcas` — taxonomía de marcas desde `app/data/marca_abreviaturas.json`.
   - `seed_sat_catalogos_pequenos` — 10 catálogos SAT (formas de pago, usos de
     CFDI, regímenes, monedas, etc.) desde `app/data/sat/`.
   - `seed_sat_clave_unidad` — set curado de claves de unidad SAT.
   - `seed_contactos_principal` — backfill de contacto principal por cliente.
   - `seed_default_pipeline` — pipeline "Ventas" con 5 etapas (Prospecto →
     Cotizado → Negociación → Ganado/Perdido) si no existe ninguno.
   - `seed_unidades` — catálogo `unidades_medida` (PZA, MTS, CAJA, KIT, …) más
     las unidades libres ya usadas en productos.
3. **Ingesta de `context/`** — solo si la tabla `clientes` está **vacía**
   (bootstrap inicial). Con datos reales presentes nunca se re-siembra.
   Desactivable con `SEED_CONTEXT_DISABLED=1`.

### Credenciales iniciales

`seed_super_admin` crea, **únicamente si no existe ningún usuario**:

| Campo | Valor |
|---|---|
| Email | `admin@dasic.mx` |
| Contraseña | `784512` |
| Rol | `SUPERADMIN` |

Cámbiala en cuanto entres. Si prefieres tu propia cuenta desde el inicio, define
`SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD` antes del primer arranque.

> Los docs de `docs/onboarding/` mencionan `admin@dasic.com / admin123`: eso es
> histórico y ya no corresponde al seed.

---

## 5. Frontend

```bash
cd web
npm install
npm run dev      # Vite en :5173, proxy de /api → http://127.0.0.1:8000
```

`vite.config.ts` fija `base: '/static/dist/'` (para que el `index.html` del build
apunte a las URLs reales que sirve FastAPI). Consecuencia en desarrollo,
**verificada**:

- El dev server publica la app en **<http://localhost:5173/static/dist/>**
  (`/` responde 302 hacia ahí).
- Una petición *dura* a `http://localhost:5173/spa/dashboard` responde **404**:
  el fallback SPA de Vite solo aplica bajo el `base`. La navegación dentro de la
  app funciona normal porque la resuelve React Router en el cliente.
- `/api/*` sí se proxea a `:8000` y la cookie `access_token` se preserva (mismo
  host `localhost`).

Si necesitas entrar por deep-link o probar el flujo exacto de producción, usa el
build servido por el backend:

```bash
cd web && npm run build      # escribe a ../app/static/dist/
# luego abre http://127.0.0.1:8000/ con uvicorn corriendo
```

Otros scripts (`web/package.json`):

```bash
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build
npm run types:gen    # regenera src/types/api.ts desde /openapi.json (backend arriba)
```

---

## 6. Pruebas

### Backend (pytest)

`requirements.txt` **no** incluye pytest — las dependencias de prueba viven en
`requirements-dev.txt` (Railway no lo instala):

```bash
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
```

Si no existe `requirements-dev.txt` en tu copia, basta con `pip install pytest
httpx` (httpx lo requiere `starlette.testclient`).

No necesitas PostgreSQL para correr la suite: `tests/conftest.py` fija un
`DATABASE_URL` dummy (el engine es lazy y nunca se conecta) y cada test usa un
SQLite en memoria con dos funciones Postgres shimeadas (`hashtext`,
`pg_advisory_xact_lock`). **Ojo con la fidelidad:** SQLite tolera SQL que
Postgres rechaza — ya se escapó a producción un `GroupingError` por esa brecha.

### Frontend (vitest)

```bash
cd web
npm run test         # corrida única
npm run test:watch   # modo watch
```

Detalle de cobertura en [`testing.md`](testing.md).

---

## 7. Troubleshooting

### `RuntimeError: SECRET_KEY debe tener al menos 32 caracteres`

`.env.example` trae `SECRET_KEY=change-me` (9 caracteres) — con ese valor la app
**no arranca**. Genera uno real:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
# o: openssl rand -hex 32
```

Lo mismo aplica a `RuntimeError: DATABASE_URL no está configurada.` si el `.env`
no se está cargando (verifica que esté en la **raíz** del repo).

### La app no arranca y el log muestra "Error en create_all"

`lifespan` propaga la excepción: si PostgreSQL no está corriendo, la base no
existe o las credenciales son incorrectas, el proceso muere al boot. Comprueba:

```bash
pg_isready -h localhost
psql "$DATABASE_URL" -c "SELECT 1"    # usa la URL sin el sufijo +psycopg si psql se queja
```

`GET /health` devuelve `503 {"status":"degraded"}` cuando la DB no responde o la
tabla `ordenes_venta` no es accesible.

### `<h1>SPA build missing</h1>` o 503 al abrir una página

No existe `app/static/dist/index.html`. Corre `cd web && npm run build`. (La ruta
`/` cae al login Jinja de respaldo en vez de fallar, así que el síntoma suele
verse en `/dashboard` u otra ruta protegida.)

### "Failed to fetch dynamically imported module" tras un deploy

Chunk viejo: el `index.html` se sirve con `no-cache`, pero una pestaña ya abierta
conserva el entry anterior y pide un hash que ya no existe. `lazyPage()` en
`web/src/router.tsx` **recarga una vez** automáticamente (con guarda en
`sessionStorage` para no entrar en loop). Si persiste tras la recarga, el fallo
es real: revisa que `app/static/dist/` esté actualizado y commiteado.

### `python3 -m venv` falla con "ensurepip is not available"

Falta el paquete del sistema (típico en WSL/Ubuntu):

```bash
sudo apt install python3.12-venv   # ajusta a tu versión de Python
```

### `ModuleNotFoundError` / `AttributeError` al arrancar tras agregar un modelo o schema

Falta el re-export en `app/models/__init__.py` o `app/schemas/__init__.py`
(import + entrada en `__all__`). `python -m py_compile` **no** detecta esto: solo
se manifiesta al importar la app.

### Errores de bcrypt al hacer login o crear usuarios

`requirements.txt` fija `bcrypt==4.0.1` a propósito, porque `passlib` 1.7.x no es
compatible con las versiones más nuevas (falla al leer `bcrypt.__about__`). No
actualices ese pin de forma aislada.

---

## Ver también

- [`coding-standards.md`](coding-standards.md) — convenciones de código
- [`deployment.md`](deployment.md) — cómo llega esto a producción
- [`testing.md`](testing.md) — estrategia de pruebas
- [`../Atlas-ONE-Proyecto.md`](../Atlas-ONE-Proyecto.md) — panorama del producto
