# Despliegue

Cómo llega el código a producción **hoy**. Todo lo de aquí está verificado contra
la configuración real del servicio en Railway y los logs del último build.

> **`main` es producción.** No hay entorno de staging: cada push a `main` se
> despliega automáticamente. Trabaja en rama y mergea cuando esté verificado.

---

## 1. Dónde vive

| | |
|---|---|
| Proveedor | Railway (workspace **Atlas Tech**) |
| Proyecto | **DASIC-API** |
| Entorno | `production` (único) |
| Servicios | `Dasic_Atlas_api` (app) · `Postgres` (base de datos gestionada) |
| Origen | Repo `Ecamposg95/dasic-atlas-api`, rama `main`, autodeploy activo |
| URL | `https://dasicatlasapi-production.up.railway.app` (sin dominio propio) |
| Región / réplicas | `us-west2` · 1 réplica |

El autodeploy **no espera checks de CI** (`checkSuites: false`): el push dispara
el build de inmediato.

---

## 1.b Staging (creado 2026-08-05)

| | Producción | Staging |
|---|---|---|
| URL | `dasicatlasapi-production.up.railway.app` | **`dasicatlasapi-staging.up.railway.app`** |
| Environment | `production` | `staging` |
| Base de datos | Postgres propio | **Postgres propio e independiente** |
| Rama que despliega | `main` | `main` (ver nota) |

**Aislamiento verificado:** el hostname interno `postgres.railway.internal` es el mismo en ambos entornos porque el DNS privado de Railway es *por environment* — resuelve a instancias distintas. Comprobado consultando ambas bases: producción tenía 192 cotizaciones y staging 2. **Staging no puede escribir en producción.**

### Cómo desplegar algo a staging

Hoy staging está conectado a `main`, igual que producción, así que por sí solo es un espejo y no una compuerta previa. Dos formas de usarlo como validación **antes** de tocar producción:

```bash
# Opción A (funciona hoy, sin cambiar configuración):
# sube el estado LOCAL de tu rama a staging
cd /ruta/al/repo
railway up --environment staging --service Dasic_Atlas_api
```

**Opción B (recomendada, requiere un cambio manual de 30 segundos):** en el panel de Railway → environment `staging` → servicio `Dasic_Atlas_api` → Settings → Source, cambiar la rama de `main` a **`staging`** (la rama ya existe en el remoto). A partir de ahí el flujo es:

```
rama de trabajo → merge a `staging` → despliegue automático a staging → validar → merge a `main` → producción
```

La API GraphQL de Railway rechaza este cambio desde fuera del panel (WAF, error 1010), por eso no está automatizado.

### Qué NO replica staging

Las variables de integración (`BANXICO_TOKEN`, `ANTHROPIC_API_KEY`, `SMTP_*`) tampoco están en staging — igual que en producción. El tipo de cambio usará el proveedor público de respaldo y el correo quedará en modo simulado. Si una prueba depende de esas integraciones, hay que añadir la variable solo en staging.

## 2. Qué hace el build (verificado en logs)

El builder es **Railpack** (no nixpacks). El plan que ejecuta es:

```
Packages
  python  │  3.11.15  │  runtime.txt (3.11)

Steps ▸ install
  $ python -m venv /app/.venv
  $ pip install -r requirements.txt

Deploy
  $ uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Tres consecuencias importantes:

1. **El build NO compila la SPA.** No hay paso de Node, npm ni Vite. `package.json`
   vive en `web/`, no en la raíz, así que el autodetect clasifica el repo como
   Python puro. *(Si algún documento dice "nixpacks corre `npm run build`", está
   desactualizado.)*
2. El comando de arranque sale del **`Procfile`** (`Found web command in
   Procfile`). Railway inyecta `PORT`; el dominio público apunta al puerto 8080.
3. La versión de Python la fija **`runtime.txt`**.

`requirements-dev.txt` no se instala en producción (pytest y httpx no viajan al
contenedor).

Un deploy completo tarda ~30 s (build cacheado + push de imagen).

---

## 3. Por qué `app/static/dist/` va commiteado

Como el build de Railway no ejecuta Vite, **el `dist/` que subes a git es
literalmente el frontend que corre en producción**. FastAPI lo sirve desde
`app.mount("/static")` y entrega `app/static/dist/index.html` en cada ruta de
página (con `Cache-Control: no-cache` para que el shell nunca quede cacheado).

La alternativa —un Docker multi-stage con Node— se descartó por complejidad: 71
archivos commiteados son cero piezas en movimiento y dejan explícito qué corre en
producción.

**Regla operativa:** si tocaste cualquier cosa bajo `web/`, corre
`cd web && npm run build` y commitea `app/static/dist/` antes del push. Si no lo
haces, el backend se actualiza y el frontend no — y el síntoma (una feature que
"no se ve" en producción) es confuso.

Si el `index.html` no existe, las rutas protegidas responden **503 `SPA build
missing`**.

---

## 4. Alembic **no** corre en el deploy

El `Procfile` solo levanta uvicorn. Nadie ejecuta `alembic upgrade head` en
producción. El esquema se mantiene con dos mecanismos del arranque
(`app/core/lifespan.py`):

| Mecanismo | Cubre | No cubre |
|---|---|---|
| `Base.metadata.create_all()` | **Tablas nuevas** completas | Columnas nuevas en tablas ya existentes |
| `run_backfill_ddl()` (`_BACKFILL_DDL` en `app/db/seeds.py`) | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` idempotente | Cualquier cosa que no hayas escrito ahí |

**Consecuencia directa:** una migración Alembic que agrega una columna a una
tabla existente y **no** tiene su sentencia espejo en `_BACKFILL_DDL` produce
errores 500 en producción (`column … does not exist`) aunque en local funcione,
porque en local sí corriste Alembic.

