# Remisiones v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el módulo de remisiones con arquitectura Atlas (capas domains/service/repository) sobre las tablas existentes evolucionadas, cubriendo entregas parciales con acumulados, unidades administrables, estados con borradores, permisos por rol y conversión remisión→cotización.

**Architecture:** Módulo `app/domains/remisiones/` (models/schemas/repository/service/router/documents) que reemplaza a `app/routers/remisiones.py` en el mismo prefix `/api/remisiones`. Datos continuos: migraciones aditivas sobre `remisiones`/`detalles_remision`. `folio_service` genérico con lock inyectable. Spec: `docs/superpowers/specs/2026-08-03-remisiones-v2-design.md`.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + Jinja2 + python-docx (backend), React/Zustand/Vite (web/), pytest (nuevo en el repo).

## Global Constraints

- **Triple vía de esquema**: todo cambio de columna/tabla = modelo SQLAlchemy + migración en `migrations/versions/` + entrada idempotente en `_BACKFILL_DDL` de `app/db/seeds.py`. Railway NO ejecuta Alembic.
- **Cadena Alembic**: head actual = `20260611_01`. Las migraciones nuevas encadenan desde ahí en orden: `20260803_01` → `20260803_02` → `20260803_03`.
- **⚠️ Colisión conocida**: hay trabajo en vuelo (sin commitear, en el checkout principal) con `20260804_01_deal_detalle` que TAMBIÉN encadena de `20260611_01`. Cuando ambas ramas aterricen habrá dos heads — el que aterrice segundo ajusta su `down_revision`. Verificar `alembic heads` (un solo head) antes del merge final.
- **Folio**: formato `R-YYMM####` (4 dígitos, consecutivo mensual). Se asigna SOLO al emitir. Nunca en borrador.
- **Enums**: patrón `str, enum.Enum` con `_missing_` tolerante (copiar de `EstatusOrden` en `app/models/enums.py:239`).
- **Locks**: `pg_advisory_xact_lock` es Postgres-only. Todo código que lockea recibe el locker inyectable para que los tests SQLite lo sustituyan.
- **Stock**: `movimientos_stock.cantidad` es `Integer`. Solo líneas con `producto_id` de catálogo mueven stock; si su cantidad no es entera → 400 al emitir con descuento activo.
- **Branding**: nada de `"DASIC Industrial"` hardcodeado en código nuevo; leer `PlatformConfig` clave `empresa_nombre` con default `"DASIC Industrial"`.
- **Idioma**: dominio y mensajes de error en español, como el resto del repo.
- **Frontend gate**: `cd web && npx tsc --noEmit && npm run build`. El `dist/` se regenera y commitea al final (patrón "chore(build): regenerar dist").
- **Commits**: uno por task mínimo, mensajes en español estilo repo (`feat(remisiones): ...`).
- **Python en esta máquina**: puede no haber pip/pytest. Task 1 lo resuelve o el plan se detiene ahí y se reporta el bloqueo — no se avanza sin poder correr tests.

---

### Task 1: Infraestructura de tests (primera suite del repo)

**Files:**
- Create: `pytest.ini`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Test: `tests/test_smoke.py`

**Interfaces:**
- Produces: fixtures `db` (Session SQLite in-memory con `Base.metadata.create_all`) y `usuario(rol)` (factory de `models.Usuario`); los usan todas las tasks siguientes.

- [ ] **Step 1: Verificar/instalar el stack Python**

Run: `python3 -m pytest --version`
Si falla: `python3 -m pip --version || python3 -m ensurepip --user --upgrade`
Luego: `python3 -m pip install --user --break-system-packages pytest httpx -r requirements.txt`
Si pip no puede instalarse (sistema apt-managed sin permisos), **DETENTE y reporta el bloqueo** — el plan entero depende de poder correr tests.

- [ ] **Step 2: Crear pytest.ini y conftest**

`pytest.ini`:
```ini
[pytest]
testpaths = tests
```

`tests/conftest.py`:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app import models


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def usuario(db):
    """Factory: usuario(rol='administrador') -> models.Usuario persistido."""
    def _make(rol="administrador", email=None):
        u = models.Usuario(
            nombre=f"Test {rol}",
            email=email or f"{rol}@test.local",
            password_hash="x",
            rol=rol,
            activo=True,
        )
        db.add(u)
        db.commit()
        return u
    return _make
```
Nota: verificar el nombre real del campo de password en `app/models/users.py:15-25` (es `password_hash`); si difiere, usar el del modelo.

- [ ] **Step 3: Smoke test**

`tests/test_smoke.py`:
```python
from app import models


def test_create_all_y_usuario(db, usuario):
    u = usuario("ventas")
    assert u.id is not None
    assert db.query(models.Usuario).count() == 1
```

- [ ] **Step 4: Correr y verificar PASS**

Run: `python3 -m pytest tests/test_smoke.py -v`
Expected: PASS. Si `create_all` truena en SQLite por algún tipo Postgres-only, anotar el modelo culpable y arreglarlo con variantes portables (p.ej. `sa.Text` en vez de JSONB) — reportar en el resumen del task.

- [ ] **Step 5: Commit**

```bash
git add pytest.ini tests/
git commit -m "test: infraestructura pytest — primera suite del repo (SQLite in-memory + fixtures)"
```

---

### Task 2: folio_service genérico con lock inyectable

**Files:**
- Create: `app/services/folio_service.py`
- Test: `tests/test_folio_service.py`

**Interfaces:**
- Produces: `generar_folio(db, *, prefijo: str, modelo, campo, padding: int = 4, ahora: datetime | None = None, locker: Callable[[Session, str], None] = pg_locker) -> str`. Task 6 (emisión) lo consume con `prefijo="R"`, `modelo=models.Remision`, `campo=models.Remision.folio`.

- [ ] **Step 1: Test que falla**

`tests/test_folio_service.py`:
```python
from datetime import datetime
from app import models
from app.services.folio_service import generar_folio


def _noop_locker(db, key):
    pass


def test_primer_folio_del_mes(db):
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 15), locker=_noop_locker,
    )
    assert folio == "R-26080001"


def test_consecutivo_incrementa(db):
    db.add(models.Remision(folio="R-26080007"))
    db.commit()
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 20), locker=_noop_locker,
    )
    assert folio == "R-26080008"


def test_consecutivo_reinicia_por_mes(db):
    db.add(models.Remision(folio="R-26070042"))
    db.commit()
    folio = generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio,
        ahora=datetime(2026, 8, 1), locker=_noop_locker,
    )
    assert folio == "R-26080001"
```

- [ ] **Step 2: Verificar que falla**

Run: `python3 -m pytest tests/test_folio_service.py -v`
Expected: FAIL con `ModuleNotFoundError: app.services.folio_service`

- [ ] **Step 3: Implementación**

`app/services/folio_service.py`:
```python
"""Generador transaccional de folios consecutivos por mes.

Generaliza el patrón repetido en ventas.py/compras.py/remisiones.py:
advisory lock + MAX(folio) + regex. El locker es inyectable porque
pg_advisory_xact_lock es Postgres-only (los tests usan un no-op).
"""
import re
from datetime import datetime
from typing import Callable

from sqlalchemy import func, text
from sqlalchemy.orm import Session


