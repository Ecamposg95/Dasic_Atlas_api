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
