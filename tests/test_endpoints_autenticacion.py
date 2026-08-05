"""Ningún endpoint responde datos sin credenciales, salvo login y logout.

Contexto (2026-08-05): seis endpoints se habían quedado sin dependencia de
autenticación —ni en el decorador, ni en el router, ni al montarlo— y se
verificó contra producción que cuatro de ellos devolvían **200 sin
credenciales**, incluido el imprimible de OC con costos, y que
`POST /api/compras/proveedores` era una **escritura abierta**.

No fue un fallo de diseño sino de omisión: el resto del módulo sí exigía rol.
Por eso el guardián no es una prueba por endpoint —que habría que recordar
escribir— sino el barrido de abajo, que recorre **todas** las rutas montadas
y falla sola en cuanto aparezca una nueva sin protección.
"""
import pytest
from starlette.testclient import TestClient

from app.db import get_db
from app.main import app

# Únicas rutas que deben responder sin sesión. Cualquier otra que aparezca aquí
# es un hallazgo, no una excepción que agregar a la lista a la ligera.
PUBLICAS = {("POST", "/api/auth/login"), ("POST", "/api/auth/logout")}

# Rutas que sirven la SPA o archivos: no son API y no llevan sesión.
PREFIJOS_NO_API = ("/static", "/spa", "/docs", "/redoc", "/openapi.json")


def _rutas_api():
    """(método, path) de cada ruta de API montada, con su path parametrizado.

    Hay que **recorrer en profundidad**: esta versión de FastAPI no aplana las
    rutas de un `include_router` dentro de `app.routes`, sino que las envuelve
    en objetos `fastapi.routing._IncludedRouter`, que exponen el router real en
    `original_router` (no en `routes`). Iterar solo el primer nivel devuelve 28
    rutas y **ninguna** de `/api/` — un barrido que pasa siempre porque no mira
    nada. Por eso existe `test_el_barrido_ve_rutas_de_verdad`.
    """
    vistas = []

    def caminar(rutas):
        for r in rutas:
            incluido = getattr(r, "original_router", None)
            hijas = getattr(incluido, "routes", None) or getattr(r, "routes", None)
            if hijas:
                caminar(hijas)
                continue
            path = getattr(r, "path", "")
            metodos = getattr(r, "methods", set()) or set()
            if not path.startswith("/api/") or path.startswith(PREFIJOS_NO_API):
                continue
            for m in sorted(metodos - {"HEAD", "OPTIONS"}):
                vistas.append((m, path))

    caminar(app.routes)
    return sorted(set(vistas))


def test_el_barrido_ve_rutas_de_verdad():
    """Guarda del guardián: si `_rutas_api` deja de encontrar rutas —por un
    cambio de FastAPI en cómo anida los routers— el barrido de abajo pasaría
    vacío y en silencio. Este test lo convierte en un fallo ruidoso."""
    rutas = _rutas_api()
    assert len(rutas) > 150, f"el barrido solo ve {len(rutas)} rutas de API; algo cambió en el montaje"


def _concretar(path: str) -> str:
    """Sustituye los parámetros por un 1: basta para llegar al guard de auth,
    que corre ANTES de que el handler busque la fila."""
    import re

    return re.sub(r"\{[^}]+\}", "1", path)


@pytest.fixture()
def anonimo(db):
    """TestClient SIN override de `get_current_user`: pega como un extraño.

    Solo se overridea `get_db` para no tocar una base real. Es la diferencia
    con el fixture `client_as`, que inyecta un usuario y por eso nunca habría
    detectado esto.
    """
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_ninguna_ruta_de_api_responde_sin_credenciales(anonimo):
    expuestas = []
    for metodo, path in _rutas_api():
        if (metodo, path) in PUBLICAS:
            continue
        r = anonimo.request(metodo, _concretar(path))
        # 401/403 es lo correcto. 404/405/422 también son aceptables: significan
        # que la ruta no resolvió o el payload no era válido, nunca que se
        # entregaron datos. Lo que no puede pasar es un 2xx.
        if r.status_code < 400:
            expuestas.append(f"{metodo} {path} → {r.status_code}")

    assert not expuestas, "rutas que responden sin autenticación:\n  " + "\n  ".join(expuestas)


@pytest.mark.parametrize(
    "metodo,path",
    [
        ("GET", "/api/compras/proveedores"),
        ("POST", "/api/compras/proveedores"),
        ("GET", "/api/compras/"),
        ("GET", "/api/compras/historial"),
        ("GET", "/api/compras/1/imprimir"),
        ("GET", "/api/clientes/1/pdf-estado-cuenta"),
    ],
)
def test_los_seis_endpoints_de_la_fuga_exigen_sesion(anonimo, metodo, path):
    """Caso concreto de la regresión, además del barrido general: si alguien
    quita una de estas dependencias, el mensaje del fallo dice cuál."""
    r = anonimo.request(metodo, path)
    assert r.status_code >= 400, f"{metodo} {path} respondió {r.status_code} sin sesión"