def pg_locker(db: Session, key: str) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": key})


def generar_folio(
    db: Session,
    *,
    prefijo: str,
    modelo,
    campo,
    padding: int = 4,
    ahora: datetime | None = None,
    locker: Callable[[Session, str], None] = pg_locker,
) -> str:
    ahora = ahora or datetime.utcnow()
    yymm = ahora.strftime("%y%m")
    locker(db, f"folio:{prefijo}:{yymm}")
    ultimo = db.query(func.max(campo)).filter(campo.like(f"{prefijo}-{yymm}%")).scalar()
    consecutivo = 1
    if ultimo:
        m = re.match(rf"{re.escape(prefijo)}-{re.escape(yymm)}(\d+)", ultimo)
        if m:
            consecutivo = int(m.group(1)) + 1
    return f"{prefijo}-{yymm}{consecutivo:0{padding}d}"
```

- [ ] **Step 4: Verificar PASS**

Run: `python3 -m pytest tests/test_folio_service.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/folio_service.py tests/test_folio_service.py
git commit -m "feat(folios): folio_service genérico con lock inyectable (patrón unificado R-YYMM####)"
```

---

### Task 3: Estados y columnas de ciclo de vida en Remision

**Files:**
- Modify: `app/models/enums.py` (después de `EstatusOrden`, ~línea 256)
- Modify: `app/models/remisiones.py`
- Modify: `app/models/__init__.py:64` (re-export `EstadoRemision`)
- Create: `migrations/versions/20260803_01_remision_estados.py`
- Modify: `app/db/seeds.py` (`_BACKFILL_DDL`)
- Test: `tests/test_remision_modelo.py`

**Interfaces:**
- Produces: `models.EstadoRemision` (BORRADOR/EMITIDA/RECIBIDA/CANCELADA); columnas nuevas de `Remision`: `estado`, `emitida_at`, `emitida_por_id`, `cancelada_at`, `cancelada_por_id`, `motivo_cancelacion`, `sobre_entrega_autorizada_por_id`, `stock_descontado`. Tasks 5-8 las consumen.

- [ ] **Step 1: Test que falla**

`tests/test_remision_modelo.py`:
```python
from app import models


def test_remision_nace_borrador_sin_folio(db):
    rem = models.Remision(cliente_id=None, orden_venta_id=None)
    db.add(rem)
    db.commit()
    assert rem.estado == models.EstadoRemision.BORRADOR
    assert rem.folio is None
    assert rem.stock_descontado is False
```

- [ ] **Step 2: Verificar que falla**

Run: `python3 -m pytest tests/test_remision_modelo.py -v`
Expected: FAIL con `AttributeError: EstadoRemision`

- [ ] **Step 3: Enum + modelo**

En `app/models/enums.py`, después de `EstatusOrden`:
```python
class EstadoRemision(str, enum.Enum):
    BORRADOR = "borrador"
    EMITIDA = "emitida"
    RECIBIDA = "recibida"
    CANCELADA = "cancelada"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            v = value.strip().lower()
            for miembro in cls:
                if miembro.value == v or miembro.name.lower() == v:
                    return miembro
        return None
```

En `app/models/remisiones.py` agregar a `Remision` (imports: `Enum` de sqlalchemy, `EstadoRemision` de `.enums`):
```python
    estado = Column(Enum(EstadoRemision, values_callable=lambda e: [m.value for m in e]),
                    nullable=False, server_default=text("'borrador'"), index=True)
    emitida_at = Column(DateTime(timezone=True), nullable=True)
    emitida_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    cancelada_at = Column(DateTime(timezone=True), nullable=True)
    cancelada_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    motivo_cancelacion = Column(Text, nullable=True)
    sobre_entrega_autorizada_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    stock_descontado = Column(Boolean, nullable=False, server_default=text("false"))
```
Verificar cómo persisten los demás enums del repo (`OrdenVenta.estatus` usa `TolerantEnum` — `app/models/enums.py:114-178`); si `Enum(...)` plano rompe con valores legacy, usar `TolerantEnum(EstadoRemision)` igual que ventas. En `app/models/__init__.py` re-exportar `EstadoRemision` junto a `Remision`.

- [ ] **Step 4: Migración + backfill DDL**

`migrations/versions/20260803_01_remision_estados.py`:
```python
"""remisiones: estados + ciclo de vida (folio nullable, emision/cancelacion)

Revision ID: 20260803_01
Revises: 20260611_01
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_01"
down_revision = "20260611_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("remisiones", sa.Column("estado", sa.String(20), nullable=False, server_default="borrador"))
    op.add_column("remisiones", sa.Column("emitida_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("remisiones", sa.Column("emitida_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("cancelada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("remisiones", sa.Column("cancelada_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("motivo_cancelacion", sa.Text(), nullable=True))
    op.add_column("remisiones", sa.Column("sobre_entrega_autorizada_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("stock_descontado", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_remisiones_estado", "remisiones", ["estado"])
    # Backfill de históricos: con recepción -> recibida; el resto -> emitida.
    op.execute("UPDATE remisiones SET estado = CASE WHEN recibido_at IS NOT NULL THEN 'recibida' ELSE 'emitida' END")


def downgrade() -> None:
    op.drop_index("ix_remisiones_estado", "remisiones")
    for col in ("estado", "emitida_at", "emitida_por_id", "cancelada_at",
                "cancelada_por_id", "motivo_cancelacion",
                "sobre_entrega_autorizada_por_id", "stock_descontado"):
        op.drop_column("remisiones", col)
```

En `_BACKFILL_DDL` de `app/db/seeds.py` (al final de la lista, con comentario `# 20260803_01: remisiones v2 estados`):
```python
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'borrador'",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS emitida_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS emitida_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS cancelada_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS cancelada_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS sobre_entrega_autorizada_por_id INTEGER REFERENCES usuarios(id)",
    "ALTER TABLE IF EXISTS remisiones ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT false",
    "CREATE INDEX IF NOT EXISTS ix_remisiones_estado ON remisiones (estado)",
    "UPDATE remisiones SET estado = CASE WHEN recibido_at IS NOT NULL THEN 'recibida' ELSE 'emitida' END WHERE estado = 'borrador' AND folio IS NOT NULL",
```
Nota: el `UPDATE` del DDL lleva `WHERE ... folio IS NOT NULL` para ser idempotente sin pisar borradores v2 reales (un borrador v2 nunca tiene folio).

- [ ] **Step 5: Verificar PASS y commit**

Run: `python3 -m pytest tests/ -v`
Expected: todos PASS

```bash
git add app/models/enums.py app/models/remisiones.py app/models/__init__.py migrations/versions/20260803_01_remision_estados.py app/db/seeds.py tests/test_remision_modelo.py
git commit -m "feat(remisiones): estados BORRADOR/EMITIDA/RECIBIDA/CANCELADA + ciclo de vida en el modelo"
```

---

### Task 4: Numeric(12,3), unidad por partida y catálogo unidades_medida

**Files:**
- Modify: `app/models/remisiones.py` (`DetalleRemision.cantidad`, `+unidad`)
- Modify: `app/models/sales.py:112` (`DetalleOrden.cantidad`, `+unidad`)
- Create: `app/models/unidades.py`
- Modify: `app/models/__init__.py` (re-export `UnidadMedida`)
- Modify: `app/schemas/sales.py` (`DetalleOrdenCreate`: `unidad: Optional[str]`; `cantidad: Decimal`)
- Modify: `app/routers/catalogos.py:399-452` (endpoints unidades sobre tabla)
- Create: `migrations/versions/20260803_02_numeric_unidades.py`
- Modify: `app/db/seeds.py` (`_BACKFILL_DDL` + seed de unidades)
- Test: `tests/test_unidades.py`

**Interfaces:**
- Produces: `models.UnidadMedida` (`nombre`, `abreviatura`, `activa`, `orden`); `DetalleRemision.unidad`/`DetalleOrden.unidad` (String(20) snapshot); cantidades `Numeric(12, 3)`. `GET /api/catalogos/unidades` ahora devuelve `[{id, nombre, abreviatura, activa}]` de la tabla.

- [ ] **Step 1: Tests que fallan**

`tests/test_unidades.py`:
```python
from decimal import Decimal
from app import models


def test_unidad_medida_tabla(db):
    u = models.UnidadMedida(nombre="Metro", abreviatura="MTS", activa=True, orden=2)
    db.add(u)
    db.commit()
    assert db.query(models.UnidadMedida).filter_by(nombre="Metro").one().abreviatura == "MTS"


def test_detalle_remision_acepta_decimales_y_unidad(db):
    rem = models.Remision()
    db.add(rem)
    db.flush()
    det = models.DetalleRemision(
        remision_id=rem.id, descripcion="Cable", cantidad=Decimal("2.500"), unidad="MTS",
    )
    db.add(det)
    db.commit()
    assert det.cantidad == Decimal("2.500")
    assert det.unidad == "MTS"
```

- [ ] **Step 2: Verificar que falla** — `python3 -m pytest tests/test_unidades.py -v` → FAIL (`UnidadMedida` no existe)

- [ ] **Step 3: Modelos**

`app/models/unidades.py`:
```python
"""Catálogo administrable de unidades de medida comerciales.

