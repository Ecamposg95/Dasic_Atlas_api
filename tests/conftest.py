"""Conftest en modo dual: PostgreSQL real o SQLite en memoria.

- Con `TEST_DATABASE_URL` exportada: se usa ESA base PostgreSQL, se aplica
  `alembic upgrade head` una vez por sesión y NO se registran los shims de
  `pg_advisory_xact_lock`/`hashtext` (en Postgres son funciones reales). Es el
  modo de CI: locks reales, migraciones ejecutadas y estrictez de Postgres.
- Sin `TEST_DATABASE_URL`: comportamiento histórico intacto (SQLite en memoria
  + shims + `create_all`), para que el desarrollo local sin base de datos siga
  funcionando.

Los tests que solo tienen sentido contra Postgres se marcan con
`@pytest.mark.postgres` y se omiten automáticamente en modo SQLite.
"""
import os
import warnings

import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError, SAWarning
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Selección de modo — ANTES de importar app (que cachea Settings vía lru_cache)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
POSTGRES_MODE = bool(TEST_DATABASE_URL)

if POSTGRES_MODE:
    # `app.core.config.get_settings()` (y `migrations/env.py`, que lo reusa)
    # leen DATABASE_URL. Apuntarlo a la base de pruebas hace que el engine de
    # `app.db.session` y Alembic hablen con la MISMA base efímera; cualquier
    # `SessionLocal()` suelto en el código de producción (p. ej.
    # `ventas.py`) cae también ahí en vez de reventar.
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
else:
    # DATABASE_URL es una URL Postgres dummy (engine lazy, nunca se conecta)
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_dummy")
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum!")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "25")

from app.db import Base
from app import models
from app.models.enums import RolUsuario


# ---------------------------------------------------------------------------
# Marcador `postgres`
# ---------------------------------------------------------------------------
def pytest_collection_modifyitems(config, items):
    """Omite los tests `@pytest.mark.postgres` cuando no hay Postgres."""
    if POSTGRES_MODE:
        return
    skip = pytest.mark.skip(
        reason=(
            "requiere PostgreSQL real (advisory locks, DDL de migraciones, "
            "estrictez SQL). Exporta TEST_DATABASE_URL — ver "
            "docs/development/testing.md"
        )
    )
    for item in items:
        if "postgres" in item.keywords:
            item.add_marker(skip)


def pytest_report_header(config):
    if POSTGRES_MODE:
        url = make_url(TEST_DATABASE_URL)
        return f"db: PostgreSQL ({url.host or 'socket local'}/{url.database}) — sin shims pg"
    return "db: SQLite en memoria — create_all + shims pg (tests `postgres` omitidos)"


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    if POSTGRES_MODE and _ESQUEMA_INFO:
        terminalreporter.write_line(f"esquema de pruebas: {_ESQUEMA_INFO}")


# ---------------------------------------------------------------------------
# Modo PostgreSQL
# ---------------------------------------------------------------------------
def _assert_base_de_pruebas(url) -> None:
    """Freno de mano: esta suite hace DROP SCHEMA y TRUNCATE."""
    if os.environ.get("TEST_DATABASE_ALLOW_ANY", "").strip().lower() in {"1", "true", "yes"}:
        return
    nombre = (url.database or "").lower()
    if "test" not in nombre:
        raise RuntimeError(
            f"TEST_DATABASE_URL apunta a la base '{url.database}', que no parece de "
            "pruebas (la suite borra el esquema y trunca todas las tablas). Usa una "
            "base dedicada con 'test' en el nombre, o exporta "
            "TEST_DATABASE_ALLOW_ANY=1 si sabes lo que haces."
        )


def _reset_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))


def _alembic_config():
    from alembic.config import Config

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(raiz, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(raiz, "migrations"))
    # `migrations/env.py` toma la URL de `get_settings()`, que ya apunta a
    # TEST_DATABASE_URL (ver arriba). No la fijamos aquí para no divergir.
    return cfg


