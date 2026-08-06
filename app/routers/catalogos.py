"""Diccionarios: marcas + categorías de productos/servicios + unidades.

Antes llamado "Catálogos". Mantiene el prefix /api/catalogos por compatibilidad
con el frontend existente y permisos `("read"|"manage", "catalogos")` en RBAC.

Subdiccionarios:
- Marcas: tabla `marcas` con abreviatura única (prefijo SKU). CRUD completo.
- Categorías de productos: derivadas de `productos.categoria` distinct.
- Categorías de servicios: enum + valores en uso de `servicios.categoria_servicio`.
- Unidades comerciales: derivadas de `productos.unidad` distinct + lista sugerida.

Las "tablas-distinct" no son canónicas — se reciclan los valores capturados en
productos/servicios. Renombrar un valor en su fuente actualiza el diccionario.
"""

from __future__ import annotations

import logging

import re
import unicodedata
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.security import allow_admin_asistente, allow_all_staff, get_current_user
from app.security.permissions import require

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/catalogos", tags=["Diccionarios"])

_ALPHA_RE = re.compile(r"[^A-Z0-9]")


def normalizar_abreviatura(raw: str) -> str:
    """Mayúsculas, sin acentos, sin espacios ni símbolos. Máximo 20 chars."""
    if not raw:
        raise HTTPException(400, "abreviatura requerida")
    # Quita acentos: "Schneider" → "Schneider", "Eléctrico" → "Electrico".
    no_acentos = unicodedata.normalize("NFKD", raw)
    no_acentos = "".join(c for c in no_acentos if not unicodedata.combining(c))
    clean = _ALPHA_RE.sub("", no_acentos.upper())[:20]
    if not clean or len(clean) < 2:
        raise HTTPException(400, "abreviatura debe tener al menos 2 caracteres alfanuméricos")
    return clean


def _normalizar_nombre(raw: str | None) -> str:
    """Trim + colapsa espacios múltiples. NO cambia caja."""
    if not raw:
        return ""
    return re.sub(r"\s+", " ", raw.strip())


def siguiente_sku_para(db: Session, abreviatura: str) -> str:
    """Calcula el siguiente SKU para una abreviatura.

    Escanea productos con SKU `{ABREV}-NNNN`, toma el max(N)+1 y formatea
    con padding a 4 dígitos. Si no hay productos previos, empieza en 0001.

    Esta función NO toma el advisory lock; el lock se toma en el momento
    de crear el producto (en _generate_internal_sku) para que el rango
    desde "sugerir" hasta "crear" no quede protegido (intencional: solo
    es preview).
    """
    pattern = f"{abreviatura}-%"
    rows = (
        db.query(models.Producto.sku)
        .filter(models.Producto.sku.like(pattern))
        .all()
    )
    rx = re.compile(rf"^{re.escape(abreviatura)}-(\d+)$")
    max_n = 0
    for (sku,) in rows:
        if not sku:
            continue
        m = rx.match(sku)
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return f"{abreviatura}-{max_n + 1:04d}"


def _contar_productos_por_marca(db: Session, nombre_marca: str, abreviatura: str) -> int:
    """Cuenta productos asociados a una marca.

    Asocia por DOS criterios (suma sin dobles):
    - producto.marca == nombre_marca (case-insensitive)
    - producto.sku LIKE '{abreviatura}-%'

    Usa SQL DISTINCT para evitar contar dos veces los que cumplen ambos.
    """
    q = (
        db.query(func.count(func.distinct(models.Producto.id)))
        .filter(
            (func.lower(models.Producto.marca) == nombre_marca.lower())
            | (models.Producto.sku.like(f"{abreviatura}-%"))
        )
    )
    return int(q.scalar() or 0)