Las partidas (DetalleOrden/DetalleRemision) guardan la unidad como STRING
snapshot — igual que marca y claves SAT — para que renombrar una unidad no
reescriba documentos históricos.
"""
from sqlalchemy import Boolean, Column, Integer, String, text

from app.db import Base


class UnidadMedida(Base):
    __tablename__ = "unidades_medida"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(40), nullable=False, unique=True)
    abreviatura = Column(String(20), nullable=False)
    activa = Column(Boolean, nullable=False, server_default=text("true"))
    orden = Column(Integer, nullable=False, server_default=text("0"))
```

En `DetalleRemision`: `cantidad = Column(Numeric(12, 3), nullable=False)` y `unidad = Column(String(20), nullable=True)` (import `Numeric` de sqlalchemy). Igual en `DetalleOrden` (`app/models/sales.py:112`). En `app/schemas/sales.py`, `DetalleOrdenCreate.cantidad: Decimal` (verificar validadores existentes que asuman int) y `unidad: Optional[str] = None`.

- [ ] **Step 4: Migración + DDL + seed**

`migrations/versions/20260803_02_numeric_unidades.py`:
```python
"""cantidades Numeric(12,3) + unidad snapshot + tabla unidades_medida

Revision ID: 20260803_02
Revises: 20260803_01
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_02"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("detalles_orden", "cantidad", type_=sa.Numeric(12, 3))
    op.alter_column("detalles_remision", "cantidad", type_=sa.Numeric(12, 3))
    op.add_column("detalles_orden", sa.Column("unidad", sa.String(20), nullable=True))
    op.add_column("detalles_remision", sa.Column("unidad", sa.String(20), nullable=True))
    op.create_table(
        "unidades_medida",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(40), nullable=False, unique=True),
        sa.Column("abreviatura", sa.String(20), nullable=False),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("unidades_medida")
    op.drop_column("detalles_remision", "unidad")
    op.drop_column("detalles_orden", "unidad")
    op.alter_column("detalles_remision", "cantidad", type_=sa.Integer())
    op.alter_column("detalles_orden", "cantidad", type_=sa.Integer())
```

`_BACKFILL_DDL` (comentario `# 20260803_02: numeric + unidades`):
```python
    "ALTER TABLE IF EXISTS detalles_orden ALTER COLUMN cantidad TYPE NUMERIC(12,3)",
    "ALTER TABLE IF EXISTS detalles_remision ALTER COLUMN cantidad TYPE NUMERIC(12,3)",
    "ALTER TABLE IF EXISTS detalles_orden ADD COLUMN IF NOT EXISTS unidad VARCHAR(20)",
    "ALTER TABLE IF EXISTS detalles_remision ADD COLUMN IF NOT EXISTS unidad VARCHAR(20)",
    """CREATE TABLE IF NOT EXISTS unidades_medida (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(40) NOT NULL UNIQUE,
        abreviatura VARCHAR(20) NOT NULL,
        activa BOOLEAN NOT NULL DEFAULT true,
        orden INTEGER NOT NULL DEFAULT 0
    )""",
```

Seed (en `app/db/seeds.py`, función nueva `seed_unidades(db)` llamada donde se llaman los otros seeds; buscar el punto de entrada de seeds en el mismo archivo):
```python
_UNIDADES_BASE = [
    ("Pieza", "PZA"), ("Metro", "MTS"), ("Caja", "CAJA"), ("Kit", "KIT"),
    ("Mes", "MES"), ("Servicio", "SERV"), ("Kilogramo", "KG"), ("Juego", "JUEGO"),
    ("Par", "PAR"), ("Rollo", "ROLLO"), ("Litro", "LITRO"),
]

def seed_unidades(db):
    from app import models
    existentes = {u.abreviatura for u in db.query(models.UnidadMedida).all()}
    for i, (nombre, abrev) in enumerate(_UNIDADES_BASE):
        if abrev not in existentes:
            db.add(models.UnidadMedida(nombre=nombre, abreviatura=abrev, orden=i))
    # Unidades libres ya usadas en productos que no estén en la base:
    usadas = {r[0] for r in db.query(models.Producto.unidad).distinct() if r[0]}
    conocidas = {a for _, a in _UNIDADES_BASE} | existentes
    for extra in sorted(usadas - conocidas):
        db.add(models.UnidadMedida(nombre=extra, abreviatura=extra, orden=99))
    db.commit()
```

En `app/routers/catalogos.py`: `GET /api/catalogos/unidades` devuelve la tabla (`activa=true` por default, `?todas=true` para admin); `POST /api/catalogos/unidades` y `PATCH /api/catalogos/unidades/{id}` (solo `require(user, "manage", "unidad")` — admin, ver Task 7); el `PUT /rename` masivo existente se conserva intacto.

- [ ] **Step 5: Verificar PASS, revisar cotizador**

Run: `python3 -m pytest tests/ -v` → PASS.
Además: `grep -rn "\.cantidad" web/src/features/cotizador/lib/calc.ts` y verificar que los cálculos frontend no trunquen decimales (los inputs de cantidad deben aceptar `step=0.001`; se ajustan en Task 10).

- [ ] **Step 6: Commit**

