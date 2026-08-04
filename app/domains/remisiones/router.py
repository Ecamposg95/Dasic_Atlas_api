"""Router v2 de remisiones — delgado a propósito: valida permisos/scoping y
delega toda la lógica de negocio a `service`/`repository`.

Reglas de permisos (matriz completa en `app/security/permissions.py`):

- GERENTE_COMERCIAL / ADMIN: gestión completa de remisiones.
- VENTAS: `:own` en read/write/emitir/convertir — el `service` YA aplica
  `require()` en `cancelar` ("cancel") y `crear_cotizacion_desde`
  ("convertir"), y `can()` en la sobre-entrega ("sobreentrega") dentro de
  `emitir`. Este router NO duplica esos gates — solo agrega los suyos
  (read/create/write/emitir/recibir) y el owner-scoping que el service no
  hace (el service nunca compara `creado_por_id` contra el user).
- OPERATIVO: "consulta emitidas" — ve y recibe remisiones EMITIDA/RECIBIDA,
  nunca BORRADOR ni CANCELADA (su permiso es de recepción física, no de
  gestión del ciclo de vida completo).

`_check_owner` sigue el patrón exacto del brief: recibe `db, remision_id,
user, action` y hace su PROPIA consulta (mínima: solo el dueño) — así una
llamada de un rol sin scope (:own no aplica) no toca la base de datos en lo
absoluto, y una remisión inexistente para un rol sin permiso ni siquiera
llega a evaluarse (el `require()` de la action base corre primero).
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.domains.remisiones import documents, repository, service
from app.domains.remisiones.schemas import RemisionCreate, RemisionUpdate
from app.models.enums import RolUsuario
from app.security import get_current_user
from app.security.permissions import _normalize_role, is_owner_scoped, require

router = APIRouter(prefix="/api/remisiones", tags=["Remisiones"])

_ESTADOS_OPERATIVO = ("emitida", "recibida")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_404(db: Session, remision_id: int) -> models.Remision:
    rem = db.query(models.Remision).filter(models.Remision.id == remision_id).first()
    if not rem:
        raise HTTPException(404, "Remisión no encontrada")
    return rem


def _es_visible_para_lectura(rem: models.Remision, user) -> bool:
    """Regla de visibilidad de LECTURA para VENTAS (`read:own` ampliado,
    decisión de producto — fix round 1 de Task 7): la remisión es visible
    si es propia (`creado_por_id`) O si está ligada a una orden propia
    (`orden_venta.vendedor_id`). VENTAS puede crear remisiones sobre
    órdenes ajenas (cartera compartida B2B — el repo ya da lectura completa
    de clientes), así que el dueño de la ORDEN necesita ver esas remisiones
    para dar seguimiento a su venta, aunque no las haya creado él.

    Esta regla ampliada es SOLO para lectura. Mutar (write/emitir/
    convertir) se queda estricto — ver `_check_owner`."""
    if rem.creado_por_id == user.id:
        return True
    return bool(rem.orden_venta_id and rem.orden_venta and rem.orden_venta.vendedor_id == user.id)


def _check_owner(db: Session, remision_id: int, user, action: str) -> None:
    """Si el permiso efectivo del user es la versión `:own` de `action`,
    verifica que la remisión sea suya — 403 si no. Si el user tiene el
    permiso amplio (o ninguno — eso ya lo filtró `require()`), no toca la
    base de datos.

    `action == "read"` usa `_es_visible_para_lectura` (regla ampliada:
    propia O de una orden propia). Cualquier otra action (write/emitir/
    convertir) usa la regla ESTRICTA — solo `creado_por_id == user.id`.
    Leer lo que afecta tus órdenes no equivale a poder mutar remisiones que
    no creaste tú."""
    if not is_owner_scoped(user, action, "remision"):
        return
    rem = _get_or_404(db, remision_id)
    if action == "read":
        if not _es_visible_para_lectura(rem, user):
            raise HTTPException(403, "No tienes permiso para leer esta remisión")
        return
    if rem.creado_por_id != user.id:
        raise HTTPException(403, f"No tienes permiso para {action} esta remisión")


def _es_operativo(user) -> bool:
    return _normalize_role(getattr(user, "rol", None)) == RolUsuario.OPERATIVO


def _check_operativo_estado(rem: models.Remision, user) -> None:
    """OPERATIVO nunca ve una remisión en BORRADOR/CANCELADA — ni el
    detalle (`GET /{id}`), ni el word, ni el imprimir (su permiso es de
    recepción física de EMITIDA/RECIBIDA, no de gestión del ciclo de vida
    completo). 404, no 403: no le confirmamos que la remisión existe en un
    estado que no le corresponde ver.

    Extraído a helper (antes vivía inline solo en `obtener`) porque
    `/{id}/word` e `/{id}/imprimir` necesitan el MISMO gate — se saltaban
    esta verificación (fix round 1 de Task 7: OPERATIVO podía imprimir una
    CANCELADA o descargar el .docx de un BORRADOR)."""
    if _es_operativo(user) and rem.estado.value not in _ESTADOS_OPERATIVO:
        raise HTTPException(404, "Remisión no encontrada")


_ESTADOS_VALIDOS = {e.value for e in models.EstadoRemision}


def _validar_estado(estado: Optional[str]) -> None:
    """`models.EstadoRemision(estado)` levanta `ValueError` (no
    `HTTPException`) para un valor inválido — sin este guard, un
    `?estado=basura` se propaga sin envolver y termina en 500 en vez de un
    400 explícito."""
    if estado and estado.lower() not in _ESTADOS_VALIDOS:
        raise HTTPException(
            400, f"Estado inválido: {estado!r}. Válidos: {sorted(_ESTADOS_VALIDOS)}")


def _aplicar_filtro_operativo(user, estado: Optional[str]):
    """OPERATIVO nunca ve BORRADOR ni CANCELADA. Si no pidió un `estado`
    explícito, se le restringe a (emitida, recibida). Si sí pidió uno fuera
    de ese conjunto, 403 explícito — mejor que devolver una lista vacía que
    parezca "no hay resultados"."""
    if not _es_operativo(user):
        return estado
    if estado:
        if estado.lower() not in _ESTADOS_OPERATIVO:
            raise HTTPException(403, "No tienes permiso para ver remisiones en ese estado")
        return estado
    return list(_ESTADOS_OPERATIVO)


def _item(r: models.Remision) -> dict:
    return {
        "id": r.id,
        "folio": r.folio,
        "orden_venta_id": r.orden_venta_id,
        "orden_folio": r.orden_venta.folio if r.orden_venta else None,
        "cliente_nombre": (
            r.orden_venta.cliente.nombre_empresa if r.orden_venta and r.orden_venta.cliente
            else (r.cliente.nombre_empresa if r.cliente else None)
        ),
        "fecha_remision": r.fecha_remision.isoformat() if r.fecha_remision else None,
        "transportista": r.transportista,
        "recibido_por": r.recibido_por,
        "recibido_at": r.recibido_at.isoformat() if r.recibido_at else None,
        "estado": r.estado.value,
        "creado_por_id": r.creado_por_id,
        "lineas_count": len(r.detalles),
    }


def _detalle(rem: models.Remision) -> dict:
    return {
        **_item(rem),
        "observaciones": rem.observaciones,
        "moneda": rem.moneda,
        "mostrar_precios": bool(rem.mostrar_precios),
        "motivo_cancelacion": rem.motivo_cancelacion,
        "detalles": [
            {
                "id": d.id,
                "detalle_orden_id": d.detalle_orden_id,
                "descripcion": d.descripcion,
                "sku": d.sku,
                "cantidad": d.cantidad,
                "unidad": d.unidad,
                "observaciones_linea": d.observaciones_linea,
                "clave_unidad_sat": d.clave_unidad_sat,
                "precio_unitario": float(d.precio_unitario) if d.precio_unitario is not None else None,
                "subtotal": float(d.subtotal) if d.subtotal is not None else None,
            }
            for d in rem.detalles
        ],
    }


# ---------------------------------------------------------------------------
# Listado / detalle
# ---------------------------------------------------------------------------

@router.get("/")
def listar(
    q: Optional[str] = None,
    orden_venta_id: Optional[int] = None,
    estado: Optional[str] = None,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    creado_por_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 100,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "read", "remision")
    if page < 1 or page_size < 1 or page_size > 500:
        raise HTTPException(400, "page o page_size inválido")
    _validar_estado(estado)

    estado_filtrado = _aplicar_filtro_operativo(current_user, estado)
    owner_id = current_user.id if is_owner_scoped(current_user, "read", "remision") else None

    total, rows = repository.listar(
        db, q=q, orden_venta_id=orden_venta_id, estado=estado_filtrado,
        desde=desde, hasta=hasta, creado_por_id=creado_por_id, owner_id=owner_id,
        page=page, page_size=page_size,
    )
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [_item(r) for r in rows],
    }


@router.get("/orden/{orden_id}/borrador")
def borrador_desde_orden(
    orden_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Arma el draft de una remisión desde una orden: una línea por cada
    DetalleOrden con snapshot de precio/unidad/SAT, cuánto ya se entregó
    (repository.entregado_por_detalle) y cuánto queda pendiente
    (repository.pendientes_por_detalle)."""
    require(current_user, "create", "remision")
    orden = db.query(models.OrdenVenta).filter(models.OrdenVenta.id == orden_id).first()
    if not orden:
        raise HTTPException(404, "Orden de venta no encontrada")
    if orden.estatus == models.EstatusOrden.COTIZACION:
        raise HTTPException(400, "La orden todavía es cotización — convierte a venta antes de remisionar")

    entregado = repository.entregado_por_detalle(db, orden.id)
    pendiente = repository.pendientes_por_detalle(db, orden)

    lineas = []
    for d in orden.detalles:
        prod = d.producto
        descripcion = d.descripcion_libre or (prod.nombre if prod else None) or "Producto"
        sku = d.sku_libre or (prod.sku_comercial if prod else None) or (prod.sku if prod else None)
        clave_unidad = d.clave_unidad_sat or (prod.clave_unidad_sat if prod else None)
        unidad = d.unidad or (prod.unidad if prod else None)
        lineas.append({
            "detalle_orden_id": d.id,
            "descripcion": descripcion,
            "sku": sku,
            "clave_unidad_sat": clave_unidad,
            "unidad": unidad,
            "precio_unitario": float(d.precio_unitario or 0),
            "cantidad_orden": float(d.cantidad),
            "entregado": float(entregado.get(d.id, Decimal("0"))),
            "cantidad_pendiente": float(pendiente.get(d.id, Decimal("0"))),
        })

    return {
        "orden_venta_id": orden.id,
        "orden_folio": orden.folio,
        "cliente_nombre": orden.cliente.nombre_empresa if orden.cliente else None,
        "moneda": orden.moneda,
        "lineas": lineas,
    }