# --- 1. LISTAR MARCAS ---
@router.get("/marcas", response_model=List[schemas.MarcaResponse], dependencies=[Depends(allow_all_staff)])
def listar_marcas(db: Session = Depends(get_db), q: Optional[str] = None):
    query = db.query(models.Marca)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (models.Marca.nombre.ilike(like)) | (models.Marca.abreviatura.ilike(like))
        )
    marcas = query.order_by(models.Marca.nombre.asc()).all()

    resultado = []
    for m in marcas:
        n_prod = _contar_productos_por_marca(db, m.nombre, m.abreviatura)
        resultado.append(schemas.MarcaResponse(
            id=m.id,
            abreviatura=m.abreviatura,
            nombre=m.nombre,
            categoria=m.categoria,
            n_productos=n_prod,
            siguiente_sku=siguiente_sku_para(db, m.abreviatura),
        ))
    return resultado


# --- 2. OBTENER UNA MARCA ---
@router.get("/marcas/{abreviatura}", response_model=schemas.MarcaResponse, dependencies=[Depends(allow_all_staff)])
def obtener_marca(abreviatura: str, db: Session = Depends(get_db)):
    abrev = normalizar_abreviatura(abreviatura)
    m = db.query(models.Marca).filter(models.Marca.abreviatura == abrev).first()
    if not m:
        raise HTTPException(404, f"Marca con abreviatura '{abrev}' no encontrada")
    return schemas.MarcaResponse(
        id=m.id,
        abreviatura=m.abreviatura,
        nombre=m.nombre,
        categoria=m.categoria,
        n_productos=_contar_productos_por_marca(db, m.nombre, m.abreviatura),
        siguiente_sku=siguiente_sku_para(db, m.abreviatura),
    )