```bash
git add app/models/ app/schemas/sales.py app/routers/catalogos.py migrations/versions/20260803_02_numeric_unidades.py app/db/seeds.py tests/test_unidades.py
git commit -m "feat(unidades): tabla unidades_medida + unidad snapshot por partida + cantidades Numeric(12,3)"
```

---

### Task 5: Dominio remisiones — repository con acumulados

**Files:**
- Create: `app/domains/__init__.py`, `app/domains/remisiones/__init__.py`
- Create: `app/domains/remisiones/repository.py`
- Test: `tests/test_remisiones_repository.py`

**Interfaces:**
- Produces:
  - `entregado_por_detalle(db, orden_venta_id: int) -> dict[int, Decimal]` — suma de `detalles_remision.cantidad` de remisiones EMITIDA/RECIBIDA, por `detalle_orden_id`.
  - `pendientes_por_detalle(db, orden) -> dict[int, Decimal]` — `detalle.cantidad − entregado`.
  - `listar(db, *, q, orden_venta_id, estado, desde, hasta, creado_por_id, page, page_size, owner_id=None) -> (total, rows)` — filtros combinables; `owner_id` aplica scoping de VENTAS.
- Consumes: modelos de Tasks 3-4.

- [ ] **Step 1: Test que falla**

`tests/test_remisiones_repository.py`:
```python
from decimal import Decimal
import pytest
from app import models
from app.domains.remisiones import repository


@pytest.fixture()
def orden_con_detalle(db, usuario):
    u = usuario("ventas")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli); db.flush()
    orden = models.OrdenVenta(folio="V-26080001", cliente_id=cli.id,
                              vendedor_id=u.id, estatus=models.EstatusOrden.PENDIENTE,
                              moneda="MXN", total=0)
    db.add(orden); db.flush()
    det = models.DetalleOrden(orden_id=orden.id, descripcion_libre="Cable",
                              cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                              subtotal=Decimal("50"))
    db.add(det); db.commit()
    return orden, det


def _remision(db, orden, det, cantidad, estado):
    rem = models.Remision(orden_venta_id=orden.id, estado=estado)
    db.add(rem); db.flush()
    db.add(models.DetalleRemision(remision_id=rem.id, detalle_orden_id=det.id,
                                  descripcion="Cable", cantidad=Decimal(cantidad)))
    db.commit()
    return rem


def test_acumulado_solo_cuenta_emitidas_y_recibidas(db, orden_con_detalle):
    orden, det = orden_con_detalle
    _remision(db, orden, det, "3", models.EstadoRemision.EMITIDA)
    _remision(db, orden, det, "2", models.EstadoRemision.RECIBIDA)
    _remision(db, orden, det, "4", models.EstadoRemision.BORRADOR)   # no cuenta
    _remision(db, orden, det, "5", models.EstadoRemision.CANCELADA)  # no cuenta
    acum = repository.entregado_por_detalle(db, orden.id)
    assert acum[det.id] == Decimal("5")


def test_pendientes(db, orden_con_detalle):
    orden, det = orden_con_detalle
    _remision(db, orden, det, "3", models.EstadoRemision.EMITIDA)
    pend = repository.pendientes_por_detalle(db, orden)
    assert pend[det.id] == Decimal("7")
```
Nota: los nombres exactos de columnas de `OrdenVenta`/`DetalleOrden` están en `app/models/sales.py:13-143` (el FK de detalle a orden puede llamarse `orden_id` u `orden_venta_id` — verificar y ajustar el fixture, no el repositorio).

- [ ] **Step 2: Verificar FAIL** — `python3 -m pytest tests/test_remisiones_repository.py -v`

- [ ] **Step 3: Implementación**

`app/domains/remisiones/repository.py`:
```python
"""Queries puras del dominio remisiones. Sin reglas de negocio, sin HTTP."""
from decimal import Decimal
from typing import Optional

from sqlalchemy import desc, func
from sqlalchemy.orm import Session, aliased

from app import models

ESTADOS_QUE_ENTREGAN = (models.EstadoRemision.EMITIDA, models.EstadoRemision.RECIBIDA)


def entregado_por_detalle(db: Session, orden_venta_id: int) -> dict[int, Decimal]:
    rows = (
        db.query(
            models.DetalleRemision.detalle_orden_id,
            func.coalesce(func.sum(models.DetalleRemision.cantidad), 0),
        )
        .join(models.Remision, models.Remision.id == models.DetalleRemision.remision_id)
        .filter(
            models.Remision.orden_venta_id == orden_venta_id,
            models.Remision.estado.in_(ESTADOS_QUE_ENTREGAN),
            models.DetalleRemision.detalle_orden_id.isnot(None),
        )
        .group_by(models.DetalleRemision.detalle_orden_id)
        .all()
    )
    return {det_id: Decimal(str(total)) for det_id, total in rows}


def pendientes_por_detalle(db: Session, orden) -> dict[int, Decimal]:
    entregado = entregado_por_detalle(db, orden.id)
    return {
        d.id: Decimal(str(d.cantidad)) - entregado.get(d.id, Decimal("0"))
        for d in orden.detalles
    }


def listar(db: Session, *, q: Optional[str] = None, orden_venta_id: Optional[int] = None,
           estado: Optional[str] = None, desde=None, hasta=None,
           creado_por_id: Optional[int] = None, owner_id: Optional[int] = None,
           page: int = 1, page_size: int = 100):
    query = db.query(models.Remision)
    if orden_venta_id:
        query = query.filter(models.Remision.orden_venta_id == orden_venta_id)
    if estado:
        query = query.filter(models.Remision.estado == models.EstadoRemision(estado))
    if desde is not None:
        query = query.filter(models.Remision.fecha_remision >= desde)
    if hasta is not None:
        query = query.filter(models.Remision.fecha_remision <= hasta)
    if creado_por_id:
        query = query.filter(models.Remision.creado_por_id == creado_por_id)
    if owner_id is not None:
        query = query.filter(models.Remision.creado_por_id == owner_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        cli_directo = aliased(models.Cliente)
        cli_orden = aliased(models.Cliente)
        query = (
            query
            .outerjoin(cli_directo, models.Remision.cliente.of_type(cli_directo))
            .outerjoin(models.Remision.orden_venta)
            .outerjoin(cli_orden, models.OrdenVenta.cliente.of_type(cli_orden))
            .filter(
                models.Remision.folio.ilike(like)
                | cli_directo.nombre_empresa.ilike(like)
                | cli_orden.nombre_empresa.ilike(like)
            )
            .distinct()
        )
    total = query.count()
    rows = (query.order_by(desc(models.Remision.fecha_remision))
            .offset((page - 1) * page_size).limit(page_size).all())
    return total, rows
```

- [ ] **Step 4: Verificar PASS** — `python3 -m pytest tests/ -v`

- [ ] **Step 5: Commit**

```bash
git add app/domains/ tests/test_remisiones_repository.py
git commit -m "feat(remisiones): repository del dominio — acumulados de entrega y listado filtrado"
```

---

### Task 6: Service — borradores, emisión con pendientes/sobre-entrega/stock, recepción, cancelación, eliminación

**Files:**
- Create: `app/domains/remisiones/schemas.py`
- Create: `app/domains/remisiones/service.py`
- Create: `app/services/config_service.py`
- Test: `tests/test_remisiones_service.py`

