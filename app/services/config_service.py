"""Lectura tipada de PlatformConfig con defaults."""
from sqlalchemy.orm import Session
from app import models


def get(db: Session, clave: str, default: str | None = None) -> str | None:
    row = db.query(models.PlatformConfig).filter(models.PlatformConfig.clave == clave).first()
    return row.valor if row and row.valor is not None else default


def stock_evento_descuento(db: Session) -> str:
    v = (get(db, "stock_evento_descuento", "venta") or "venta").strip().lower()
    return v if v in ("venta", "remision") else "venta"


def empresa_nombre(db: Session) -> str:
    return get(db, "empresa_nombre", "DASIC Industrial")
