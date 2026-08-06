import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from fastapi.responses import HTMLResponse
from jinja2 import Environment, BaseLoader

from app import models
from app import schemas
from app.db import get_db
from app.security import allow_admin, allow_admin_asistente, allow_all_staff, get_current_user
from app.security.permissions import is_owner_scoped, require
from app.core.fechas import hoy_negocio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clientes", tags=["Clientes y Cobranza"])

# --- 1. LISTAR CLIENTES (CON SALDO) ---
@router.get("/", response_model=List[schemas.ClienteResponse], dependencies=[Depends(allow_all_staff)])
def listar_clientes(
    skip: int = 0,
    limit: int = 100,
    q: Optional[str] = None,
    estatus: Optional[str] = None,
    sort: Optional[str] = None,   # nombre | saldo | ultima_compra
    dir: str = "asc",
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Lista empresas con conteo de contactos + última compra. VENTAS solo ve las suyas."""
    from sqlalchemy import func
    query = db.query(models.Cliente)
    if is_owner_scoped(current_user, "read", "cliente"):
        query = query.filter(models.Cliente.creado_por_id == current_user.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.Cliente.nombre_empresa.ilike(like),
            models.Cliente.contacto_nombre.ilike(like),
            models.Cliente.email.ilike(like),
        ))
    if estatus:
        query = query.filter(models.Cliente.estatus == estatus)

    desc = dir == "desc"
    if sort == "saldo":
        col = models.Cliente.saldo_actual
        query = query.order_by(col.desc() if desc else col.asc())
    elif sort != "ultima_compra":
        col = models.Cliente.nombre_empresa
        query = query.order_by(col.desc() if desc else col.asc())

    rows = query.offset(skip).limit(limit).all() if sort != "ultima_compra" else query.all()

    counts = dict(
        db.query(models.Contacto.cliente_id, func.count(models.Contacto.id))
        .group_by(models.Contacto.cliente_id).all()
    )
    ventas_estatus = [models.EstatusOrden.PENDIENTE, models.EstatusOrden.PAGADA]
    row_ids = [c.id for c in rows]
    ultimas = dict(
        db.query(models.OrdenVenta.cliente_id, func.max(models.OrdenVenta.fecha_creacion))
        .filter(models.OrdenVenta.estatus.in_(ventas_estatus))
        .filter(models.OrdenVenta.cliente_id.in_(row_ids))
        .group_by(models.OrdenVenta.cliente_id).all()
    ) if row_ids else {}
    for c in rows:
        c.n_contactos = counts.get(c.id, 0)
        u = ultimas.get(c.id)
        c.ultima_compra = u.isoformat() if u else None

    if sort == "ultima_compra":
        rows.sort(key=lambda c: c.ultima_compra or "", reverse=desc)
        rows = rows[skip: skip + limit]
    return rows


@router.get("/count", dependencies=[Depends(allow_all_staff)])
def contar_clientes(
    q: Optional[str] = None,
    estatus: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    query = db.query(func.count(models.Cliente.id))
    if is_owner_scoped(current_user, "read", "cliente"):
        query = query.filter(models.Cliente.creado_por_id == current_user.id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.Cliente.nombre_empresa.ilike(like),
            models.Cliente.contacto_nombre.ilike(like),
            models.Cliente.email.ilike(like),
        ))
    if estatus:
        query = query.filter(models.Cliente.estatus == estatus)
    return {"total": query.scalar() or 0}


# --- DUPLICADOS / MERGE ---
@router.get("/duplicados", dependencies=[Depends(allow_admin)])
def empresas_duplicadas(db: Session = Depends(get_db)):
    """Grupos de empresas con el mismo RFC (no nulo, count>1) + contadores."""
    rfcs = [
        r[0]
        for r in (
            db.query(models.Cliente.rfc_tax_id)
            .filter(models.Cliente.rfc_tax_id.isnot(None), func.btrim(models.Cliente.rfc_tax_id) != "")
            .group_by(models.Cliente.rfc_tax_id)
            .having(func.count(models.Cliente.id) > 1)
            .all()
        )
    ]
    if not rfcs:
        return []
    miembros = db.query(models.Cliente).filter(models.Cliente.rfc_tax_id.in_(rfcs)).all()
    ids = [c.id for c in miembros]

    def counts_for(model):
        rows = (
            db.query(model.cliente_id, func.count())
            .filter(model.cliente_id.in_(ids))
            .group_by(model.cliente_id)
            .all()
        )
        return {cid: n for cid, n in rows}

    n_ord = counts_for(models.OrdenVenta)
    n_trx = counts_for(models.TransaccionCliente)
    n_con = counts_for(models.Contacto)

    # Remisiones: las creadas desde orden llevan cliente_id NULL — se
    # atribuyen al cliente de su orden (coalesce: cliente directo si existe,
    # si no el de la orden). Mismo criterio que el timeline de actividad.
    _cliente_rem = func.coalesce(models.Remision.cliente_id, models.OrdenVenta.cliente_id)
    n_rem = {
        cid: n
        for cid, n in (
            db.query(_cliente_rem, func.count())
            .outerjoin(models.OrdenVenta, models.Remision.orden_venta_id == models.OrdenVenta.id)
            .filter(_cliente_rem.in_(ids))
            .group_by(_cliente_rem)
            .all()
        )
    }

    grupos: dict = {}
    for c in miembros:
        grupos.setdefault(c.rfc_tax_id, []).append({
            "id": c.id,
            "nombre_empresa": c.nombre_empresa,
            "contacto_nombre": c.contacto_nombre,
            "saldo_actual": float(c.saldo_actual or 0),
            "limite_credito": float(c.limite_credito or 0),
            "dias_credito": c.dias_credito,
            "n_ordenes": n_ord.get(c.id, 0),
            "n_transacciones": n_trx.get(c.id, 0),
            "n_remisiones": n_rem.get(c.id, 0),
            "n_contactos": n_con.get(c.id, 0),
        })
    out = []
    for rfc, ms in grupos.items():
        ms.sort(key=lambda m: (-m["n_ordenes"], m["id"]))
        out.append({"rfc": rfc, "miembros": ms})
    out.sort(key=lambda g: g["rfc"])
    return out


@router.post("/merge", dependencies=[Depends(allow_admin)])
def merge_empresas(
    payload: schemas.MergeEmpresasInput,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Fusiona empresas (mismo RFC) en el sobreviviente. Transaccional + audit."""
    if not payload.loser_ids:
        raise HTTPException(400, "loser_ids vacío")
    if payload.survivor_id in payload.loser_ids:
        raise HTTPException(400, "El sobreviviente no puede estar entre los perdedores")
    all_ids = [payload.survivor_id] + payload.loser_ids
    rows = db.query(models.Cliente).filter(models.Cliente.id.in_(all_ids)).all()
    by_id = {c.id: c for c in rows}
    if payload.survivor_id not in by_id:
        raise HTTPException(404, "Sobreviviente no encontrado")
    for lid in payload.loser_ids:
        if lid not in by_id:
            raise HTTPException(404, f"Empresa {lid} no encontrada")
    rfcs = {(by_id[i].rfc_tax_id or "").strip().lower() for i in all_ids}
    if len(rfcs) != 1 or "" in rfcs:
        raise HTTPException(400, "Todas las empresas a fusionar deben compartir el mismo RFC (no nulo)")

    survivor = by_id[payload.survivor_id]
    try:
        for lid in payload.loser_ids:
            loser = by_id[lid]
            db.add(models.ClienteMergeLog(
                survivor_id=survivor.id,
                loser_id=lid,
                loser_nombre=loser.nombre_empresa,
                loser_rfc=loser.rfc_tax_id,
                loser_saldo=loser.saldo_actual,
                n_ordenes=db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id == lid).count(),
                n_transacciones=db.query(models.TransaccionCliente).filter(models.TransaccionCliente.cliente_id == lid).count(),
                n_remisiones=db.query(models.Remision).filter(models.Remision.cliente_id == lid).count(),
                n_contactos=db.query(models.Contacto).filter(models.Contacto.cliente_id == lid).count(),
                merged_by_id=current_user.id,
            ))

        remapped = {
            "ordenes": db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id.in_(payload.loser_ids)).update({models.OrdenVenta.cliente_id: survivor.id}, synchronize_session=False),
            "transacciones": db.query(models.TransaccionCliente).filter(models.TransaccionCliente.cliente_id.in_(payload.loser_ids)).update({models.TransaccionCliente.cliente_id: survivor.id}, synchronize_session=False),
            # Remisiones: solo hay que remapear las de cliente directo (modo
            # libre, cliente_id no nulo). Las creadas desde orden llevan
            # cliente_id NULL y se relacionan vía orden_venta_id — como las
            # órdenes ("ordenes" arriba) ya se remapean al sobreviviente,
            # esas remisiones siguen al cliente correcto automáticamente.
            "remisiones": db.query(models.Remision).filter(models.Remision.cliente_id.in_(payload.loser_ids)).update({models.Remision.cliente_id: survivor.id}, synchronize_session=False),
            "contactos": db.query(models.Contacto).filter(models.Contacto.cliente_id.in_(payload.loser_ids)).update({models.Contacto.cliente_id: survivor.id}, synchronize_session=False),
            # deals (CRM Pipeline) también referencia cliente_id con ON DELETE
            # NO ACTION: si un loser tiene deals y no se re-mapean, el DELETE de
            # abajo revienta por FK (o los deja huérfanos). Re-mapear siempre.
            "deals": db.query(models.Deal).filter(models.Deal.cliente_id.in_(payload.loser_ids)).update({models.Deal.cliente_id: survivor.id}, synchronize_session=False),
        }

        saldo = Decimal("0")
        for t in db.query(models.TransaccionCliente).filter(models.TransaccionCliente.cliente_id == survivor.id).all():
            if t.tipo == models.TipoMovimiento.CARGO:
                saldo += Decimal(t.monto or 0)
            elif t.tipo == models.TipoMovimiento.ABONO:
                saldo -= Decimal(t.monto or 0)
        survivor.saldo_actual = saldo.quantize(Decimal("0.01"))

        db.query(models.Cliente).filter(models.Cliente.id.in_(payload.loser_ids)).delete(synchronize_session=False)
        db.commit()
        return {"survivor_id": survivor.id, "merged": len(payload.loser_ids), "remapped": remapped}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.merge_empresas falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.patch("/bulk-estatus", dependencies=[Depends(allow_admin_asistente)])