**Interfaces:**
- Consumes: `folio_service.generar_folio` (Task 2), `repository` (Task 5), `stock_service.aplicar_movimiento(db, *, producto, tipo, cantidad, referencia_tipo, referencia_id, motivo, usuario)` (existente, `app/services/stock_service.py:25`), `permissions.can/require` (matriz ampliada en Task 7 — este task usa `can(user, "sobreentrega", "remision")`; hasta Task 7 el test lo cubre con rol ADMINISTRADOR que tiene wildcard).
- Produces (firma exacta, el router de Task 7 las consume):
  - `crear_borrador(db, payload: RemisionCreate, user) -> models.Remision`
  - `actualizar_borrador(db, remision_id: int, payload: RemisionUpdate, user) -> models.Remision`
  - `eliminar_borrador(db, remision_id: int, user) -> None`
  - `emitir(db, remision_id: int, user, locker=folio_service.pg_locker) -> models.Remision`
  - `registrar_recepcion(db, remision_id: int, recibido_por: str, user) -> models.Remision`
  - `cancelar(db, remision_id: int, motivo: str, user) -> models.Remision`
  - `crear_cotizacion_desde(db, remision_id: int, user) -> models.OrdenVenta`
  - Todas levantan `HTTPException` (404/400/403/409) con mensajes en español.
- `config_service.get(db, clave, default)` / `config_service.stock_evento_descuento(db) -> str` (`'venta'`|`'remision'`).

- [ ] **Step 1: Tests que fallan** (los casos núcleo del sprint)

`tests/test_remisiones_service.py`:
```python
from decimal import Decimal
import pytest
from fastapi import HTTPException
from app import models
from app.domains.remisiones import service, repository
from app.domains.remisiones.schemas import RemisionCreate, DetalleRemisionInput


def _noop_locker(db, key):
    pass


@pytest.fixture()
def orden(db, usuario):
    u = usuario("administrador")
    cli = models.Cliente(nombre_empresa="ACME")
    db.add(cli); db.flush()
    o = models.OrdenVenta(folio="V-26080001", cliente_id=cli.id, vendedor_id=u.id,
                          estatus=models.EstatusOrden.PENDIENTE, moneda="MXN", total=0)
    db.add(o); db.flush()
    d = models.DetalleOrden(orden_id=o.id, descripcion_libre="Cable",
                            cantidad=Decimal("10"), precio_unitario=Decimal("5"),
                            subtotal=Decimal("50"), unidad="MTS")
    db.add(d); db.commit()
    return o, d, u


def _borrador(db, o, d, u, cantidad="4"):
    payload = RemisionCreate(orden_venta_id=o.id, detalles=[
        DetalleRemisionInput(detalle_orden_id=d.id, descripcion="Cable",
                             cantidad=Decimal(cantidad))])
    return service.crear_borrador(db, payload, u)


def test_borrador_no_tiene_folio_y_emitir_lo_asigna(db, orden):
    o, d, u = orden
    rem = _borrador(db, o, d, u)
    assert rem.estado == models.EstadoRemision.BORRADOR and rem.folio is None
    rem = service.emitir(db, rem.id, u, locker=_noop_locker)
    assert rem.estado == models.EstadoRemision.EMITIDA
    assert rem.folio and rem.folio.startswith("R-")


def test_emitir_bloquea_sobre_entrega_sin_rol(db, orden, usuario):
    o, d, admin = orden
    vend = usuario("ventas", email="v@test.local")
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    r2 = _borrador(db, o, d, vend, "5")   # pendiente = 2, pide 5
    with pytest.raises(HTTPException) as exc:
        service.emitir(db, r2.id, vend, locker=_noop_locker)
    assert exc.value.status_code == 400
    assert "pendiente" in str(exc.value.detail).lower()


def test_emitir_sobre_entrega_con_admin_registra_autorizador(db, orden):
    o, d, admin = orden
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    r2 = _borrador(db, o, d, admin, "5")
    rem = service.emitir(db, r2.id, admin, locker=_noop_locker)
    assert rem.sobre_entrega_autorizada_por_id == admin.id


def test_cancelar_excluye_del_acumulado(db, orden):
    o, d, admin = orden
    r1 = _borrador(db, o, d, admin, "8")
    service.emitir(db, r1.id, admin, locker=_noop_locker)
    service.cancelar(db, r1.id, "error de captura", admin)
    assert repository.entregado_por_detalle(db, o.id) == {}


def test_emitida_no_editable_y_borrador_no_emitible_dos_veces(db, orden):
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    with pytest.raises(HTTPException) as exc:
        service.emitir(db, rem.id, admin, locker=_noop_locker)
    assert exc.value.status_code == 409


def test_crear_cotizacion_desde_remision(db, orden):
    o, d, admin = orden
    rem = _borrador(db, o, d, admin)
    service.emitir(db, rem.id, admin, locker=_noop_locker)
    cot = service.crear_cotizacion_desde(db, rem.id, admin)
    assert cot.estatus == models.EstatusOrden.COTIZACION
    assert cot.remision_origen_id == rem.id
    assert all((l.precio_unitario or 0) == 0 for l in cot.detalles)
    db.refresh(rem)
    assert rem.estado == models.EstadoRemision.EMITIDA  # la remisión no se tocó
```
Ajustar nombres de campos del fixture a `app/models/sales.py` real (`orden_id` vs `orden_venta_id` en `DetalleOrden`, campo folio de orden, etc.). `crear_cotizacion_desde` necesita `remision_origen_id` — se agrega en este task (ver Step 3).

- [ ] **Step 2: Verificar FAIL** — `python3 -m pytest tests/test_remisiones_service.py -v`

- [ ] **Step 3: Implementación**

`app/domains/remisiones/schemas.py` — mover aquí `RemisionCreate`/`DetalleRemisionInput` (copiando de `app/schemas/remisiones.py` con `cantidad: Decimal` y `unidad: Optional[str]`), más:
```python
class RemisionUpdate(BaseModel):
    transportista: Optional[str] = None
    observaciones: Optional[str] = None
    mostrar_precios: Optional[bool] = None
    moneda: Optional[str] = None
    detalles: Optional[List[DetalleRemisionInput]] = None  # None = no tocar líneas
```

`app/services/config_service.py`:
```python
"""Lectura tipada de PlatformConfig con defaults."""
from sqlalchemy.orm import Session
from app import models


def get(db: Session, clave: str, default: str | None = None) -> str | None:
    row = db.query(models.PlatformConfig).filter(models.PlatformConfig.clave == clave).first()
    return row.valor if row and row.valor is not None else default


def stock_evento_descuento(db: Session) -> str:
    v = (get(db, "stock_evento_descuento", "venta") or "venta").strip().lower()
    return v if v in ("venta", "remision") else "venta"


def empresa_nombre(db: Session) -> str:
    return get(db, "empresa_nombre", "DASIC Industrial")
```