def _revision_aplicada(engine) -> str | None:
    with engine.connect() as conn:
        existe = conn.execute(
            text("SELECT to_regclass('public.alembic_version')")
        ).scalar()
        if not existe:
            return None
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


# Se llena en `_bootstrap_schema` para que `pytest_report_header` diga qué pasó.
_ESQUEMA_INFO = ""


def _bootstrap_schema(engine) -> None:
    """Deja el esquema listo para la suite, preferentemente vía Alembic.

    Camino feliz: `alembic upgrade head` sobre un esquema vacío. Verifica que
    la cadena de migraciones produce una base utilizable — una de las tres
    brechas del modo SQLite.

    Realidad de este repo (agosto 2026): la cadena NO es autocontenida. La
    primera revisión (`20260428_01`) hace `ALTER TABLE productos ...` sobre
    tablas que nunca crea, porque Alembic se adoptó después de que producción
    ya existía (el arranque real usa `create_all` + `_BACKFILL_DDL`; ver
    `app/core/lifespan.py`). Falta una revisión base.

    Por eso, si la cadena falla SIN haber aplicado una sola revisión, se cae al
    bootstrap de producción (`create_all` + `run_backfill_ddl` + `stamp head`) y
    se anuncia en la cabecera del reporte. Si falla a media cadena (ya hay una
    revisión aplicada) NO hay red: la migración nueva está rota y CI debe
    ponerse en rojo. Cuando alguien escriba la revisión base, este camino
    desaparece solo.
    """
    global _ESQUEMA_INFO
    from alembic import command

    cfg = _alembic_config()
    try:
        command.upgrade(cfg, "head")
        _ESQUEMA_INFO = "alembic upgrade head"
        return
    except Exception as exc:  # noqa: BLE001 — se re-lanza si ya había revisiones
        if _revision_aplicada(engine) is not None:
            raise
        motivo = f"{type(exc).__name__}: {exc}".splitlines()[0][:200]

    # Fallback: mismo bootstrap que producción.
    from app.db.seeds import run_backfill_ddl

    _reset_schema(engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        run_backfill_ddl(s)
        s.commit()
    finally:
        s.close()
    command.stamp(cfg, "head")
    _ESQUEMA_INFO = (
        "create_all + _BACKFILL_DDL + alembic stamp head "
        f"(la cadena de migraciones no arranca desde vacío — {motivo})"
    )


@pytest.fixture(scope="session")
def pg_engine():
    """Engine de sesión contra la base de pruebas, con el esquema listo."""
    if not POSTGRES_MODE:
        pytest.skip("sin TEST_DATABASE_URL")

    from app.core.config import normalize_database_url

    url = make_url(normalize_database_url(TEST_DATABASE_URL))
    _assert_base_de_pruebas(url)

    engine = create_engine(url, future=True)
    if os.environ.get("TEST_DATABASE_RESET", "1").strip().lower() not in {"0", "false", "no"}:
        _reset_schema(engine)
        _bootstrap_schema(engine)
    with engine.begin() as conn:
        conn.execute(text(_FKS_DIFERIBLES))
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def _pg_tablas(pg_engine):
    """Tablas a vaciar, en orden hijo → padre (los nombres salen del catálogo
    de la propia base, nunca de entrada del usuario)."""
    reales = {
        t for t in inspect(pg_engine).get_table_names(schema="public")
        if t != "alembic_version"
    }
    # `sorted_tables` va padre → hijo; al revés se pueden borrar sin violar FK.
    # Avisa del ciclo ordenes_venta ↔ remisiones, que ya resolvemos difiriendo
    # las FKs en la transacción de limpieza — no hace falta gritarlo por test.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SAWarning)
        orden = [t.name for t in reversed(Base.metadata.sorted_tables) if t.name in reales]
    orden += [t for t in sorted(reales) if t not in set(orden)]
    return orden


_RESET_SEQUENCIAS = """
DO $$ DECLARE s record; BEGIN
  FOR s IN SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP EXECUTE format('ALTER SEQUENCE %I.%I RESTART', s.schemaname, s.sequencename); END LOOP;
END $$;
"""

# `ordenes_venta` y `remisiones` se referencian mutuamente (orden_venta_id ↔
# remision_origen_id): no existe un orden de DELETE que respete ambas FKs. Se
# vuelven diferibles (INITIALLY IMMEDIATE — el comportamiento dentro de los
# tests no cambia) para que SOLO la transacción de limpieza pueda posponer la
# verificación con `SET CONSTRAINTS ALL DEFERRED`. Se aplica únicamente sobre
# la base de pruebas.
_FKS_DIFERIBLES = """
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conrelid::regclass AS tabla, conname FROM pg_constraint
           WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND NOT condeferrable
  LOOP EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',
                      c.tabla, c.conname); END LOOP;
END $$;
"""


def _limpiar(engine, tablas) -> None:
    """Deja la base vacía y con los ids reiniciados (paridad con SQLite, donde
    cada test estrena base en memoria).

    `DELETE` de todas las tablas en una sola transacción cuesta ~6 ms; el
    `TRUNCATE` equivalente cuesta ~0.9 s (toma ACCESS EXCLUSIVE y trunca
    archivos aunque estén vacías, y CASCADE arrastra a todas las que
    referencian a `usuarios`/`clientes`). Con ~75 tests eso es un minuto de
    diferencia por corrida. El TRUNCATE queda como red por si algún día el
    DELETE choca con una FK que no se pudo diferir.
    """
    if not tablas:
        return
    borrado = "; ".join(f'DELETE FROM public."{t}"' for t in tablas)
    try:
        with engine.begin() as conn:
            conn.execute(text("SET CONSTRAINTS ALL DEFERRED"))
            conn.execute(text(borrado))
            conn.execute(text(_RESET_SEQUENCIAS))
    except IntegrityError:
        lista = ", ".join(f'public."{t}"' for t in tablas)
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE TABLE {lista} RESTART IDENTITY CASCADE"))


# ---------------------------------------------------------------------------
# Modo SQLite (comportamiento histórico)
# ---------------------------------------------------------------------------
def _sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # `folio_service.pg_locker` (default de `generar_folio`/`service.emitir`
    # et al. — ver app/services/folio_service.py) ejecuta SQL crudo Postgres-
    # only (`pg_advisory_xact_lock(hashtext(:k))`). Los tests que llaman al
    # `service` directo lo esquivan inyectando un locker no-op explícito
    # (ver test_remisiones_service.py), pero los tests que pegan por HTTP
    # contra el ROUTER real (client_as) usan el locker por defecto — no hay
    # (ni debe haber) un parámetro de locker en la API HTTP. En vez de eso,
    # shim-eamos las dos funciones Postgres como funciones SQLite no-op —
    # mismo SQL, mismo código de producción, sin tocar `service`/`router`.
    # En modo Postgres NO se registran: ahí las funciones son reales y es
    # justamente lo que queremos ejercitar.
    @event.listens_for(engine, "connect")
    def _shim_pg_advisory_lock(dbapi_conn, _record):
        dbapi_conn.create_function("hashtext", 1, lambda s: hash(s) % (2**31))
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda k: None)

    Base.metadata.create_all(bind=engine)
    return engine