El backfill tolera fallos individuales (los loguea como `Backfill DDL skip`) para
no bloquear el arranque, así que un error ahí **no** tumba el deploy: hay que
mirar los logs.

Tras los seeds, el arranque también ejecuta los seeds idempotentes (superadmin,
marcas, catálogos SAT, unidades, pipeline por defecto) — detalle en
[`local-setup.md`](local-setup.md) §4.

---

## 5. Variables de entorno en Railway

Configuradas hoy en el servicio (`Variables` en el dashboard, o
`railway variables`):

`DATABASE_URL` · `SECRET_KEY` · `ACCESS_TOKEN_EXPIRE_MINUTES` ·
`TOKEN_COOKIE_NAME` · `COOKIE_SECURE` · `ALLOWED_ORIGINS` · `LOG_LEVEL`

Más las que Railway inyecta solo (`RAILWAY_*`, incluida
`RAILWAY_GIT_COMMIT_SHA`, que `/api/superadmin/health` reporta como versión
desplegada).

**No están configuradas** (y por lo tanto, están inactivas en producción):

| Variable ausente | Efecto real |
|---|---|
| `BANXICO_TOKEN` | El TC no viene del DOF: `fx_service` usa el fallback público `open.er-api.com` |
| `ANTHROPIC_API_KEY` | Las funciones de IA quedan deshabilitadas |
| `SMTP_*` | No se envían correos |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | El superadmin dedicado no se crea/promueve al boot |
| `ENV` / `ENVIRONMENT` | El aviso de "cookie insegura en producción" nunca se dispara, aunque `COOKIE_SECURE` esté mal |

Cambiar una variable dispara un redeploy del servicio. `SECRET_KEY` debe
permanecer estable: rotarla invalida todas las sesiones activas (las cookies
firmadas dejan de validar).

---

## 6. Verificar un deploy

```bash
# 1. Salud del backend y de la DB
curl -s https://dasicatlasapi-production.up.railway.app/health
# → {"status":"ok","db":"ok"}      (503 {"status":"degraded"} si la DB falla)

# 2. ¿Producción sirve exactamente el dist que tengo commiteado?
grep -o 'assets/[A-Za-z0-9._-]*' app/static/dist/index.html | sort -u
curl -s https://dasicatlasapi-production.up.railway.app/ | grep -o 'assets/[A-Za-z0-9._-]*' | sort -u
# Ambas listas deben ser IDÉNTICAS (mismos hashes de index-*.js/css y vendor-*)
```

Si los hashes difieren, o el deploy aún no terminó, o subiste código sin
regenerar el `dist/`.

**Smoke checks manuales** después de un cambio sensible:

- Login y que el sidebar pinte los módulos del rol.
- Abrir el cotizador, agregar una línea y ver totales (dinero server-side).
- Un listado paginado con filtros (p. ej. Seguimiento o Gastos).
- Si tocaste esquema: la pantalla del módulo afectado, buscando 500 por columna
  faltante.

**Logs y estado:** `railway logs` / el dashboard del servicio. Al boot deben
aparecer `Tables OK (create_all idempotente al boot).` y
`Startup completado correctamente.`; los `Backfill DDL skip (…)` señalan
sentencias del backfill que no se aplicaron.

`GET /api/superadmin/health` (requiere sesión superadmin) muestra versión, git
sha, uptime, conteos de DB y qué integraciones están activas.

---

## 7. Rollback

**Opción A — redeploy del deployment anterior (más rápida, sin tocar git).**
En el dashboard de Railway: servicio `Dasic_Atlas_api` → pestaña *Deployments* →
el deployment `SUCCESS` anterior → *Redeploy*. Reconstruye ese commit exacto,
incluido su `dist/`. Úsalo cuando necesites volver **ya**.

Ojo: el siguiente push a `main` vuelve a desplegar el código roto. El redeploy
compra tiempo, no arregla la rama.

**Opción B — revertir en git (deja `main` consistente).**

```bash
git revert <sha-malo>          # o el rango; nunca reescribas main con --force
cd web && npm run build        # si el revert toca web/, regenera el dist
git add app/static/dist && git commit --amend --no-edit
git push origin main           # dispara el autodeploy
```

**Sobre el esquema:** los cambios que aplican `create_all()` y `_BACKFILL_DDL`
son **aditivos** (crear tabla / agregar columna), así que revertir el código no
deja la base inservible: quedan columnas y tablas huérfanas sin uso. No hay
downgrade automático — si necesitas revertir una migración, hazlo a mano
(`alembic downgrade` contra la DB de producción) y con respaldo previo.

**Respaldos:** se generan localmente con `pg_dump` contra la DB de Railway y se
guardan en `backups/`, que está en `.gitignore` (contienen datos de negocio —
nunca se commitean).

---

## 8. Limitaciones conocidas

- **Sin staging.** El único entorno es `production`. Lo más cercano a un ensayo
  es levantar el backend local contra una copia de la base.
- **Sin CI.** No hay pipeline que corra `pytest` / `vitest` / `typecheck` antes
  del deploy: la verificación es responsabilidad de quien mergea.
- **El deploy no valida que el `dist/` esté fresco.** Nada compara los `.tsx`
  contra el build subido.
- **Una sola réplica**, así que un deploy implica un breve reinicio del proceso.

---

## Ver también

- [`local-setup.md`](local-setup.md) · [`coding-standards.md`](coding-standards.md) · [`testing.md`](testing.md)
- [`../current-state/risk-register.md`](../current-state/risk-register.md) — riesgos del sistema en producción
