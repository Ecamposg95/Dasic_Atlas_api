# Dev workflow

## Setup local (primera vez)

### Requisitos

- Python 3.12+
- PostgreSQL 15+ corriendo
- `uv` (recomendado) o `pip` + `venv`
- `git`

### Pasos

```bash
# 1. clonar
git clone git@github.com:Ecamposg95/dasic-atlas-api.git
cd dasic-atlas-api

# 2. crear virtualenv e instalar deps (uv es ~5x más rápido que pip)
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt

# 3. preparar .env
cp .env.example .env
# editá DATABASE_URL y SECRET_KEY

# 4. crear la base si no existe
PGPASSWORD=tupass createdb -h localhost -U postgres dasi_crm_local

# 5. aplicar migraciones
set -a && source .env && set +a
.venv/bin/alembic upgrade head

# 6. arrancar uvicorn
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
# Swagger: http://127.0.0.1:8001/docs
# App:     http://127.0.0.1:8001/
# Login:   admin@dasic.mx / 784512  (creado por el seed al boot)
```

En el primer boot verás:

```
Tables OK (create_all ejecutado).
Inicializando sistema DASIC ERP — creando administrador...
Admin creado: admin@dasic.mx / 784512
Startup completado correctamente.
Seed context/ OK → {productos:{creados:12,...}, clientes:{...}, ...}
Application startup complete.
```

## Comandos cotidianos

```bash
# Reset completo de la base (NO en prod)
PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDB -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-correr el seed manual (idempotente)
.venv/bin/python scripts/import_context_data.py [--dry-run]

# Endpoint de seed disponible una vez logueado como admin
curl -X POST http://127.0.0.1:8001/api/admin/seed-context -b cookies.txt

# Crear migración nueva
.venv/bin/alembic revision -m "descripcion-corta"
# después: editar el archivo en migrations/versions/, agregar la sentencia equivalente a app/db/seeds.py::_BACKFILL_DDL

# Aplicar
.venv/bin/alembic upgrade head

# Arrancar uvicorn en background y ver logs
.venv/bin/uvicorn app.main:app --reload --port 8001 > /tmp/dasic-uvicorn.log 2>&1 &
tail -f /tmp/dasic-uvicorn.log
```

## "Tests" — no hay pytest, sí hay smoke con curl + psql

El repo aún no tiene suite. La validación estándar después de cada cambio:

```bash
# 1. compile-check
.venv/bin/python -m py_compile app/<archivos_tocados>.py

# 2. login
curl -s -c cookies.txt -X POST http://127.0.0.1:8001/api/auth/login \
  -d 'username=admin@dasic.mx&password=784512' \
  -H 'Content-Type: application/x-www-form-urlencoded' > /dev/null

# 3. probar el endpoint
curl -s -b cookies.txt http://127.0.0.1:8001/api/auth/me | python3 -m json.tool

# 4. verificar DB
PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDB -c "SELECT * FROM <tabla> LIMIT 5;"
```

## Git workflow

- Trabajamos directo en `main`. No PRs ni branches en este repo.
- Conventional Commits en inglés, subject ≤72 chars.
- `git push origin main` cuando esté verde local.
- Railway hace auto-deploy desde `main`.

```bash
git add <archivos>
git commit -m "feat(rbac): backend gating + owner scoping VENTAS"
git push origin main
```

## Estructura de un cambio típico

1. Lee el spec (en `docs/superpowers/specs/`) o sino, escribilo antes de tocar código.
2. Modelos / schemas / migración primero. Si hay columna nueva, **agregá la sentencia equivalente a `_BACKFILL_DDL`** en `app/db/seeds.py` (Railway no corre alembic).
3. Servicio (lógica de dominio).
4. Router (endpoint).
5. Template (frontend Jinja+Alpine).
6. Smoke test con curl + psql.
7. Commit + push.

## Modos de seed

| Cómo | Cuándo |
|---|---|
| Automático en lifespan | Default. Cada vez que la app arranca. Idempotente. |
| `python scripts/import_context_data.py` | Cuando querés correrlo manualmente (CLI). |
| `POST /api/admin/seed-context` | Como admin desde la UI/curl, sin reiniciar. |
| `SEED_CONTEXT_DISABLED=1` | Para desactivarlo (testing, prod limpia). |
