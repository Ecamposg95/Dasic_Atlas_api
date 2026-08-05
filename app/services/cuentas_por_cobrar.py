"""Servicio CRM: cuentas por cobrar (cargos vinculados a ventas + pagos).

Funciones expuestas:
  - crear_cargo_por_venta(db, orden_venta, monto, ...)
  - aplicar_pago(db, cliente, monto, orden_venta_ids=None)
  - recalcular_estatus_pago(db, cargo)
  - marcar_vencidos(db, org_id=None)   # uso de cron / job diario
  - listar_vencimientos(db, dias=7)

Reglas:
  - Estatus: pendiente | parcial | pagado | vencido
  - vencido se calcula con fecha_vencimiento < hoy y estatus != pagado
  - Distribución de pagos: FIFO sobre cargos abiertos del cliente, o explícita
    si se pasan IDs.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app import models
from app.models.enums import TipoMovimiento


def _hoy() -> date:
    return datetime.utcnow().date()


def crear_cargo_por_venta(
    db: Session,
    *,
    orden_venta: "models.OrdenVenta",
    monto: Decimal,
    descripcion: Optional[str] = None,
) -> "models.TransaccionCliente":
    """Crea un CARGO en cuentas por cobrar ligado a una venta.

    Calcula fecha_vencimiento a partir de cliente.dias_credito. Si dias_credito
    es 0, queda con vencimiento = hoy (cargo a contado).
    """
    cliente = orden_venta.cliente
    dias = int(cliente.dias_credito or 0)
    fecha_venc = _hoy() + timedelta(days=dias)

    tx = models.TransaccionCliente(
        cliente_id=cliente.id,
        tipo=TipoMovimiento.CARGO,
        monto=Decimal(monto),
        descripcion=descripcion or f"Venta {orden_venta.folio}",
        referencia_id=orden_venta.id,  # compat
        orden_venta_id=orden_venta.id,
        fecha_vencimiento=fecha_venc,
        estatus_pago="pendiente",
        monto_pagado=Decimal("0"),
    )
    db.add(tx)
    cliente.saldo_actual = (cliente.saldo_actual or Decimal("0")) + Decimal(monto)
    return tx


def recalcular_estatus_pago(db: Session, cargo: "models.TransaccionCliente") -> str:
    """Recalcula estatus_pago en base a monto_pagado / monto y vencimiento."""
    if cargo.tipo != TipoMovimiento.CARGO:
        return cargo.estatus_pago or "pendiente"
    monto = Decimal(cargo.monto or 0)
    pagado = Decimal(cargo.monto_pagado or 0)
    if pagado >= monto:
        cargo.estatus_pago = "pagado"
    elif pagado > 0:
        cargo.estatus_pago = "parcial"
    else:
        cargo.estatus_pago = "pendiente"

    # Sobre-escribe a 'vencido' si aplica (solo si no está pagado)
    if cargo.estatus_pago != "pagado":
        if cargo.fecha_vencimiento and cargo.fecha_vencimiento < _hoy():
            cargo.estatus_pago = "vencido"
    return cargo.estatus_pago


def _cargos_abiertos(db: Session, cliente_id: int) -> list["models.TransaccionCliente"]:
    """Cargos con saldo > 0, ordenados por fecha de vencimiento (FIFO real)."""
    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.cliente_id == cliente_id)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.estatus_pago != "pagado")
        .order_by(
            models.TransaccionCliente.fecha_vencimiento.asc().nullsfirst(),
            models.TransaccionCliente.fecha.asc(),
        )
        .all()
    )
    abiertos = []
    for r in rows:
        saldo = Decimal(r.monto or 0) - Decimal(r.monto_pagado or 0)
        if saldo > 0:
            abiertos.append(r)
    return abiertos


def aplicar_pago(
    db: Session,
    *,
    cliente: "models.Cliente",
    monto: Decimal,
    descripcion: Optional[str] = None,
    orden_venta_ids: Optional[Iterable[int]] = None,
) -> dict:
    """Aplica un pago al cliente, distribuyendo sobre cargos abiertos.

    Si `orden_venta_ids` se proporciona, distribuye en ese orden. Si no, FIFO.
    Si sobra (pago en exceso), registra un ABONO sobrante sin cargo asociado.

    Crea siempre 1 fila ABONO global (asentamiento) y actualiza monto_pagado en
    los CARGOs afectados.
    """
    monto_total = Decimal(monto)
    if monto_total <= 0:
        raise ValueError("Monto debe ser > 0")

    # Lock pesimista sobre el cliente para serializar pagos concurrentes y
    # evitar lost-update en saldo_actual.
    #
    # `populate_existing()` NO es opcional: los routers cargan el cliente antes
    # de llamar aquí (`clientes.py`), así que la instancia ya está en el
    # identity map de la sesión con el saldo leído ANTES de esperar el lock.
    # Sin él, SQLAlchemy ejecuta el SELECT ... FOR UPDATE —el lock se toma y
    # se respeta— pero devuelve el objeto en memoria SIN refrescar sus
    # atributos, así que se calcula el saldo nuevo sobre el valor viejo y el
    # segundo pago pisa al primero. El lock queda correcto y el dinero mal:
    # dos pagos de 600 sobre una deuda de 1000 dejaban el saldo en 400 en vez
    # de −200. Cubierto por `tests/test_cobranza_concurrencia.py`.
    cliente_locked = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente.id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if cliente_locked is None:
        raise ValueError("Cliente no encontrado")
    cliente = cliente_locked

    if orden_venta_ids:
        explicit = list(orden_venta_ids)
        rows_q = (
            db.query(models.TransaccionCliente)
            .filter(models.TransaccionCliente.cliente_id == cliente.id)
            .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
            .filter(models.TransaccionCliente.orden_venta_id.in_(explicit))
            .all()
        )
        # Mantén orden de IDs entrantes
        rows_by_ov = {r.orden_venta_id: r for r in rows_q}
        cola = [rows_by_ov[ov] for ov in explicit if ov in rows_by_ov]
    else:
        cola = _cargos_abiertos(db, cliente.id)

    aplicado = Decimal("0")
    detalle = []
    restante = monto_total
    for cargo in cola:
        if restante <= 0:
            break
        saldo = Decimal(cargo.monto or 0) - Decimal(cargo.monto_pagado or 0)
        if saldo <= 0:
            continue
        toma = min(restante, saldo)
        cargo.monto_pagado = (Decimal(cargo.monto_pagado or 0) + toma).quantize(Decimal("0.01"))
        recalcular_estatus_pago(db, cargo)
        aplicado += toma
        restante -= toma
        detalle.append({
            "transaccion_cliente_id": cargo.id,
            "orden_venta_id": cargo.orden_venta_id,
            "aplicado": float(toma),
            "estatus_pago": cargo.estatus_pago,
        })

    abono = models.TransaccionCliente(
        cliente_id=cliente.id,
        tipo=TipoMovimiento.ABONO,
        monto=monto_total,
        descripcion=descripcion or "Pago cliente",
        estatus_pago="pagado",
        monto_pagado=monto_total,
    )
    db.add(abono)
    cliente.saldo_actual = (cliente.saldo_actual or Decimal("0")) - monto_total
    return {
        "pago_id": None,  # se llena tras flush si el caller lo necesita
        "monto_aplicado": float(aplicado),
        "monto_excedente": float(max(restante, Decimal("0"))),
        "detalle": detalle,
    }


def marcar_vencidos(db: Session) -> int:
    """Job idempotente: marca como 'vencido' los CARGOs con fecha_vencimiento <
    hoy y estatus distinto a 'pagado' / 'vencido'."""
    hoy = _hoy()
    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.fecha_vencimiento.is_not(None))
        .filter(models.TransaccionCliente.fecha_vencimiento < hoy)
        .filter(models.TransaccionCliente.estatus_pago.notin_(["pagado", "vencido"]))
        .all()
    )
    n = 0
    for r in rows:
        r.estatus_pago = "vencido"
        n += 1
    if n:
        db.commit()
    return n


def calcular_aging(db: Session) -> dict:
    """Agrupa todos los CARGOs abiertos en 4 buckets de antigüedad.

    Buckets:
      0-30d  → dias_atraso entre 0 y 30 (incluye cargos aún vigentes)
      31-60d → 31-60
      61-90d → 61-90
      90+    → >= 91

    Devuelve un dict con ``buckets`` (lista siempre de 4 items) + ``total`` +
    ``total_count``.  Usa la misma lógica de ``dias_atraso`` que
    ``listar_vencimientos``: si ``fecha_vencimiento`` existe y es anterior a
    hoy → ``(hoy - fecha_vencimiento).days``; en caso contrario → 0.
    """
    hoy = _hoy()

    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.estatus_pago != "pagado")
        .all()
    )

    # Definición de buckets en orden canónico
    _BUCKETS = [
        {"rango": "0-30",  "dias_min": 0,  "dias_max": 30,  "monto": 0.0, "count": 0},
        {"rango": "31-60", "dias_min": 31, "dias_max": 60,  "monto": 0.0, "count": 0},
        {"rango": "61-90", "dias_min": 61, "dias_max": 90,  "monto": 0.0, "count": 0},
        {"rango": "90+",   "dias_min": 91, "dias_max": None, "monto": 0.0, "count": 0},
    ]

    total = 0.0

    for r in rows:
        saldo = float(Decimal(r.monto or 0) - Decimal(r.monto_pagado or 0))
        if saldo <= 0:
            continue

        # Misma lógica que listar_vencimientos
        if r.fecha_vencimiento and r.fecha_vencimiento < hoy:
            dias_atraso = (hoy - r.fecha_vencimiento).days
        else:
            dias_atraso = 0

        # Asignar bucket
        if dias_atraso <= 30:
            idx = 0
        elif dias_atraso <= 60:
            idx = 1
        elif dias_atraso <= 90:
            idx = 2
        else:
            idx = 3

        _BUCKETS[idx]["monto"] += saldo
        _BUCKETS[idx]["count"] += 1
        total += saldo

    return {
        "buckets": _BUCKETS,
        "total": round(total, 2),
        "total_count": sum(b["count"] for b in _BUCKETS),
    }


def top_deudores(db: Session, *, limit: int = 10) -> list[dict]:
    """Top N clientes por saldo abierto real (suma de CARGOs con saldo > 0).

    Calcula desde las transacciones reales (no confía en ``cliente.saldo_actual``),
    de modo que los montos estén en sintonía con el aging.  Devuelve la lista
    ordenada de mayor a menor saldo, con:
      - ``cliente_id``
      - ``nombre_empresa``  (join a clientes — batch con IN, sin N+1)
      - ``saldo``           (total open saldo del cliente)
      - ``dias_max_atraso`` (máximo días de atraso entre sus cargos abiertos)
      - ``n_cargos_abiertos``
    """
    hoy = _hoy()

    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.estatus_pago != "pagado")
        .all()
    )

    # Agregar por cliente en Python (DB puede ser pequeña; evita SQL complejo)
    from collections import defaultdict
    agg: dict[int, dict] = defaultdict(lambda: {"saldo": 0.0, "dias_max_atraso": 0, "n_cargos_abiertos": 0})

    for r in rows:
        saldo = float(Decimal(r.monto or 0) - Decimal(r.monto_pagado or 0))
        if saldo <= 0:
            continue

        if r.fecha_vencimiento and r.fecha_vencimiento < hoy:
            dias_atraso = (hoy - r.fecha_vencimiento).days
        else:
            dias_atraso = 0

        bucket = agg[r.cliente_id]
        bucket["saldo"] += saldo
        bucket["n_cargos_abiertos"] += 1
        if dias_atraso > bucket["dias_max_atraso"]:
            bucket["dias_max_atraso"] = dias_atraso

    if not agg:
        return []

    # Ordenar por saldo DESC y tomar top N
    sorted_ids = sorted(agg.keys(), key=lambda cid: agg[cid]["saldo"], reverse=True)[:limit]

    # Batch-fetch nombres — single IN query, sin N+1
    clientes = (
        db.query(models.Cliente.id, models.Cliente.nombre_empresa)
        .filter(models.Cliente.id.in_(sorted_ids))
        .all()
    )
    nombre_by_id = {c.id: c.nombre_empresa for c in clientes}

    result = []
    for cid in sorted_ids:
        datos = agg[cid]
        result.append({
            "cliente_id": cid,
            "nombre_empresa": nombre_by_id.get(cid, f"Cliente #{cid}"),
            "saldo": round(datos["saldo"], 2),
            "dias_max_atraso": datos["dias_max_atraso"],
            "n_cargos_abiertos": datos["n_cargos_abiertos"],
        })

    return result


def listar_vencimientos(db: Session, *, dias: int = 7) -> list[dict]:
    """Lista CARGOs por vencer (en N días) o ya vencidos, agrupados por cliente."""
    hoy = _hoy()
    limite = hoy + timedelta(days=dias)
    rows = (
        db.query(models.TransaccionCliente)
        .filter(models.TransaccionCliente.tipo == TipoMovimiento.CARGO)
        .filter(models.TransaccionCliente.estatus_pago != "pagado")
        .filter(
            (models.TransaccionCliente.fecha_vencimiento.is_(None))
            | (models.TransaccionCliente.fecha_vencimiento <= limite)
        )
        .order_by(models.TransaccionCliente.fecha_vencimiento.asc().nullslast())
        .all()
    )
    out = []
    for r in rows:
        saldo = float(Decimal(r.monto or 0) - Decimal(r.monto_pagado or 0))
        out.append({
            "id": r.id,
            "cliente_id": r.cliente_id,
            "cliente": r.cliente.nombre_empresa if r.cliente else None,
            "orden_venta_id": r.orden_venta_id,
            "fecha": r.fecha.isoformat() if r.fecha else None,
            "fecha_vencimiento": r.fecha_vencimiento.isoformat() if r.fecha_vencimiento else None,
            "monto": float(r.monto or 0),
            "monto_pagado": float(r.monto_pagado or 0),
            "saldo_pendiente": saldo,
            "estatus_pago": r.estatus_pago,
            "dias_atraso": (hoy - r.fecha_vencimiento).days if r.fecha_vencimiento and r.fecha_vencimiento < hoy else 0,
        })
    return out