@router.get("/{id}")
def obtener(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "read", "remision")
    _check_owner(db, id, current_user, "read")
    rem = _get_or_404(db, id)
    _check_operativo_estado(rem, current_user)
    return _detalle(rem)


# ---------------------------------------------------------------------------
# CRUD de borrador
# ---------------------------------------------------------------------------

@router.post("/")
def crear(
    payload: RemisionCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "create", "remision")
    rem = service.crear_borrador(db, payload, current_user)
    return {"id": rem.id, "estado": rem.estado.value}


@router.put("/{id}")
def actualizar(
    id: int,
    payload: RemisionUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "write", "remision")
    _check_owner(db, id, current_user, "write")
    rem = service.actualizar_borrador(db, id, payload, current_user)
    return {"id": rem.id, "estado": rem.estado.value}


@router.delete("/{id}", status_code=204)
def eliminar(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "write", "remision")
    _check_owner(db, id, current_user, "write")
    service.eliminar_borrador(db, id, current_user)
    return None


# ---------------------------------------------------------------------------
# Transiciones de estado
# ---------------------------------------------------------------------------

@router.post("/{id}/emitir")
def emitir(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "emitir", "remision")
    _check_owner(db, id, current_user, "emitir")
    rem = service.emitir(db, id, current_user)
    return {"id": rem.id, "folio": rem.folio, "estado": rem.estado.value}


