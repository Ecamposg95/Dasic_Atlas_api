import os
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configurar variables de entorno ANTES de importar app (que carga config)
# DATABASE_URL es una URL Postgres dummy (engine lazy, nunca se conecta en tests)
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_dummy")
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum!")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "25")

from app.db import Base
from app import models
from app.models.enums import RolUsuario


@pytest.fixture()
def db():
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
    @event.listens_for(engine, "connect")
    def _shim_pg_advisory_lock(dbapi_conn, _record):
        dbapi_conn.create_function("hashtext", 1, lambda s: hash(s) % (2**31))
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda k: None)

    Base.metadata.create_all(bind=engine)
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
