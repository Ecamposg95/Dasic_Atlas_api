"""Login, con y sin "recordar sesión".

Bug encontrado el 2026-08-06 por un linter, no por una prueba: ruff marcó
`remember_session_days` como variable local asignada y nunca usada en
`app/core/config.py`. Tirar del hilo llevó a algo peor que una variable
muerta — el campo **no existía en el dataclass `Settings`**, así que la línea
de `auth.py` que lo lee lanzaba `AttributeError`.

Efecto real: un usuario con credenciales **correctas** que marcara la casilla
"recordar sesión" recibía un 500 y no podía entrar. Las credenciales se
validan antes, así que con contraseña mala salía un 401 normal y el fallo
quedaba escondido detrás de la casilla.

Nadie lo había cubierto porque las pruebas de login que existían no marcaban
la casilla. De ahí que estas prueben **las dos ramas**.
"""
import pytest
from starlette.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models.enums import RolUsuario
from app.services import UserService


CONTRASENA = "Contrasena#123"


@pytest.fixture()
def cliente_http(db):
    """TestClient sin override de usuario: se autentica de verdad."""
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def usuario_real(db):
    from app import models

    u = models.Usuario(
        nombre="Vendedor",
        email="vendedor@dasic.test",
        password_hash=UserService.get_password_hash(CONTRASENA),
        rol=RolUsuario.VENTAS,
        activo=True,
    )
    db.add(u)
    db.commit()
    return u


def _login(client, *, remember=None, password=CONTRASENA):
    datos = {"username": "vendedor@dasic.test", "password": password}
    if remember is not None:
        datos["remember"] = str(remember).lower()
    return client.post("/api/auth/login", data=datos)


def test_login_sin_recordar_sesion(cliente_http, usuario_real):
    r = _login(cliente_http)
    assert r.status_code == 200, r.text
    assert r.json().get("access_token")


def test_login_con_recordar_sesion_no_revienta(cliente_http, usuario_real):
    """El caso que devolvía 500. Es la única diferencia con el de arriba."""
    r = _login(cliente_http, remember=True)
    assert r.status_code == 200, f"el login con 'recordar sesión' falló: {r.text}"
    assert r.json().get("access_token")


def test_recordar_sesion_deja_cookie_persistente(cliente_http, usuario_real):
    """Con la casilla marcada la cookie lleva `Max-Age` (sobrevive al cierre del
    navegador); sin ella es cookie de sesión y el navegador la borra al salir.
    Esa diferencia es el propósito entero de la casilla."""
    con = _login(cliente_http, remember=True).headers.get("set-cookie", "")
    assert "max-age" in con.lower(), f"cookie sin Max-Age: {con}"

    cliente_http.cookies.clear()
    sin = _login(cliente_http, remember=False).headers.get("set-cookie", "")
    assert "max-age" not in sin.lower(), f"cookie de sesión con Max-Age: {sin}"


def test_credenciales_malas_dan_401_no_500(cliente_http, usuario_real):
    """Incluso marcando la casilla: el 401 ocurre antes, y por eso el bug
    quedaba escondido — con contraseña mala nunca se llegaba a la línea rota."""
    r = _login(cliente_http, remember=True, password="incorrecta")
    assert r.status_code == 401


def test_la_duracion_de_la_sesion_es_configurable(monkeypatch):
    """`REMEMBER_SESSION_DAYS` se leía del entorno y se descartaba. Ahora llega
    a `Settings`, que es lo que hace que la variable sirva de algo."""
    import app.core.config as config

    config.get_settings.cache_clear()
    monkeypatch.setenv("REMEMBER_SESSION_DAYS", "3")
    try:
        assert config.get_settings().remember_session_days == 3
    finally:
        config.get_settings.cache_clear()