`app/domains/remisiones/service.py` — puntos no negociables (el resto sigue el patrón del router viejo `app/routers/remisiones.py:161-244` para armar líneas/snapshot):
```python
def emitir(db, remision_id, user, locker=folio_service.pg_locker):
    rem = _get_or_404(db, remision_id)
    if rem.estado != models.EstadoRemision.BORRADOR:
        raise HTTPException(409, "Solo un borrador puede emitirse")
    if not rem.detalles:
        raise HTTPException(400, "La remisión no tiene líneas")
    if rem.orden_venta_id:
        # Lock ANTES de leer acumulados: serializa emisiones concurrentes de la misma orden.
        locker(db, f"remision-emitir:orden:{rem.orden_venta_id}")
        pend = repository.pendientes_por_detalle(db, rem.orden_venta)
        excesos = [
            {"detalle_orden_id": d.detalle_orden_id,
             "pendiente": str(pend.get(d.detalle_orden_id, Decimal("0"))),
             "solicitado": str(d.cantidad)}
            for d in rem.detalles
            if d.detalle_orden_id is not None
            and Decimal(str(d.cantidad)) > pend.get(d.detalle_orden_id, Decimal("0"))
        ]
        if excesos:
            if not can(user, "sobreentrega", "remision"):
                raise HTTPException(400, {
                    "mensaje": "Cantidad mayor al pendiente y sin permiso de sobre-entrega",
                    "excesos": excesos,
                })
            rem.sobre_entrega_autorizada_por_id = user.id
    rem.folio = folio_service.generar_folio(
        db, prefijo="R", modelo=models.Remision, campo=models.Remision.folio, locker=locker)
    rem.estado = models.EstadoRemision.EMITIDA
    rem.emitida_at = datetime.utcnow()
    rem.emitida_por_id = user.id
    if config_service.stock_evento_descuento(db) == "remision":
        _descontar_stock(db, rem, user)
        rem.stock_descontado = True
    db.commit()
    db.refresh(rem)
    return rem


def _descontar_stock(db, rem, user):
    for det in rem.detalles:
        base = det.detalle_orden if det.detalle_orden_id else None
        producto = base.producto if base is not None else None
        if producto is None or getattr(producto, "es_servicio", False):
            continue
        cantidad = Decimal(str(det.cantidad))
        if cantidad != cantidad.to_integral_value():
            raise HTTPException(400,
                f"La línea de {producto.sku} mueve inventario y su cantidad debe ser entera")
        stock_service.aplicar_movimiento(
            db, producto=producto, tipo=TipoMovimientoStock.SALIDA.value,
            cantidad=-int(cantidad), referencia_tipo="remision",
            referencia_id=rem.id, motivo=f"Salida por remisión {rem.folio}", usuario=user)


def cancelar(db, remision_id, motivo, user):
    require(user, "cancel", "remision")
    rem = _get_or_404(db, remision_id)
    if rem.estado not in (models.EstadoRemision.EMITIDA, models.EstadoRemision.RECIBIDA):
        raise HTTPException(409, "Solo una remisión emitida o recibida puede cancelarse")
    if not (motivo or "").strip():
        raise HTTPException(400, "El motivo de cancelación es obligatorio")
    if rem.stock_descontado:
        for det in rem.detalles:
            base = det.detalle_orden if det.detalle_orden_id else None
            producto = base.producto if base is not None else None
            if producto is None or getattr(producto, "es_servicio", False):
                continue
            stock_service.aplicar_movimiento(
                db, producto=producto, tipo=TipoMovimientoStock.ENTRADA.value,
                cantidad=int(Decimal(str(det.cantidad))), referencia_tipo="remision",
                referencia_id=rem.id, motivo=f"Reversa por cancelación de {rem.folio}", usuario=user)
    rem.estado = models.EstadoRemision.CANCELADA
    rem.cancelada_at = datetime.utcnow()
    rem.cancelada_por_id = user.id
    rem.motivo_cancelacion = motivo.strip()
    db.commit(); db.refresh(rem)
    return rem
```
`crear_borrador` valida los dos modos (exactamente uno de orden/cliente, orden no-cotización — como router viejo líneas 175-187) pero **sin folio y sin tope de cantidad** (el tope se valida al emitir, contra pendientes). `actualizar_borrador`/`eliminar_borrador`: 409 si `estado != BORRADOR`; si `payload.detalles is not None`, reemplaza las líneas completas (delete-orphan + insert). `registrar_recepcion`: 409 si `estado != EMITIDA`; setea `recibido_por/at` y `estado = RECIBIDA`. `crear_cotizacion_desde`: valida estado EMITIDA/RECIBIDA, crea `OrdenVenta(estatus=COTIZACION, cliente_id=..., vendedor_id=user.id, moneda=rem.moneda or 'MXN', total=0, remision_origen_id=rem.id)` + un `DetalleOrden` por línea con `precio_unitario=0, subtotal=0, cantidad, unidad, descripcion_libre, sku_libre`; genera folio de cotización reutilizando `folio_service` con `prefijo="C"`, `modelo=models.OrdenVenta`, `campo=models.OrdenVenta.folio`, `padding=3`.

**`remision_origen_id`**: agregar a `OrdenVenta` (`app/models/sales.py`) `remision_origen_id = Column(Integer, ForeignKey("remisiones.id"), nullable=True, index=True)` + migración `20260803_03_remision_origen.py` (encadena de `20260803_02`, `op.add_column` + index + downgrade) + `_BACKFILL_DDL`:
```python
    "ALTER TABLE IF EXISTS ordenes_venta ADD COLUMN IF NOT EXISTS remision_origen_id INTEGER REFERENCES remisiones(id)",
    "CREATE INDEX IF NOT EXISTS ix_ordenes_venta_remision_origen_id ON ordenes_venta (remision_origen_id)",
```

- [ ] **Step 4: Verificar PASS** — `python3 -m pytest tests/ -v` (toda la suite)

- [ ] **Step 5: Commit**

```bash
git add app/domains/remisiones/ app/services/config_service.py app/models/sales.py migrations/versions/20260803_03_remision_origen.py app/db/seeds.py tests/test_remisiones_service.py
git commit -m "feat(remisiones): service del dominio — emisión con pendientes, sobre-entrega autorizada, stock híbrido, cancelación con reversa y conversión a cotización"
```

---

### Task 7: Permisos + router v2 + montaje

**Files:**
- Modify: `app/security/permissions.py` (matriz + `CAPABILITY_FLAGS`)
- Create: `app/domains/remisiones/router.py`
- Modify: `app/main.py:114` (montar router nuevo, quitar el viejo)
- Delete: `app/routers/remisiones.py` (después de portar `/orden/{id}/borrador` y los endpoints de documentos a los nuevos módulos; documentos se portan en Task 8 — hasta entonces `documents.py` no existe, así que este task porta `word`/`imprimir` provisionalmente al router nuevo llamando `word_service`/plantilla existentes)
- Test: `tests/test_remisiones_api.py`