# ---------------------------------------------------------------------------
# Fixture `db` — misma firma en ambos modos
# ---------------------------------------------------------------------------
if POSTGRES_MODE:

    @pytest.fixture()
    def db(pg_engine, _pg_tablas):
        """Sesión por test; aislamiento vaciando las tablas al terminar.

        Se vacía en vez de envolver el test en una transacción con rollback
        porque aquí los COMMIT tienen que ser reales:
        - `pg_advisory_xact_lock` se libera al terminar la transacción, así que
          una transacción-envoltorio contaminaría la vida del lock — justo lo
          que las pruebas de concurrencia deben medir.
        - Las pruebas de concurrencia abren OTRA conexión: con rollback (o con
          savepoints) los datos sembrados por el fixture serían invisibles para
          la segunda sesión.
        - El código de producción llama `SessionLocal()` por su cuenta en
          algunos flujos (`app/routers/ventas.py`): esas sesiones no comparten
          la conexión del fixture y solo ven lo comprometido.
        El `DELETE` de todas las tablas (ver `_limpiar`, que explica por qué no
        es `TRUNCATE`) cuesta milisegundos y deja la base como recién migrada.
        """
        Session = sessionmaker(bind=pg_engine)
        session = Session()
        try:
            yield session
        finally:
            session.close()
            _limpiar(pg_engine, _pg_tablas)