def bulk_estatus(
    payload: schemas.BulkEstatusRequest,
    db: Session = Depends(get_db),
):
    """Cambia el estatus de varias empresas a la vez."""
    validos = {"activo", "inactivo", "prospecto"}
    if payload.estatus not in validos:
        raise HTTPException(422, f"estatus inválido (usa {validos})")
    if not payload.ids:
        raise HTTPException(400, "ids vacío")
    n = (
        db.query(models.Cliente)
        .filter(models.Cliente.id.in_(payload.ids))
        .update({models.Cliente.estatus: payload.estatus}, synchronize_session=False)
    )
    db.commit()
    return {"updated": n, "estatus": payload.estatus}


# --- 2. CREAR CLIENTE ---
@router.post("/", response_model=schemas.ClienteResponse, dependencies=[Depends(allow_all_staff)])
def crear_cliente(
    cliente: schemas.ClienteCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Registra un nuevo cliente. Accesible para todo el staff."""
    require(current_user, "create", "cliente")
    if not cliente.nombre_empresa or not cliente.nombre_empresa.strip():
        raise HTTPException(status_code=400, detail="nombre_empresa es requerido")
    if cliente.email:
        existing = (
            db.query(models.Cliente)
            .filter(models.Cliente.email == cliente.email)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un cliente con este email")
    # Guard anti-duplicado: una empresa = un RFC. Evita el problema de empresas
    # repetidas (Sub-3). Bloquea con el nombre de la empresa que ya tiene el RFC.
    if cliente.rfc_tax_id and cliente.rfc_tax_id.strip():
        rfc = cliente.rfc_tax_id.strip()
        dup = (
            db.query(models.Cliente)
            .filter(func.lower(models.Cliente.rfc_tax_id) == rfc.lower())
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ya existe una empresa con el RFC {rfc}: «{dup.nombre_empresa}». "
                    "Usa esa empresa (agrégale un contacto) en vez de crear un duplicado."
                ),
            )
    # Guard anti-duplicado por NOMBRE normalizado (lower+trim): cubre empresas
    # SIN RFC, que el guard de RFC no atrapa. Caso real: una "Vitracoat" sin RFC
    # se coló como duplicado del id2 que sí tiene RFC.
    nombre_norm = (cliente.nombre_empresa or "").strip().lower()
    if nombre_norm:
        dup_nombre = (
            db.query(models.Cliente)
            .filter(func.lower(func.btrim(models.Cliente.nombre_empresa)) == nombre_norm)
            .first()
        )
        if dup_nombre:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ya existe una empresa con el nombre «{dup_nombre.nombre_empresa}». "
                    "Usa esa empresa (agrégale un contacto) en vez de crear un duplicado."
                ),
            )

    try:
        nuevo_cliente = models.Cliente(**cliente.model_dump(), creado_por_id=current_user.id)
        db.add(nuevo_cliente)
        db.commit()
        db.refresh(nuevo_cliente)
        return nuevo_cliente
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.crear_cliente falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


# --- 2.5 EDITAR CLIENTE ---
@router.put("/{cliente_id}", response_model=schemas.ClienteResponse, dependencies=[Depends(allow_all_staff)])
def editar_cliente(
    cliente_id: int,
    payload: schemas.ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Edita un cliente. VENTAS sólo puede editar los que él creó."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if is_owner_scoped(current_user, "write", "cliente") and cliente.creado_por_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo puedes editar clientes que tú creaste")

    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] and data["email"] != cliente.email:
        otro = (
            db.query(models.Cliente)
            .filter(models.Cliente.email == data["email"], models.Cliente.id != cliente_id)
            .first()
        )
        if otro:
            raise HTTPException(status_code=400, detail="Ya existe otro cliente con este email")
    if "rfc_tax_id" in data and data["rfc_tax_id"] and data["rfc_tax_id"].strip():
        rfc = data["rfc_tax_id"].strip()
        otro_rfc = (
            db.query(models.Cliente)
            .filter(func.lower(models.Cliente.rfc_tax_id) == rfc.lower(), models.Cliente.id != cliente_id)
            .first()
        )
        if otro_rfc:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe otra empresa con el RFC {rfc}: «{otro_rfc.nombre_empresa}».",
            )
    # Guard por NOMBRE normalizado al renombrar (excluye la propia empresa).
    if "nombre_empresa" in data and data["nombre_empresa"] and data["nombre_empresa"].strip():
        nombre_norm = data["nombre_empresa"].strip().lower()
        otro_nombre = (
            db.query(models.Cliente)
            .filter(
                func.lower(func.btrim(models.Cliente.nombre_empresa)) == nombre_norm,
                models.Cliente.id != cliente_id,
            )
            .first()
        )
        if otro_nombre:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe otra empresa con el nombre «{otro_nombre.nombre_empresa}».",
            )

    try:
        for k, v in data.items():
            setattr(cliente, k, v)
        db.commit()
        db.refresh(cliente)
        return cliente
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.editar_cliente falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


# --- 2.6 ELIMINAR CLIENTE (admin) ---
@router.delete("/{cliente_id}", dependencies=[Depends(allow_admin_asistente)])
def eliminar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    """Elimina cliente. Bloquea si tiene cotizaciones/ventas o saldo > 0."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if cliente.saldo_actual and float(cliente.saldo_actual) != 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cliente tiene saldo {cliente.saldo_actual}. Liquida antes de eliminar.",
        )

    en_uso = (
        db.query(models.OrdenVenta)
        .filter(models.OrdenVenta.cliente_id == cliente_id)
        .first()
    )
    if en_uso:
        raise HTTPException(
            status_code=409,
            detail="Cliente referenciado en cotizaciones/ventas. No se puede eliminar.",
        )

    # Preserva historial financiero: si hay transacciones (cargos/abonos),
    # no permitir hard-delete. La política conservadora es bloquear; un soft
    # delete (campo `deletado_en`) queda como trabajo futuro.
    tiene_tx = (
        db.query(models.TransaccionCliente.id)
        .filter(models.TransaccionCliente.cliente_id == cliente_id)
        .first()
    )
    if tiene_tx:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cliente con historial de pagos/cargos. No se puede eliminar para "
                "preservar la trazabilidad contable."
            ),
        )

    try:
        db.delete(cliente)
        db.commit()
        return {"mensaje": "Cliente eliminado", "id": cliente_id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.eliminar_cliente falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")

# --- 3. OBTENER DETALLE CLIENTE ---
@router.get("/{cliente_id}", response_model=schemas.ClienteResponse, dependencies=[Depends(allow_all_staff)])
def obtener_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    cliente = (
        db.query(models.Cliente)
        .filter(
            models.Cliente.id == cliente_id,
        )
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if is_owner_scoped(current_user, "read", "cliente") and cliente.creado_por_id != current_user.id:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente

@router.get("/{cliente_id}/resumen", dependencies=[Depends(allow_all_staff)])
def empresa_resumen(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Métricas 360 de la empresa, computadas de órdenes existentes."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Empresa no encontrada")
    if is_owner_scoped(current_user, "read", "cliente") and cliente.creado_por_id != current_user.id:
        raise HTTPException(403, "Sin acceso a esta empresa")

    ventas_estatus = [models.EstatusOrden.PENDIENTE, models.EstatusOrden.PAGADA]
    base = db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id == cliente_id)
    ventas = base.filter(models.OrdenVenta.estatus.in_(ventas_estatus))

    total_vendido = ventas.with_entities(func.coalesce(func.sum(models.OrdenVenta.total), 0)).scalar() or 0
    n_ventas = ventas.count()
    n_cotizaciones = base.filter(models.OrdenVenta.estatus == models.EstatusOrden.COTIZACION).count()
    ultima = ventas.with_entities(func.max(models.OrdenVenta.fecha_creacion)).scalar()
    ticket = (Decimal(total_vendido) / n_ventas) if n_ventas else Decimal(0)
    limite = Decimal(cliente.limite_credito or 0)
    saldo = Decimal(cliente.saldo_actual or 0)

    return {
        "total_vendido": float(total_vendido),
        "n_ventas": n_ventas,
        "n_cotizaciones": n_cotizaciones,
        "ticket_promedio": float(ticket.quantize(Decimal("0.01"))),
        "ultima_compra": ultima.isoformat() if ultima else None,
        "saldo_actual": float(saldo),
        "limite_credito": float(limite),
        "credito_disponible": float(limite - saldo),
        "estatus": cliente.estatus,
    }


@router.get("/{cliente_id}/actividad", dependencies=[Depends(allow_all_staff)])
def empresa_actividad(
    cliente_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Timeline unificado: cotizaciones, ventas, remisiones, pagos."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Empresa no encontrada")
    if is_owner_scoped(current_user, "read", "cliente") and cliente.creado_por_id != current_user.id:
        raise HTTPException(403, "Sin acceso a esta empresa")

    eventos = []
    for o in db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id == cliente_id).all():
        es_cot = o.estatus == models.EstatusOrden.COTIZACION
        eventos.append({
            "tipo": "cotizacion" if es_cot else "venta",
            "fecha": o.fecha_creacion.isoformat() if o.fecha_creacion else None,
            "ref": o.folio,
            "monto": float(o.total or 0),
            "moneda": o.moneda,
            "descripcion": f"{'Cotización' if es_cot else 'Venta'} {o.folio} ({o.estatus})",
        })
    # Remisiones del cliente: directas (modo libre → cliente_id) O creadas
    # desde una orden del cliente (esas llevan cliente_id NULL y solo se
    # relacionan vía orden_venta_id → OrdenVenta.cliente_id).
    remisiones = (
        db.query(models.Remision)
        .outerjoin(models.OrdenVenta, models.Remision.orden_venta_id == models.OrdenVenta.id)
        .filter(or_(
            models.Remision.cliente_id == cliente_id,
            models.OrdenVenta.cliente_id == cliente_id,
        ))
        .all()
    )
    for r in remisiones:
        eventos.append({
            "tipo": "remision",
            "fecha": r.creado_en.isoformat() if getattr(r, "creado_en", None) else None,
            "ref": getattr(r, "folio", None),
            "monto": None,
            "moneda": None,
            "descripcion": f"Remisión {getattr(r, 'folio', '')}",
        })
    for t in db.query(models.TransaccionCliente).filter(models.TransaccionCliente.cliente_id == cliente_id).all():
        eventos.append({
            "tipo": "pago" if t.tipo == models.TipoMovimiento.ABONO else "cargo",
            "fecha": t.fecha.isoformat() if t.fecha else None,
            "ref": t.referencia_id,
            "monto": float(t.monto or 0),
            "moneda": None,
            "descripcion": t.descripcion or ("Abono" if t.tipo == models.TipoMovimiento.ABONO else "Cargo"),
        })

    eventos.sort(key=lambda e: e["fecha"] or "", reverse=True)
    return eventos[:limit]