# --- 3. CREAR MARCA ---
@router.post("/marcas", response_model=schemas.MarcaResponse, dependencies=[Depends(allow_admin_asistente)])
def crear_marca(payload: schemas.MarcaCreate, db: Session = Depends(get_db)):
    abrev = normalizar_abreviatura(payload.abreviatura)
    nombre = payload.nombre.strip()
    if not nombre:
        raise HTTPException(400, "nombre requerido")

    existente = db.query(models.Marca).filter(models.Marca.abreviatura == abrev).first()
    if existente:
        raise HTTPException(409, f"Abreviatura '{abrev}' ya existe (marca: {existente.nombre})")

    try:
        m = models.Marca(
            abreviatura=abrev,
            nombre=nombre,
            categoria=(payload.categoria or "").strip() or None,
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return schemas.MarcaResponse(
            id=m.id,
            abreviatura=m.abreviatura,
            nombre=m.nombre,
            categoria=m.categoria,
            n_productos=0,
            siguiente_sku=siguiente_sku_para(db, m.abreviatura),
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.crear_marca falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# --- 4. EDITAR MARCA (no permite cambiar abreviatura) ---
@router.put("/marcas/{abreviatura}", response_model=schemas.MarcaResponse, dependencies=[Depends(allow_admin_asistente)])
def editar_marca(
    abreviatura: str,
    payload: schemas.MarcaUpdate,
    db: Session = Depends(get_db),
):
    abrev = normalizar_abreviatura(abreviatura)
    m = db.query(models.Marca).filter(models.Marca.abreviatura == abrev).first()
    if not m:
        raise HTTPException(404, f"Marca '{abrev}' no encontrada")

    try:
        if payload.nombre is not None:
            new_nombre = payload.nombre.strip()
            if not new_nombre:
                raise HTTPException(400, "nombre no puede quedar vacío")
            m.nombre = new_nombre
        if payload.categoria is not None:
            m.categoria = payload.categoria.strip() or None

        db.commit()
        db.refresh(m)
        return schemas.MarcaResponse(
            id=m.id,
            abreviatura=m.abreviatura,
            nombre=m.nombre,
            categoria=m.categoria,
            n_productos=_contar_productos_por_marca(db, m.nombre, m.abreviatura),
            siguiente_sku=siguiente_sku_para(db, m.abreviatura),
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.editar_marca falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# --- 5. ELIMINAR MARCA (bloquea si hay productos) ---
@router.delete("/marcas/{abreviatura}", dependencies=[Depends(allow_admin_asistente)])
def eliminar_marca(abreviatura: str, db: Session = Depends(get_db)):
    abrev = normalizar_abreviatura(abreviatura)
    m = db.query(models.Marca).filter(models.Marca.abreviatura == abrev).first()
    if not m:
        raise HTTPException(404, f"Marca '{abrev}' no encontrada")

    n_prod = _contar_productos_por_marca(db, m.nombre, m.abreviatura)
    if n_prod > 0:
        raise HTTPException(
            409,
            f"No se puede eliminar: hay {n_prod} producto(s) usando esta marca. "
            "Reasigna o elimina los productos primero.",
        )

    try:
        db.delete(m)
        db.commit()
        return {"mensaje": f"Marca '{abrev}' eliminada"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.eliminar_marca falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# --- 6. SUGERIR SIGUIENTE SKU (preview, sin reservar) ---
@router.get("/marcas/{abreviatura}/sugerir-sku", dependencies=[Depends(allow_all_staff)])
def sugerir_sku(abreviatura: str, db: Session = Depends(get_db)):
    abrev = normalizar_abreviatura(abreviatura)
    if not db.query(models.Marca).filter(models.Marca.abreviatura == abrev).first():
        raise HTTPException(404, f"Marca '{abrev}' no encontrada")
    return {
        "abreviatura": abrev,
        "siguiente_sku": siguiente_sku_para(db, abrev),
        "nota": "Preview sin reservar — el SKU se asigna al crear el producto",
    }


# --- 7. RESUMEN / STATS PARA DASHBOARD DEL MÓDULO ---
@router.get("/resumen", dependencies=[Depends(allow_all_staff)])
def resumen_catalogo(db: Session = Depends(get_db)):
    total_marcas = db.query(func.count(models.Marca.id)).scalar() or 0
    total_productos = db.query(func.count(models.Producto.id)).scalar() or 0
    productos_con_marca = (
        db.query(func.count(models.Producto.id))
        .filter(models.Producto.marca.is_not(None))
        .filter(models.Producto.marca != "")
        .scalar() or 0
    )
    # Categorías y unidades (distinct sobre productos)
    n_categorias = (
        db.query(func.count(func.distinct(models.Producto.categoria)))
        .filter(models.Producto.categoria.is_not(None))
        .filter(models.Producto.categoria != "")
        .scalar() or 0
    )
    n_unidades = (
        db.query(func.count(func.distinct(models.Producto.unidad)))
        .filter(models.Producto.unidad.is_not(None))
        .filter(models.Producto.unidad != "")
        .scalar() or 0
    )
    try:
        n_categorias_servicio = (
            db.query(func.count(func.distinct(models.Servicio.categoria_servicio)))
            .filter(models.Servicio.categoria_servicio.is_not(None))
            .scalar() or 0
        )
    except Exception:
        logger.warning("catalogos.resumen: tabla servicios no disponible, fallback a 0", exc_info=True)
        n_categorias_servicio = 0
    return {
        "total_marcas": total_marcas,
        "total_productos": total_productos,
        "productos_con_marca": productos_con_marca,
        "productos_sin_marca": total_productos - productos_con_marca,
        "total_categorias_producto": int(n_categorias),
        "total_unidades": int(n_unidades),
        "total_categorias_servicio": int(n_categorias_servicio),
    }


# ---------------------------------------------------------------------------
# Categorías de productos (sin tabla; distinct sobre productos.categoria)
# ---------------------------------------------------------------------------

@router.get("/categorias-producto", dependencies=[Depends(allow_all_staff)])
def listar_categorias_producto(db: Session = Depends(get_db)):
    """Lista categorías distintas en uso + conteo de productos por categoría."""
    rows = (
        db.query(
            models.Producto.categoria,
            func.count(models.Producto.id).label("n"),
        )
        .filter(models.Producto.categoria.is_not(None))
        .filter(models.Producto.categoria != "")
        .group_by(models.Producto.categoria)
        .order_by(models.Producto.categoria.asc())
        .all()
    )
    return {
        "items": [
            {"categoria": c, "n_productos": int(n)}
            for (c, n) in rows
        ],
    }


@router.put("/categorias-producto/rename", dependencies=[Depends(allow_admin_asistente)])
def renombrar_categoria_producto(payload: dict, db: Session = Depends(get_db)):
    """Renombra una categoría en TODOS los productos que la usen.

    Body: { "antiguo": "Relevadores", "nuevo": "Relés" }
    """
    antiguo = _normalizar_nombre(payload.get("antiguo"))
    nuevo = _normalizar_nombre(payload.get("nuevo"))
    if not antiguo or not nuevo:
        raise HTTPException(400, "Se requieren 'antiguo' y 'nuevo'.")
    if antiguo == nuevo:
        return {"actualizados": 0, "nota": "Nombres iguales, nada que hacer."}

    try:
        n = (
            db.query(models.Producto)
            .filter(models.Producto.categoria == antiguo)
            .update({"categoria": nuevo}, synchronize_session=False)
        )
        db.commit()
        return {"actualizados": int(n), "antiguo": antiguo, "nuevo": nuevo}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.renombrar_categoria_producto falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.delete("/categorias-producto/{nombre}", dependencies=[Depends(allow_admin_asistente)])
def eliminar_categoria_producto(nombre: str, db: Session = Depends(get_db)):
    """Pone a NULL la categoría en TODOS los productos que la usen.

    No hay tabla canónica de categorías; "eliminar" significa desasignar.
    """
    nombre_lim = _normalizar_nombre(nombre)
    if not nombre_lim:
        raise HTTPException(400, "Nombre vacío.")

    try:
        n = (
            db.query(models.Producto)
            .filter(models.Producto.categoria == nombre_lim)
            .update({"categoria": None}, synchronize_session=False)
        )
        db.commit()
        return {"desasignados": int(n), "categoria": nombre_lim}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.eliminar_categoria_producto falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Unidades de medida (catálogo administrable — tabla `unidades_medida`)
# ---------------------------------------------------------------------------
#
# Reemplaza el antiguo diccionario "distinct sobre productos.unidad": ahora
# es una tabla propia, administrable vía POST/PATCH (gateados con
# require(user, "manage", "unidad") — el recurso "unidad" nunca entró a la
# matriz de permisos (app/security/permissions.py) a propósito: solo ADMIN/
# SUPERADMIN pasan por el wildcard *.*, el resto recibe 403. Ese es el
# comportamiento deseado por el spec, no una tarea pendiente).
#
# El PUT /rename masivo de abajo sigue operando sobre `productos.unidad`
# (dictamen legacy de texto libre) y se conserva intacto por compatibilidad.


@router.get("/unidades", response_model=List[schemas.UnidadMedidaResponse], dependencies=[Depends(allow_all_staff)])
def listar_unidades(todas: bool = False, db: Session = Depends(get_db)):
    """Lista el catálogo `unidades_medida`. Por default solo activas;
    `?todas=true` (uso admin) incluye también las inactivas."""
    q = db.query(models.UnidadMedida)
    if not todas:
        q = q.filter(models.UnidadMedida.activa.is_(True))
    return q.order_by(models.UnidadMedida.orden.asc(), models.UnidadMedida.nombre.asc()).all()


@router.post("/unidades", response_model=schemas.UnidadMedidaResponse)
def crear_unidad(
    payload: schemas.UnidadMedidaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    require(current_user, "manage", "unidad")
    nombre = payload.nombre.strip()
    abreviatura = payload.abreviatura.strip().upper()
    if not nombre or not abreviatura:
        raise HTTPException(400, "nombre y abreviatura son requeridos")

    existente = db.query(models.UnidadMedida).filter(models.UnidadMedida.nombre == nombre).first()
    if existente:
        raise HTTPException(409, f"Ya existe una unidad con nombre '{nombre}'")

    try:
        u = models.UnidadMedida(
            nombre=nombre,
            abreviatura=abreviatura,
            activa=payload.activa,
            orden=payload.orden,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.crear_unidad falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.patch("/unidades/{unidad_id}", response_model=schemas.UnidadMedidaResponse)
def editar_unidad(
    unidad_id: int,
    payload: schemas.UnidadMedidaUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    require(current_user, "manage", "unidad")
    u = db.get(models.UnidadMedida, unidad_id)
    if not u:
        raise HTTPException(404, "Unidad no encontrada")

    try:
        if payload.nombre is not None:
            nuevo_nombre = payload.nombre.strip()
            if not nuevo_nombre:
                raise HTTPException(400, "nombre no puede quedar vacío")
            if nuevo_nombre != u.nombre:
                colision = (
                    db.query(models.UnidadMedida)
                    .filter(
                        models.UnidadMedida.nombre == nuevo_nombre,
                        models.UnidadMedida.id != u.id,
                    )
                    .first()
                )
                if colision:
                    raise HTTPException(409, f"Ya existe una unidad con nombre '{nuevo_nombre}'")
            u.nombre = nuevo_nombre
        if payload.abreviatura is not None:
            nueva_abrev = payload.abreviatura.strip().upper()
            if not nueva_abrev:
                raise HTTPException(400, "abreviatura no puede quedar vacía")
            u.abreviatura = nueva_abrev
        if payload.activa is not None:
            u.activa = payload.activa
        if payload.orden is not None:
            u.orden = payload.orden

        db.commit()
        db.refresh(u)
        return u
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.editar_unidad falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@router.put("/unidades/rename", dependencies=[Depends(allow_admin_asistente)])
def renombrar_unidad(payload: dict, db: Session = Depends(get_db)):
    """Renombra una unidad en todos los productos que la usen."""
    antiguo = (payload.get("antiguo") or "").strip().upper()
    nuevo = (payload.get("nuevo") or "").strip().upper()
    if not antiguo or not nuevo:
        raise HTTPException(400, "Se requieren 'antiguo' y 'nuevo'.")
    if antiguo == nuevo:
        return {"actualizados": 0}

    try:
        n = (
            db.query(models.Producto)
            .filter(models.Producto.unidad == antiguo)
            .update({"unidad": nuevo}, synchronize_session=False)
        )
        db.commit()
        return {"actualizados": int(n), "antiguo": antiguo, "nuevo": nuevo}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("catalogos.renombrar_unidad falló")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Categorías de servicios (enum sugerido + valores en uso)
# ---------------------------------------------------------------------------

CATEGORIAS_SERVICIO_SUGERIDAS = ["instalacion", "mantto", "asesoria", "otro"]


@router.get("/categorias-servicio", dependencies=[Depends(allow_all_staff)])
def listar_categorias_servicio(db: Session = Depends(get_db)):
    """Categorías de servicios en uso (de la tabla `servicios`) + sugeridas."""
    try:
        rows = (
            db.query(
                models.Servicio.categoria_servicio,
                func.count(models.Servicio.id).label("n"),
            )
            .filter(models.Servicio.categoria_servicio.is_not(None))
            .group_by(models.Servicio.categoria_servicio)
            .order_by(models.Servicio.categoria_servicio.asc())
            .all()
        )
        en_uso = [{"categoria": c, "n_servicios": int(n)} for (c, n) in rows]
    except Exception:
        logger.warning("catalogos.categorias_servicios: fallback a lista vacía", exc_info=True)
        en_uso = []
    return {
        "en_uso": en_uso,
        "sugeridas": CATEGORIAS_SERVICIO_SUGERIDAS,
    }