else:

    @pytest.fixture()
    def db():
        engine = _sqlite_engine()
        Session = sessionmaker(bind=engine)
        session = Session()
        yield session
        session.close()


@pytest.fixture()
def usuario(db):
    """Factory: usuario(rol='administrador') -> models.Usuario persistido.

    Coacciona rol con RolUsuario.from_input() para tolerancia case-insensitive
    sin modificar el modelo de producción (que usa Enum nativo en Postgres).
    """
    def _make(rol="administrador", email=None):
        u = models.Usuario(
            nombre=f"Test {rol}",
            email=email or f"{rol}@test.local",
            password_hash="x",
            rol=RolUsuario.from_input(rol),
            activo=True,
        )
        db.add(u)
        db.commit()
        return u
    return _make


@pytest.fixture()
def client_as(db, usuario):
    """Factory: client_as(rol, email=None) -> _ClienteComo con .user y los
    verbos HTTP (get/post/put/patch/delete) contra `app.main.app` real vía
    TestClient.

    `app.security.get_current_user` es el símbolo que TODOS los routers
    importan (`from app.security import get_current_user` — mismo objeto
    función que `app.security.jwt.get_current_user`, re-exportado sin
    envoltura), así que overridearlo ahí cubre cualquier router.

    `app.dependency_overrides` es un dict GLOBAL en el objeto `app` — si dos
    `client_as(...)` distintos coexisten en el mismo test (para probar
    owner-scoping entre dos usuarios), el override "gana" el que se fijó
    último, sin importar qué instancia lo disparó. Por eso cada verbo HTTP
    de `_ClienteComo` reactiva SU PROPIO usuario en el override justo antes
    de la request — permite intercalar llamadas de distintos `client_as`
    en el mismo test sin que se pisen.

    No usamos `with TestClient(app) as client:` (dispararía el lifespan de
    `app.main`, que corre `Base.metadata.create_all(bind=engine)` contra el
    engine real — Postgres dummy nunca alcanzable en tests). Sin el context
    manager, `TestClient` no dispara lifespan (verificado empíricamente
    contra starlette==1.3.1: `__enter__` es lo único que llama
    `wait_startup`); las requests van directo al ASGI app.
    """
    from starlette.testclient import TestClient
    from app.main import app
    from app.db import get_db as get_db_dep
    from app.security import get_current_user as get_current_user_dep

    real_client = TestClient(app)
    app.dependency_overrides[get_db_dep] = lambda: db

    class _ClienteComo:
        def __init__(self, user):
            self.user = user

        def _activar(self):
            app.dependency_overrides[get_current_user_dep] = lambda: self.user

        def get(self, *a, **kw):
            self._activar()
            return real_client.get(*a, **kw)

        def post(self, *a, **kw):
            self._activar()
            return real_client.post(*a, **kw)

        def put(self, *a, **kw):
            self._activar()
            return real_client.put(*a, **kw)

        def patch(self, *a, **kw):
            self._activar()
            return real_client.patch(*a, **kw)

        def delete(self, *a, **kw):
            self._activar()
            return real_client.delete(*a, **kw)

    def _make(rol="administrador", email=None):
        user = usuario(rol, email=email)
        return _ClienteComo(user)

    yield _make
    app.dependency_overrides.clear()