@router.get("/{cliente_id}/notas", response_model=List[schemas.NotaEmpresaResponse], dependencies=[Depends(allow_all_staff)])
def listar_notas(cliente_id: int, db: Session = Depends(get_db)):
    notas = (
        db.query(models.NotaEmpresa)
        .filter(models.NotaEmpresa.cliente_id == cliente_id)
        .order_by(models.NotaEmpresa.creado_en.desc())
        .all()
    )
    autor_ids = [n.autor_id for n in notas if n.autor_id]
    autores = dict(
        db.query(models.Usuario.id, models.Usuario.nombre).filter(models.Usuario.id.in_(autor_ids)).all()
    ) if autor_ids else {}
    out = []
    for n in notas:
        out.append(schemas.NotaEmpresaResponse(
            id=n.id, cliente_id=n.cliente_id, autor_id=n.autor_id,
            autor_nombre=autores.get(n.autor_id), texto=n.texto, creado_en=n.creado_en,
        ))
    return out


@router.post("/{cliente_id}/notas", response_model=schemas.NotaEmpresaResponse, dependencies=[Depends(allow_all_staff)])
def crear_nota(
    cliente_id: int,
    payload: schemas.NotaEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not db.query(models.Cliente.id).filter(models.Cliente.id == cliente_id).first():
        raise HTTPException(404, "Empresa no encontrada")
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(422, "La nota no puede estar vacía")
    nota = models.NotaEmpresa(cliente_id=cliente_id, autor_id=current_user.id, texto=texto)
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return schemas.NotaEmpresaResponse(
        id=nota.id, cliente_id=nota.cliente_id, autor_id=nota.autor_id,
        autor_nombre=current_user.nombre, texto=nota.texto, creado_en=nota.creado_en,
    )


@router.delete("/{cliente_id}/notas/{nota_id}", dependencies=[Depends(allow_all_staff)])
def borrar_nota(cliente_id: int, nota_id: int, db: Session = Depends(get_db)):
    nota = (
        db.query(models.NotaEmpresa)
        .filter(models.NotaEmpresa.id == nota_id, models.NotaEmpresa.cliente_id == cliente_id)
        .first()
    )
    if not nota:
        raise HTTPException(404, "Nota no encontrada")
    db.delete(nota)
    db.commit()
    return {"deleted": nota_id}


@router.get("/{cliente_id}/deals", dependencies=[Depends(allow_all_staff)])
def empresa_deals(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Deals del CRM enlazados a esta empresa."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Empresa no encontrada")
    if is_owner_scoped(current_user, "read", "cliente") and cliente.creado_por_id != current_user.id:
        raise HTTPException(403, "Sin acceso a esta empresa")
    deals = (
        db.query(models.Deal)
        .filter(models.Deal.cliente_id == cliente_id)
        .order_by(models.Deal.creado_en.desc())
        .all()
    )
    out = []
    for d in deals:
        out.append({
            "id": d.id,
            "titulo": d.titulo,
            "monto": float(d.monto) if d.monto is not None else None,
            "moneda": d.moneda,
            "stage": d.stage.nombre if d.stage else None,
            "owner": d.owner.nombre if d.owner else None,
            "creado_en": d.creado_en.isoformat() if d.creado_en else None,
            "cerrado_en": d.cerrado_en.isoformat() if d.cerrado_en else None,
        })
    return out


# --- 4. VER ESTADO DE CUENTA (HISTORIAL) ---
@router.get("/{cliente_id}/estado-cuenta", response_model=List[schemas.TransaccionResponse], dependencies=[Depends(allow_all_staff)])
def ver_estado_cuenta(
    cliente_id: int,
    db: Session = Depends(get_db)
):
    """
    Muestra el historial financiero:
    - CARGO: Ventas (Deuda aumenta)
    - ABONO: Pagos (Deuda disminuye)
    """
    cliente = (
        db.query(models.Cliente)
        .filter(
            models.Cliente.id == cliente_id,
        )
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Traemos las transacciones ordenadas por fecha reciente
    movimientos = db.query(models.TransaccionCliente)\
        .filter(
            models.TransaccionCliente.cliente_id == cliente_id,
        )\
        .order_by(models.TransaccionCliente.fecha.desc())\
        .all()

    return movimientos

# --- 5. REGISTRAR PAGO (SOLO ADMIN/ASISTENTE) ---
@router.post("/{cliente_id}/registrar-pago", dependencies=[Depends(allow_admin_asistente)])
def registrar_pago_cliente(
    cliente_id: int,
    monto: Decimal,
    descripcion: str = "Abono a cuenta",
    nota_id: int = None, # Opcional: Si el pago es específico para una nota
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    """
    Registra un pago del cliente (ABONO).
    Esto reduce la deuda en 'saldo_actual' y crea un registro histórico.
    """
    # Lock pesimista para serializar pagos concurrentes (evita lost-update
    # en saldo_actual cuando dos pagos llegan al mismo cliente).
    cliente = (
        db.query(models.Cliente)
        .filter(
            models.Cliente.id == cliente_id,
        )
        .with_for_update()
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto del pago debe ser mayor a 0")

    try:
        # 1. Crear la transacción de ABONO
        nuevo_abono = models.TransaccionCliente(
            cliente_id=cliente.id,
            tipo=models.TipoMovimiento.ABONO,
            monto=monto,
            descripcion=f"PAGO RECIBIDO: {descripcion} (Reg. por {current_user.nombre})",
            referencia_id=nota_id # Puede ser null
        )
        db.add(nuevo_abono)

        # 2. Actualizar el saldo del cliente
        # Nota: Al ser abono, RESTAMOS al saldo (Saldo positivo = Deuda)
        cliente.saldo_actual -= monto

        db.commit()

        return {
            "mensaje": "Pago registrado exitosamente",
            "nuevo_saldo": cliente.saldo_actual,
            "transaccion_id": nuevo_abono.id
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("clientes.registrar_pago_cliente falló")
        raise HTTPException(500, detail=f"{type(e).__name__}: {e}")


# --- 4. RECONCILIACIÓN DE SALDO ---
@router.get("/{cliente_id}/saldo-reconciliacion", dependencies=[Depends(allow_admin_asistente)])
def saldo_reconciliacion(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    """Compara saldo_actual contra la suma neta de TransaccionCliente.

    Útil para detectar drift por borrado manual de filas, rollback parcial
    de transacciones, o cualquier escenario donde el campo cacheado en
    Cliente quede desincronizado con la fuente de verdad (transacciones).
    """
    cliente = db.get(models.Cliente, cliente_id)
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    saldo_cacheado = Decimal(cliente.saldo_actual or 0)
    saldo_calculado = Decimal("0")
    for t in cliente.transacciones:
        if t.tipo == models.TipoMovimiento.CARGO:
            saldo_calculado += Decimal(t.monto or 0)
        elif t.tipo == models.TipoMovimiento.ABONO:
            saldo_calculado -= Decimal(t.monto or 0)

    diferencia = (saldo_cacheado - saldo_calculado).quantize(Decimal("0.01"))
    return {
        "cliente_id": cliente.id,
        "nombre_empresa": cliente.nombre_empresa,
        "saldo_cacheado": saldo_cacheado,
        "saldo_calculado": saldo_calculado.quantize(Decimal("0.01")),
        "diferencia": diferencia,
        "en_sincronia": diferencia == 0,
        "n_transacciones": len(cliente.transacciones),
    }


@router.post("/{cliente_id}/saldo-reconciliacion/aplicar", dependencies=[Depends(allow_admin_asistente)])
def aplicar_reconciliacion(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    """Reescribe saldo_actual con el saldo calculado desde transacciones.

    Acción destructiva; solo admin/gerente. Usar después de revisar el
    reporte de /saldo-reconciliacion y aceptar el drift detectado.
    """
    cliente = db.get(models.Cliente, cliente_id)
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    try:
        saldo_calculado = Decimal("0")
        for t in cliente.transacciones:
            if t.tipo == models.TipoMovimiento.CARGO:
                saldo_calculado += Decimal(t.monto or 0)
            elif t.tipo == models.TipoMovimiento.ABONO:
                saldo_calculado -= Decimal(t.monto or 0)

        saldo_anterior = cliente.saldo_actual
        cliente.saldo_actual = saldo_calculado.quantize(Decimal("0.01"))
        db.commit()
        return {
            "cliente_id": cliente.id,
            "saldo_anterior": saldo_anterior,
            "saldo_nuevo": cliente.saldo_actual,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.aplicar_reconciliacion falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


    # Plantilla HTML para Estado de Cuenta
PDF_TEMPLATE_EDO_CTA = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Estado de Cuenta - {{ cliente.nombre_empresa }}</title>
    <style>
        body { font-family: Arial, sans-serif; color: #333; padding: 30px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; }
        .client-box { background: #f8fafc; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #1e3a8a; color: white; padding: 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #eee; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .cargo { color: #dc2626; } /* Rojo */
        .abono { color: #16a34a; } /* Verde */
        .saldo-final { margin-top: 20px; text-align: right; font-size: 16px; font-weight: bold; padding: 10px; background: #eff6ff; }
    </style>
</head>
<body onload="window.print()">
    <div class="header">
        <div>
            <div class="title">DASIC ERP</div>
            <div>Soluciones Industriales S.A. de C.V.</div>
        </div>
        <div style="text-align: right;">
            <div class="title">ESTADO DE CUENTA</div>
            <div>Fecha Emisión: {{ fecha_hoy }}</div>
        </div>
    </div>

    <div class="client-box">
        <strong>Cliente:</strong> {{ cliente.nombre_empresa }}<br>
        <strong>Atención:</strong> {{ cliente.contacto_nombre }}<br>
        <strong>RFC:</strong> {{ cliente.rfc_tax_id or "N/A" }} | <strong>Tel:</strong> {{ cliente.telefono }}
    </div>

    <table>
        <thead>
            <tr>
                <th width="15%">Fecha</th>
                <th width="40%">Concepto / Referencia</th>
                <th width="15%" class="text-right">Cargos (Ventas)</th>
                <th width="15%" class="text-right">Abonos (Pagos)</th>
                <th width="15%" class="text-right">Saldo Acumulado</th>
            </tr>
        </thead>
        <tbody>
            {# Lógica para calcular saldo acumulado línea por línea #}
            {% set ns = namespace(saldo=0) %}
            
            {% for m in movimientos %}
                {% if m.tipo.value == 'cargo' %}
                    {% set ns.saldo = ns.saldo + m.monto %}
                {% else %}
                    {% set ns.saldo = ns.saldo - m.monto %}
                {% endif %}
            <tr>
                <td>{{ m.fecha.strftime('%d/%m/%Y') }}</td>
                <td>{{ m.descripcion }}</td>
                <td class="text-right cargo">
                    {% if m.tipo.value == 'cargo' %}${{ "{:,.2f}".format(m.monto) }}{% else %}-{% endif %}
                </td>
                <td class="text-right abono">
                    {% if m.tipo.value == 'abono' %}${{ "{:,.2f}".format(m.monto) }}{% else %}-{% endif %}
                </td>
                <td class="text-right font-bold">${{ "{:,.2f}".format(ns.saldo) }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <div class="saldo-final">
        Saldo Total Pendiente: ${{ "{:,.2f}".format(cliente.saldo_actual) }}
    </div>
</body>
</html>
"""

@router.get("/{cliente_id}/pdf-estado-cuenta", response_class=HTMLResponse, dependencies=[Depends(allow_all_staff)])
def generar_pdf_estado_cuenta(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(models.Cliente)
        .filter(
            models.Cliente.id == cliente_id,
        )
        .first()
    )
    if not cliente: raise HTTPException(404, "Cliente no encontrado")

    # Traemos movimientos antiguos primero para calcular el saldo histórico correctamente
    movimientos = db.query(models.TransaccionCliente)\
        .filter(
            models.TransaccionCliente.cliente_id == cliente_id,
        )\
        .order_by(models.TransaccionCliente.fecha.asc())\
        .all()

    env = Environment(loader=BaseLoader())
    return env.from_string(PDF_TEMPLATE_EDO_CTA).render(
        cliente=cliente,
        movimientos=movimientos,
        fecha_hoy=datetime.now().strftime('%d/%m/%Y %H:%M')
    )


# --- CRM CxC: cargos abiertos + pago distribuido (Fase 6) ---

@router.get("/{cliente_id}/cuentas-por-cobrar", dependencies=[Depends(allow_all_staff)])
def cuentas_por_cobrar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    """Lista los cargos (CxC) del cliente con estatus_pago + saldo pendiente."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.cliente_id == cliente_id)
        .filter(models.TransaccionCliente.tipo == models.TipoMovimiento.CARGO)
        .order_by(models.TransaccionCliente.fecha.desc())
        .all()
    )
    from decimal import Decimal
    hoy = hoy_negocio()

    def _saldo(r):
        return float(Decimal(r.monto or 0) - Decimal(r.monto_pagado or 0))

    return {
        "cliente": {
            "id": cliente.id,
            "nombre_empresa": cliente.nombre_empresa,
            "saldo_actual": float(cliente.saldo_actual or 0),
            "limite_credito": float(cliente.limite_credito or 0),
            "dias_credito": int(cliente.dias_credito or 0),
            "moneda_credito": cliente.moneda_credito,
        },
        "cargos": [
            {
                "id": r.id,
                "orden_venta_id": r.orden_venta_id,
                "folio": (r.orden_venta.folio if r.orden_venta else None),
                "fecha": r.fecha.isoformat() if r.fecha else None,
                "fecha_vencimiento": r.fecha_vencimiento.isoformat() if r.fecha_vencimiento else None,
                "descripcion": r.descripcion,
                "monto": float(r.monto or 0),
                "monto_pagado": float(r.monto_pagado or 0),
                "saldo_pendiente": _saldo(r),
                "estatus_pago": r.estatus_pago,
                "dias_atraso": (hoy - r.fecha_vencimiento).days if r.fecha_vencimiento and r.fecha_vencimiento < hoy and (r.estatus_pago != "pagado") else 0,
            }
            for r in rows
        ],
    }


@router.post("/{cliente_id}/pago-distribuido", dependencies=[Depends(allow_admin_asistente)])
def registrar_pago_distribuido(
    cliente_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    """Registra un pago aplicándolo a CxC (FIFO por defecto o explícito).

    Body:
      {
        "monto": 5000.00,
        "descripcion": "Transferencia OXXO 12345" (opcional),
        "orden_venta_ids": [12, 15]  (opcional; sin esto = FIFO)
      }
    """
    from app.services.cuentas_por_cobrar import aplicar_pago
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    try:
        from decimal import Decimal
        monto = Decimal(str(payload.get("monto", 0)))
        result = aplicar_pago(
            db,
            cliente=cliente,
            monto=monto,
            descripcion=payload.get("descripcion"),
            orden_venta_ids=payload.get("orden_venta_ids"),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.commit()
    return {"ok": True, **result}


# --- CONTACTOS (personas por empresa) ---

def _sync_contacto_principal(db: Session, cliente, contacto) -> None:
    """Desmarca otros principales de la empresa y sincroniza el trío
    denormalizado del cliente (lo que leen picker/PDF) desde el contacto."""
    db.query(models.Contacto).filter(
        models.Contacto.cliente_id == cliente.id,
        models.Contacto.id != contacto.id,
    ).update({models.Contacto.es_principal: False})
    cliente.contacto_nombre = contacto.nombre
    cliente.email = contacto.email
    cliente.telefono = contacto.telefono


@router.get("/{cliente_id}/contactos", response_model=List[schemas.ContactoResponse], dependencies=[Depends(allow_all_staff)])
def listar_contactos(cliente_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Contacto)
        .filter(models.Contacto.cliente_id == cliente_id)
        .order_by(models.Contacto.es_principal.desc(), models.Contacto.nombre.asc())
        .all()
    )


@router.post("/{cliente_id}/contactos", response_model=schemas.ContactoResponse, dependencies=[Depends(allow_all_staff)])
def crear_contacto(cliente_id: int, payload: schemas.ContactoCreate, db: Session = Depends(get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Empresa no encontrada")
    try:
        c = models.Contacto(
            cliente_id=cliente_id,
            nombre=payload.nombre.strip(),
            cargo=(payload.cargo or None),
            email=(payload.email or None),
            telefono=(payload.telefono or None),
            es_principal=bool(payload.es_principal),
        )
        db.add(c)
        db.flush()
        if c.es_principal:
            _sync_contacto_principal(db, cliente, c)
        db.commit()
        db.refresh(c)
        return c
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.crear_contacto falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.patch("/{cliente_id}/contactos/{contacto_id}", response_model=schemas.ContactoResponse, dependencies=[Depends(allow_all_staff)])
def actualizar_contacto(cliente_id: int, contacto_id: int, payload: schemas.ContactoUpdate, db: Session = Depends(get_db)):
    c = (
        db.query(models.Contacto)
        .filter(models.Contacto.id == contacto_id, models.Contacto.cliente_id == cliente_id)
        .first()
    )
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    try:
        data = payload.model_dump(exclude_unset=True)
        if "nombre" in data and data["nombre"]:
            data["nombre"] = data["nombre"].strip()
        for k, v in data.items():
            setattr(c, k, v)
        db.flush()
        if c.es_principal:
            cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
            if cliente:
                _sync_contacto_principal(db, cliente, c)
        db.commit()
        db.refresh(c)
        return c
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("clientes.actualizar_contacto falló")
        raise HTTPException(500, detail=f"{type(exc).__name__}: {exc}")


@router.delete("/{cliente_id}/contactos/{contacto_id}", dependencies=[Depends(allow_all_staff)])
def eliminar_contacto(cliente_id: int, contacto_id: int, db: Session = Depends(get_db)):
    c = (
        db.query(models.Contacto)
        .filter(models.Contacto.id == contacto_id, models.Contacto.cliente_id == cliente_id)
        .first()
    )
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/{cliente_id}/ordenes", dependencies=[Depends(allow_all_staff)])
def ordenes_de_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Historial de cotizaciones/órdenes de la empresa (folio, fecha, estatus, total)."""
    query = db.query(models.OrdenVenta).filter(models.OrdenVenta.cliente_id == cliente_id)
    # Owner-scope: VENTAS solo ve sus propias órdenes (mismo patrón que ventas.py).
    if is_owner_scoped(current_user, "read", "cotizacion"):
        query = query.filter(models.OrdenVenta.vendedor_id == current_user.id)
    rows = query.order_by(models.OrdenVenta.fecha_creacion.desc()).all()
    return [
        {
            "id": o.id,
            "folio": o.folio,
            "fecha": o.fecha_creacion.isoformat() if o.fecha_creacion else None,
            "estatus": str(o.estatus.value if hasattr(o.estatus, "value") else o.estatus),
            "total": float(o.total) if getattr(o, "total", None) is not None else 0.0,
            "moneda": o.moneda,
        }
        for o in rows
    ]