**Interfaces:**
- Consumes: `service` (Task 6), `repository.listar` (Task 5).
- Produces (contrato HTTP, el frontend de Tasks 9-11 lo consume):
  - `GET /api/remisiones/` — filtros `q, orden_venta_id, estado, desde, hasta, creado_por_id, page, page_size`; items incluyen `estado`.
  - `POST /api/remisiones/` → borrador `{id, estado:"borrador"}` (sin folio)
  - `PUT /api/remisiones/{id}` (borrador), `DELETE /api/remisiones/{id}` (borrador)
  - `POST /api/remisiones/{id}/emitir` → `{id, folio, estado}`
  - `PATCH /api/remisiones/{id}/recepcion` (body `{recibido_por}`)
  - `POST /api/remisiones/{id}/cancelar` (body `{motivo}`)
  - `POST /api/remisiones/{id}/crear-cotizacion` → `{orden_venta_id, folio}`
  - `GET /api/remisiones/orden/{orden_id}/borrador` — draft con `cantidad_pendiente` real por línea
  - `GET /api/ventas/{id}/avance-entrega` → `{partidas: [{detalle_orden_id, cotizado, entregado, pendiente, estado}], remisiones: [{id, folio, fecha, estado}]}` (en `app/routers/ventas.py`)

- [ ] **Step 1: Matriz de permisos**

En `PERMISSIONS` (`app/security/permissions.py:48`):
```python
    # GERENTE_COMERCIAL — agregar:
    ("read", "remision"), ("create", "remision"), ("write", "remision"),
    ("emitir", "remision"), ("cancel", "remision"), ("sobreentrega", "remision"),
    ("convertir", "remision"),
    # VENTAS — agregar:
    ("read:own", "remision"), ("create", "remision"), ("write:own", "remision"),
    ("emitir:own", "remision"), ("convertir:own", "remision"),
    # OPERATIVO — agregar:
    ("read", "remision"), ("recibir", "remision"),
```
En `CAPABILITY_FLAGS`:
```python
    "ver_remisiones": ("read", "remision"),
    "crear_remision": ("create", "remision"),
    "emitir_remision": ("emitir", "remision"),
    "recibir_remision": ("recibir", "remision"),
    "cancelar_remision": ("cancel", "remision"),
    "sobre_entrega_remision": ("sobreentrega", "remision"),
    "remision_a_cotizacion": ("convertir", "remision"),
```
Y `"remisiones"` en `MODULOS_VISIBLES_BY_ROL` para ADMINISTRADOR, SUPERADMIN, GERENTE_COMERCIAL, VENTAS y OPERATIVO.

- [ ] **Step 2: Tests API que fallan**

`tests/test_remisiones_api.py` — usar `fastapi.testclient.TestClient` con `app.dependency_overrides` para `get_db` y `get_current_user` (patrón: override devuelve el `db`/usuario del fixture). Casos mínimos:
```python
def test_operativo_no_puede_crear_remision(client_as):     # 403
def test_ventas_solo_ve_sus_remisiones(client_as):         # owner scoping en GET /
def test_flujo_completo_por_api(client_as):
    # admin: POST / (borrador) -> POST /{id}/emitir -> PATCH recepcion -> historia en GET /?estado=recibida
def test_operativo_si_puede_recibir(client_as):            # 200
```
Fixture `client_as(rol)` en conftest: crea el `TestClient(app)` con overrides; verificar cómo `get_current_user` se importa en routers (`app/security`) para el override.

- [ ] **Step 3: Router**

`app/domains/remisiones/router.py` — delgado, todo `require()`/scoping antes de delegar:
```python
router = APIRouter(prefix="/api/remisiones", tags=["Remisiones"])

@router.get("/")
def listar(..., current_user=Depends(get_current_user), db=Depends(get_db)):
    require(current_user, "read", "remision")
    owner_id = current_user.id if is_owner_scoped(current_user, "read", "remision") else None
    total, rows = repository.listar(db, ..., owner_id=owner_id)
    ...items con "estado": r.estado.value...

@router.post("/{id}/emitir")
def emitir(id: int, ...):
    require(current_user, "emitir", "remision")
    _check_owner(db, id, current_user, "emitir")  # 403 si :own y no es suyo
    return _out(service.emitir(db, id, current_user))
```
El draft `/orden/{orden_id}/borrador` copia la lógica del viejo (`app/routers/remisiones.py:54-86`) agregando por línea `entregado` y `cantidad_pendiente` desde `repository.pendientes_por_detalle`, y `unidad` (snapshot de `DetalleOrden.unidad` o `producto.unidad`). `avance-entrega` va en `app/routers/ventas.py` (nuevo endpoint GET) usando el mismo repository; estado por partida: `NO_ENTREGADA` si entregado==0, `ENTREGADA` si pendiente<=0, si no `PARCIAL`.

En `app/main.py`: `from app.domains.remisiones.router import router as remisiones_router` reemplazando el import viejo; borrar `app/routers/remisiones.py` una vez portado word/imprimir.

- [ ] **Step 4: Verificar PASS** — `python3 -m pytest tests/ -v`

- [ ] **Step 5: Commit**

```bash
git add app/security/permissions.py app/domains/remisiones/router.py app/main.py app/routers/ tests/
git commit -m "feat(remisiones): router v2 con permisos por rol y owner-scoping; recurso remision en la matriz"
```

---

### Task 8: documents.py — plantillas en archivos, branding, marca de agua

**Files:**
- Create: `app/domains/remisiones/templates/remision.html.j2` (partir de `PDF_TEMPLATE_REMISION`, `app/routers/remisiones.py:341-398`)
- Create: `app/domains/remisiones/documents.py`
- Modify: `app/services/word_service.py:141+` (`build_remision_docx`: unidad real + branding por parámetro)
- Test: `tests/test_remisiones_documents.py`

**Interfaces:**
- Consumes: `config_service.empresa_nombre(db)` (Task 6).
- Produces: `render_html(db, rem) -> str`; `render_word(db, rem) -> bytes`. El router (Task 7) los monta en `GET /{id}/imprimir` y `GET /{id}/word`.

- [ ] **Step 1: Tests que fallan**

```python
def test_html_usa_unidad_real_y_branding(db, ...):
    # remisión con det.unidad="MTS", PlatformConfig empresa_nombre="Atlas Test"
    html = documents.render_html(db, rem)
    assert "MTS" in html and "Atlas Test" in html and "DASIC Industrial" not in html


def test_borrador_lleva_marca_de_agua(db, ...):
    # rem.estado == BORRADOR
    html = documents.render_html(db, rem)
    assert "BORRADOR" in html
```

- [ ] **Step 2: FAIL** — `python3 -m pytest tests/test_remisiones_documents.py -v`

- [ ] **Step 3: Implementación**

`documents.py` usa `Environment(loader=FileSystemLoader(Path(__file__).parent / "templates"))`. Cambios al template al portarlo: `{{ empresa_nombre }}` en vez de `DASIC Industrial`; `{{ d.unidad or d.clave_unidad_sat or 'PZA' }}` en la celda de cantidad; folio `{{ rem.folio or 'SIN FOLIO' }}`; y si `rem.estado.value == 'borrador'` un overlay:
```html
{% if es_borrador %}<div style="position:fixed;top:40%;left:15%;font-size:80px;color:rgba(200,0,0,.15);transform:rotate(-30deg);font-weight:800">BORRADOR</div>{% endif %}
```
Los espacios de firma "Entregó/Recibió" ya existen en el template — conservarlos. `render_word` pasa `empresa_nombre` a `build_remision_docx` (agregar parámetro con default actual para no romper llamadas existentes) y la unidad real por línea.

- [ ] **Step 4: PASS + commit**

