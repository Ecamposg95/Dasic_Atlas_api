"""
DASIC ERP — Application entry point.
Bootstrap limpio: logging, lifespan, middlewares, routers y vistas SSR.
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Captured at module-import time ≈ process startup; used by /api/superadmin/health.
APP_STARTED_AT = datetime.now(timezone.utc)

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from jose import JWTError, jwt
from sqlalchemy import text

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.lifespan import lifespan
from app.db import SessionLocal, engine
from app import models
from app.services import UserService

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Tablas: create_all se ejecuta en lifespan (core/lifespan.py) no aquí.
# Aquí solo importamos engine para que el pool se configure.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="DASIC ERP",
    version="2.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Static & Templates
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ---------------------------------------------------------------------------
# Proxy headers (Railway/Render/etc) — para que url_for genere https://
# detrás del load balancer. Tomado de uvicorn (incluido por defecto).
# ---------------------------------------------------------------------------
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_raw = os.getenv("ALLOWED_ORIGINS", "")
origins = [o.strip() for o in _raw.split(",") if o.strip()]
if not origins:
    # NUNCA mezclar "*" con allow_credentials=True (riesgo de XSS/CSRF).
    # Si no hay orígenes configurados, listamos vacío y log warning.
    logger.warning(
        "ALLOWED_ORIGINS vacío. CORS bloquea TODOS los orígenes. "
        "Configura la variable de entorno con orígenes explícitos para producción."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers API
# ---------------------------------------------------------------------------
from app.routers import (  # noqa: E402
    admin, auth, catalogos, clientes, compras, contactos, crm, cuentas_por_cobrar, dashboard,
    fantasmas, fx, gastos, inventario, plantas, precios, productos, recordatorios, remisiones, reportes,
    reportes_servicio_docs, sat, servicios, superadmin, usuarios, ventas,
)

app.include_router(auth.router)
app.include_router(productos.router)
app.include_router(ventas.router)
app.include_router(clientes.router)
app.include_router(contactos.router)
app.include_router(compras.router)
app.include_router(usuarios.router)
app.include_router(gastos.router)
app.include_router(dashboard.router)
app.include_router(fx.router)
app.include_router(fantasmas.router)
app.include_router(inventario.router)
app.include_router(catalogos.router)
app.include_router(admin.router)
app.include_router(reportes.router)
app.include_router(sat.router)
app.include_router(servicios.router)
app.include_router(cuentas_por_cobrar.router)
app.include_router(precios.router)
app.include_router(remisiones.router)
app.include_router(reportes_servicio_docs.router)
app.include_router(superadmin.router)
app.include_router(crm.router)
app.include_router(recordatorios.router)
app.include_router(plantas.router)

# ---------------------------------------------------------------------------
# Helper: obtener current_user opcional desde cookie (para SSR)
# ---------------------------------------------------------------------------
def _get_user_from_cookie(request: Request) -> Optional[models.Usuario]:
    """Decodifica el JWT de la cookie HttpOnly sin lanzar excepción."""
    try:
        raw = request.cookies.get(settings.token_cookie_name, "")
        token = raw.replace("Bearer ", "", 1) if raw.startswith("Bearer ") else raw
        if not token:
            return None
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        email: str = payload.get("sub", "")
        if not email:
            return None
        db = SessionLocal()
        try:
            return UserService.get_user_by_email(db, email)
        finally:
            db.close()
    except (JWTError, Exception):
        return None


def _protected_view(template_name: str):
    """
    Fábrica de vistas SSR protegidas.
    - Si no hay sesión válida → redirect /
    - Si hay sesión → renderiza template con request + current_user
    """
    async def _view(request: Request) -> HTMLResponse:
        user = _get_user_from_cookie(request)
        if user is None:
            return RedirectResponse("/", status_code=302)
        return templates.TemplateResponse(
            request,
            template_name,
            context={"request": request, "current_user": user},
        )
    _view.__name__ = f"view_{template_name.replace('.html','').replace('/','_')}"
    return _view


# ---------------------------------------------------------------------------
# SSR Routes
# ---------------------------------------------------------------------------

# El shell index.html NUNCA debe cachearse: referencia assets con hash que
# cambian en cada build. Si el navegador cachea el index viejo, tras un deploy
# pide chunks/css con hashes que ya no existen → 404 "Failed to fetch
# dynamically imported module". Los assets con hash bajo /static sí pueden
# cachearse (son inmutables). no-cache fuerza revalidar el shell en cada visita.
_SPA_NO_CACHE = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


# Login (pública) — sirve el SPA, React Router monta LoginPage.
# Si la cookie ya es válida, devolvemos 302 a /dashboard para evitar hidratar
# el SPA antes de redirect (mejor TTI). El SPA además tiene su propio guard
# como segunda línea de defensa.
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def view_root(request: Request):
    if _get_user_from_cookie(request):
        return RedirectResponse("/dashboard", status_code=302)
    index_path = SPA_DIST / "index.html"
    if not index_path.exists():
        # Fallback al Jinja viejo si por alguna razón el build no existe.
        return templates.TemplateResponse(request, "login.html", context={"request": request})
    return HTMLResponse(index_path.read_text(encoding="utf-8"), headers=_SPA_NO_CACHE)


# Phase 6 (2026-05-22): TODAS las páginas (incluso login) migradas al SPA.
# _SSR_ROUTES vacía intencionalmente. Los templates Jinja en app/templates/ se
# conservan como respaldo histórico; si algo se rompe, descomenta y comenta
# el handler SPA correspondiente.
_SSR_ROUTES: list[tuple[str, str]] = []

for _path, _tmpl in _SSR_ROUTES:
    app.add_api_route(
        _path,
        _protected_view(_tmpl),
        response_class=HTMLResponse,
        include_in_schema=False,
    )

# ---------------------------------------------------------------------------
# SPA — Migración gradual a React+Vite (ver docs/superpowers/specs/2026-05-21-
# spa-migration-phase-0-foundation.md). React Router maneja el routing del
# lado del cliente. La cookie de auth (access_token) es la misma que usa
# Jinja, así que /api/* funciona sin cambios. El build de Vite escribe a
# app/static/dist/ — los assets son servidos por el mount existente de
# /static. Esta ruta solo entrega el index.html shell.
# ---------------------------------------------------------------------------
SPA_DIST = BASE_DIR / "static" / "dist"


@app.get("/spa/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_catchall(request: Request, full_path: str) -> HTMLResponse:
    index_path = SPA_DIST / "index.html"
    if not index_path.exists():
        return HTMLResponse(
            "<h1>SPA build missing</h1>"
            "<p>Run <code>cd web && npm run build</code> o despliega en Railway.</p>",
            status_code=503,
        )
    return HTMLResponse(index_path.read_text(encoding="utf-8"), headers=_SPA_NO_CACHE)


# Helper para servir el SPA en una URL legacy. Reusado por todas las páginas
# migradas (Phase 1d en adelante). Revertir migración = comentar el endpoint y
# descomentar la línea correspondiente en _SSR_ROUTES.
def _serve_spa_protected(request: Request) -> HTMLResponse | RedirectResponse:
    user = _get_user_from_cookie(request)
    if user is None:
        return RedirectResponse("/", status_code=302)
    index_path = SPA_DIST / "index.html"
    if not index_path.exists():
        return HTMLResponse(
            "<h1>SPA build missing</h1>"
            "<p>Run <code>cd web && npm run build</code> o despliega en Railway.</p>",
            status_code=503,
        )
    return HTMLResponse(index_path.read_text(encoding="utf-8"), headers=_SPA_NO_CACHE)


# Phase 1d: /ventas/cotizador → SPA
@app.get("/ventas/cotizador", response_class=HTMLResponse, include_in_schema=False)
async def view_ventas_cotizador_spa(request: Request):
    return _serve_spa_protected(request)


# Phase 2: /seguimiento, /borradores, /fantasmas → SPA
@app.get("/seguimiento", response_class=HTMLResponse, include_in_schema=False)
async def view_seguimiento_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/borradores", response_class=HTMLResponse, include_in_schema=False)
async def view_borradores_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/fantasmas", response_class=HTMLResponse, include_in_schema=False)
async def view_fantasmas_spa(request: Request):
    return _serve_spa_protected(request)


# Phase 3: /inventario, /clientes, /catalogos → SPA
@app.get("/inventario", response_class=HTMLResponse, include_in_schema=False)
async def view_inventario_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/clientes", response_class=HTMLResponse, include_in_schema=False)
async def view_clientes_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/catalogos", response_class=HTMLResponse, include_in_schema=False)
async def view_catalogos_spa(request: Request):
    return _serve_spa_protected(request)


# Phase 4: /dashboard, /reportes, /reportes-servicio, /compras, /remisiones, /gastos → SPA
@app.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def view_dashboard_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/reportes", response_class=HTMLResponse, include_in_schema=False)
async def view_reportes_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/reportes-servicio", response_class=HTMLResponse, include_in_schema=False)
async def view_reportes_servicio_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/compras", response_class=HTMLResponse, include_in_schema=False)
async def view_compras_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/remisiones", response_class=HTMLResponse, include_in_schema=False)
async def view_remisiones_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/reportes-servicio-docs", response_class=HTMLResponse, include_in_schema=False)
async def view_reportes_servicio_docs_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/gastos", response_class=HTMLResponse, include_in_schema=False)
async def view_gastos_spa(request: Request):
    return _serve_spa_protected(request)


# Phase 5: /usuarios, /servicios, /cuentas-por-cobrar, /fx, /precios → SPA (final)
@app.get("/usuarios", response_class=HTMLResponse, include_in_schema=False)
async def view_usuarios_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/servicios", response_class=HTMLResponse, include_in_schema=False)
async def view_servicios_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/cuentas-por-cobrar", response_class=HTMLResponse, include_in_schema=False)
async def view_cxc_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/fx", response_class=HTMLResponse, include_in_schema=False)
async def view_fx_spa(request: Request):
    return _serve_spa_protected(request)


@app.get("/precios", response_class=HTMLResponse, include_in_schema=False)
async def view_precios_spa(request: Request):
    return _serve_spa_protected(request)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Ops"])
async def health_check() -> JSONResponse:
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        # Probe tabla crítica: si ordenes_venta no es accesible (drift schema
        # tras migración rota), no devolvemos 200 al monitoring.
        db.execute(text("SELECT 1 FROM ordenes_venta LIMIT 1"))
        db.close()
        db_ok = True
    except Exception:
        db_ok = False
    status_str = "ok" if db_ok else "degraded"
    return JSONResponse({"status": status_str, "db": "ok" if db_ok else "error"},
                        status_code=200 if db_ok else 503)