class RecepcionInput(BaseModel):
    recibido_por: str


@router.patch("/{id}/recepcion")
def recepcion(
    id: int,
    payload: RecepcionInput,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # "recibir" no tiene variante :own en la matriz — solo lo tienen
    # OPERATIVO (plano) y ADMIN/SUPERADMIN (wildcard `*.*`). GERENTE_
    # COMERCIAL NO tiene wildcard NI "recibir" en su lista de permisos (§6
    # de la matriz) — recibe 403 aquí, y es INTENCIONAL, no un bug. Sin
    # variante :own → sin owner-scoping que aplicar.
    require(current_user, "recibir", "remision")
    rem = service.registrar_recepcion(db, id, payload.recibido_por, current_user)
    return {
        "id": rem.id,
        "estado": rem.estado.value,
        "recibido_por": rem.recibido_por,
        "recibido_at": rem.recibido_at.isoformat() if rem.recibido_at else None,
    }


class CancelarInput(BaseModel):
    motivo: str


@router.post("/{id}/cancelar")
def cancelar(
    id: int,
    payload: CancelarInput,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # El service YA aplica require(user, "cancel", "remision") como primera
    # línea — lo repetimos aquí (defensa en profundidad: sobrevive si algún
    # día el service cambia de orden/firma interno). Sin variante :own en
    # la matriz, así que tampoco hay owner-scoping que agregar.
    require(current_user, "cancel", "remision")
    rem = service.cancelar(db, id, payload.motivo, current_user)
    return {"id": rem.id, "estado": rem.estado.value}


@router.post("/{id}/crear-cotizacion")
def crear_cotizacion(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # El service YA aplica require(user, "convertir", "remision") — lo
    # repetimos aquí (defensa en profundidad, mismo motivo que en
    # `cancelar`). Owner-scoping SÍ hace falta agregarlo: el service NO
    # compara ownership (VENTAS tiene "convertir:own").
    require(current_user, "convertir", "remision")
    _check_owner(db, id, current_user, "convertir")
    cot = service.crear_cotizacion_desde(db, id, current_user)
    return {"orden_venta_id": cot.id, "folio": cot.folio}


# ---------------------------------------------------------------------------
# Documentos — plantillas en archivo (Task 8: app/domains/remisiones/documents.py)
# ---------------------------------------------------------------------------

@router.get("/{id}/word")
def generar_word_remision(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera la remisión como .docx editable (descarga)."""
    require(current_user, "read", "remision")
    _check_owner(db, id, current_user, "read")
    rem = _get_or_404(db, id)
    _check_operativo_estado(rem, current_user)

    data = documents.render_word(db, rem)
    filename = f"remision_{rem.folio or rem.id}.docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{id}/imprimir", response_class=HTMLResponse)
def imprimir_remision(
    id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require(current_user, "read", "remision")
    _check_owner(db, id, current_user, "read")
    rem = _get_or_404(db, id)
    _check_operativo_estado(rem, current_user)
    return documents.render_html(db, rem)