```bash
git add app/domains/remisiones/ app/services/word_service.py tests/test_remisiones_documents.py
git commit -m "feat(remisiones): documentos desde plantillas en archivos — branding configurable, unidad real y marca de agua en borrador"
```

---

### Task 9: Frontend — types/store/hooks para el ciclo v2

**Files:**
- Modify: `web/src/features/remisiones/types.ts`
- Modify: `web/src/features/remisiones/store.ts`
- Modify: `web/src/features/remisiones/hooks/useRemisiones.ts`

**Interfaces:**
- Consumes: contrato HTTP de Task 7.
- Produces: `RemisionEstado = 'borrador'|'emitida'|'recibida'|'cancelada'`; acciones de store `crearBorrador`, `actualizarBorrador`, `emitir`, `eliminarBorrador`, `cancelar`, `registrarRecepcion`, `crearCotizacionDesde`; tipos de línea con `unidad`, `entregado`, `cantidad_pendiente` (number). Tasks 10-11 los consumen.

- [ ] **Step 1: Actualizar tipos** — agregar `estado: RemisionEstado` a `RemisionListItem`/`RemisionDetalle`; `unidad?: string`, `entregado?: number`, `cantidad_pendiente?: number` a las líneas del draft; cantidades `number` con decimales.
- [ ] **Step 2: Store/hooks** — cada acción llama el endpoint correspondiente y refresca; errores de mutación SIEMPRE visibles (patrón post-"refetch silencioso" del repo: capturar y setear `error` en el store, no tragar).
- [ ] **Step 3: Gate** — `cd web && npx tsc --noEmit` limpio.
- [ ] **Step 4: Commit** — `git commit -m "feat(remisiones-ui): tipos, store y hooks del ciclo v2 (estados, borradores, acumulados)"`

---

### Task 10: Frontend — editor de borrador con partidas/acumulados/unidades

**Files:**
- Modify: `web/src/features/remisiones/pages/CrearRemisionPage.tsx`
- Modify: `web/src/features/remisiones/lib/vm.ts`
- Modify: `web/src/components/document/DocumentCartTable.tsx` y `DocumentRow.tsx` (solo si hace falta: columnas entregado/pendiente son opt-in por capabilities, patrón `showCosto`)

**Interfaces:**
- Consumes: draft endpoint con `entregado`/`cantidad_pendiente`; catálogo `GET /api/catalogos/unidades`.
- Produces: editor que guarda borrador (`POST /`), edita (`PUT /{id}`) y emite (`POST /{id}/emitir`) con confirmación.

- [ ] **Step 1: Tabla de selección** — al cargar desde orden: checkbox por partida + "Seleccionar todas"/"Limpiar"; columnas Cotizado / Entregado / Pendiente / A entregar; input de cantidad `type=number step=0.001 min=0.001` topado visualmente al pendiente; si excede, badge ámbar "sobre-entrega — requiere autorización" (el backend decide; la UI solo avisa). Selector de unidad por línea (dropdown de unidades activas, default el snapshot de la línea).
- [ ] **Step 2: Flujo borrador→emitir** — botón "Guardar borrador" y botón "Emitir" (confirm dialog: "Se asignará folio y la remisión quedará inmutable"). Errores 400 de emisión se muestran con el detalle de excesos por partida.
- [ ] **Step 3: Gate** — `npx tsc --noEmit && npm run build`.
- [ ] **Step 4: Commit** — `git commit -m "feat(remisiones-ui): editor de borrador — selección de partidas, acumulados, unidades y emisión con confirmación"`

---

### Task 11: Frontend — lista, detalle, navegación y avance de entrega

**Files:**
- Modify: `web/src/features/remisiones/pages/RemisionesPage.tsx` (badges de estado + filtros estado/fechas/creador)
- Modify: detalle de remisión (mismo archivo o componente hijo): acciones por estado (editar/eliminar borrador; emitir; recibir; cancelar con motivo; crear cotización → navega al cotizador; imprimir/Word)
- Modify: `web/src/features/borradores/` o la vista de detalle de venta en `web/src/features/cotizador/`: sección "Avance de entrega" consumiendo `GET /api/ventas/{id}/avance-entrega` (por partida: No entregada/Parcial/Entregada + lista de remisiones con folio/fecha/estado + botón "Nueva remisión" que navega al editor precargado)
- Modify: `web/src/components/layout/Sidebar.tsx:38` (entrada "Nueva remisión" o acceso directo visible; `/spa/remisiones-nueva` deja de ser huérfana)

- [ ] **Step 1: Lista + detalle con acciones por estado.** Badge de color por estado (borrador=gris, emitida=azul, recibida=verde, cancelada=rojo, tokens del design system del repo).
- [ ] **Step 2: Avance de entrega en la venta + navegación bidireccional.**
- [ ] **Step 3: Gate completo** — `npx tsc --noEmit && npm run build` y prueba manual del flujo en dev (`npm run dev` contra backend local si hay stack Python; si no, revisión visual de tipos/routes).
- [ ] **Step 4: Commit** — `git commit -m "feat(remisiones-ui): lista con estados y filtros, detalle con acciones por ciclo, avance de entrega en la venta"`

---

### Task 12: Cierre — suite completa, dist, QA guion

- [ ] **Step 1: Suite completa** — `python3 -m pytest tests/ -v` → todo PASS. `python3 -m compileall app/` limpio.
- [ ] **Step 2: Dist** — `cd web && npm run build` y commitear `dist/` (`chore(build): regenerar dist (remisiones v2)`).
- [ ] **Step 3: Guion QA (Task Pack 6 de la spec Scrum)** — documentar en `docs/superpowers/2026-08-03-remisiones-v2-qa.md` los 12 casos con pasos y resultado esperado, para la validación con Axel: (1) remisión manual 1 partida, (2) manual varias, (3) desde cotización completa, (4) partidas seleccionadas, (5) entrega parcial, (6) segunda parcial, (7) intento de exceder pendiente sin rol → bloqueado, (8) PDF/Word con unidades, (9) historial filtrado, (10) remisión→cotización, (11) permisos por rol (VENTAS no ve ajenas, OPERATIVO solo recibe), (12) dos usuarios emitiendo a la vez sobre la misma orden (solo en Postgres real).
- [ ] **Step 4: Commit final y resumen** — estado de la rama listo para revisión final + PR.

---

## Self-Review (ejecutada al escribir el plan)

- **Cobertura del spec**: estados+borradores (T3/T6/T7), folio al emitir (T2/T6), Numeric+unidades (T4), acumulados/sobre-entrega (T5/T6), stock híbrido+config (T6), permisos (T7), remisión→cotización (T6/T7), documentos/branding/marca de agua (T8), frontend completo (T9-T11), pytest primera suite (T1), avance de entrega (T7/T11), triple vía (T3/T4/T6). Fuera de alcance del spec §9 respetado.
- **Riesgo señalado**: la máquina puede no tener pip/pytest — T1 Step 1 es un gate duro con instrucción de detenerse y reportar.
- **Consistencia de firmas**: `generar_folio(db, *, prefijo, modelo, campo, padding, ahora, locker)` usada igual en T2/T6; `pendientes_por_detalle(db, orden)` igual en T5/T6/T7; permisos `("sobreentrega","remision")` igual en T6/T7.
