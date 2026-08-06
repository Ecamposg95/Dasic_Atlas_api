"""Router de tipo de cambio."""

from datetime import date as _date, datetime as _datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, condecimal
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.security import allow_all_staff, get_current_user
from app.security.jwt import allow_admin
from app.services.fx_service import get_or_fetch, FXError
from app.core.fechas import hoy_negocio

router = APIRouter(prefix="/api/fx", tags=["Tipo de cambio"])


@router.get(
    "/usd-mxn",
    response_model=schemas.TipoCambioDiaResponse,
    dependencies=[Depends(allow_all_staff)],
)
def usd_mxn(
    fecha: Optional[_date] = Query(None, description="YYYY-MM-DD; default hoy"),
    db: Session = Depends(get_db),
):
    try:
        return get_or_fetch(db, fecha=fecha)
    except FXError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post(
    "/refresh",
    response_model=schemas.TipoCambioDiaResponse,
    dependencies=[Depends(allow_all_staff)],
)
def refresh(db: Session = Depends(get_db)):
    """Refresca TC del día desde la fuente externa. No es destructivo (sólo
    actualiza la cache); cualquier staff puede dispararlo.

    Respeta overrides MANUAL — si el TC del día tiene fuente=MANUAL, no se
    sobreescribe."""
    existing = (
        db.query(models.TipoCambioDia)
        .filter(models.TipoCambioDia.fecha == hoy_negocio())
        .first()
    )
    if existing and existing.fuente == "MANUAL":
        return existing
    try:
        return get_or_fetch(db, force=True)
    except FXError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


class _FXOverrideIn(BaseModel):
    fecha: _date
    usd_mxn: condecimal(gt=0)
    nota: Optional[str] = None


@router.post(
    "/override",
    response_model=schemas.TipoCambioDiaResponse,
    dependencies=[Depends(allow_admin)],
)
def override_tc_del_dia(
    payload: _FXOverrideIn,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Pisar el TC del día con un valor manual. Solo admin.

    Crea o sobreescribe la fila de `tipos_cambio_dia` para `fecha` con fuente
    MANUAL. Las cotizaciones existentes NO se tocan (cada cotización guarda
    su propio `tipo_cambio`); solo afecta a cotizaciones nuevas que pidan
    el TC del día."""
    if not (1.0 <= float(payload.usd_mxn) <= 100.0):
        raise HTTPException(400, "usd_mxn fuera de rango (1.0 a 100.0)")

    row = (
        db.query(models.TipoCambioDia)
        .filter(models.TipoCambioDia.fecha == payload.fecha)
        .first()
    )
    if row:
        row.usd_mxn = payload.usd_mxn
        row.fuente = "MANUAL"
        row.nota = payload.nota
        row.actualizado_por = current_user.id
        row.obtenido_en = _datetime.utcnow()
    else:
        row = models.TipoCambioDia(
            fecha=payload.fecha,
            usd_mxn=payload.usd_mxn,
            fuente="MANUAL",
            nota=payload.nota,
            actualizado_por=current_user.id,
        )
        db.add(row)

    db.commit()
    db.refresh(row)

    import logging
    logging.getLogger(__name__).warning(
        "FX override aplicado: fecha=%s usd_mxn=%s por user_id=%s",
        payload.fecha, payload.usd_mxn, current_user.id,
    )
    return row


@router.get(
    "/historico",
    dependencies=[Depends(allow_all_staff)],
)
def fx_historico(
    dias: int = Query(30, ge=1, le=365, description="Días hacia atrás; default 30, max 365"),
    db: Session = Depends(get_db),
):
    """Histórico de TC USD/MXN en los últimos N días."""
    from datetime import timedelta
    desde = hoy_negocio() - timedelta(days=dias)
    rows = (
        db.query(models.TipoCambioDia)
        .filter(models.TipoCambioDia.fecha >= desde)
        .order_by(models.TipoCambioDia.fecha.desc())
        .all()
    )
    return {
        "dias": dias,
        "items": [
            {
                "fecha": r.fecha.isoformat(),
                "usd_mxn": float(r.usd_mxn),
                "fuente": r.fuente,
                "nota": getattr(r, "nota", None),
                "actualizado_por": getattr(r, "actualizado_por", None),
                "obtenido_en": r.obtenido_en.isoformat() if r.obtenido_en else None,
            }
            for r in rows
        ],
    }
