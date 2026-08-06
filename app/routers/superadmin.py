"""Consola super-admin: configuración en runtime + auditoría global + salud + mantenimiento."""
import json
import os
import platform
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import models
from app.db import get_db
from app.security import get_current_user
from app.security.jwt import allow_superadmin
from app.core.runtime_config import EDITABLE_KEYS, effective_summary
from app.core.config import get_settings
from app.core.fechas import hoy_negocio

router = APIRouter(prefix="/api/superadmin", tags=["Super-Admin"])


class ConfigSet(BaseModel):
    clave: str
    valor: str | None  # null = borra el override (vuelve al default)


def _validar(clave: str, valor: str | None) -> None:
    if clave not in EDITABLE_KEYS:
        raise HTTPException(400, f"Clave no editable: {clave}")
    if valor is None:
        return
    if clave == "iva_rate":
        try:
            v = Decimal(str(valor))
        except (InvalidOperation, ValueError):
            raise HTTPException(400, "iva_rate debe ser número (ej. 0.16)")
        if v < 0 or v > 1:
            raise HTTPException(400, "iva_rate debe estar entre 0 y 1")
    elif clave == "quote_validity_days":
        try:
            n = int(valor)
        except (ValueError, TypeError):
            raise HTTPException(400, "quote_validity_days debe ser entero")
        if n < 1:
            raise HTTPException(400, "quote_validity_days debe ser ≥ 1")


@router.get("/config", dependencies=[Depends(allow_superadmin)])
def get_config(db: Session = Depends(get_db)):
    return {"items": effective_summary(db)}


@router.put("/config", dependencies=[Depends(allow_superadmin)])
def set_config(
    payload: ConfigSet,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    _validar(payload.clave, payload.valor)
    row = db.query(models.PlatformConfig).filter(models.PlatformConfig.clave == payload.clave).first()
    if payload.valor is None:
        if row:
            db.delete(row)
    else:
        if row:
            row.valor = payload.valor
            row.actualizado_por_id = current_user.id
        else:
            db.add(models.PlatformConfig(clave=payload.clave, valor=payload.valor, actualizado_por_id=current_user.id))
    db.commit()
    return {"items": effective_summary(db)}


# ---------------------------------------------------------------------------
# Auditoría global (Módulo B): agrega eventos ya registrados, read-only.
# ---------------------------------------------------------------------------

class AuditEvent(BaseModel):
    fuente: Literal["cotizacion", "fusion_cliente"]
    fecha: datetime
    usuario: str | None
    usuario_id: int | None
    accion: str
    entidad: str
    detalle: str
    link: str | None


def _accion_quote(canal: str | None, estatus: str | None, meta: dict) -> str:
    c = (canal or "").upper()
    if c == "NOTE":
        acc = str(meta.get("accion") or "").lower()
        return "Cotización recotizada" if "recotiz" in acc else "Cotización editada"
    if c == "EMAIL":
        return "Email falló" if (estatus or "").upper() == "FAILED" else "Email enviado"
    if c == "WHATSAPP":
        return "WhatsApp registrado"
    if c == "IA":
        return "Sugerencia IA"
    return f"Evento {c or '—'}"


def _detalle_quote(asunto: str | None, meta: dict) -> str:
    if asunto:
        return asunto
    ta, tn = meta.get("total_anterior"), meta.get("total_nuevo")
    if ta is not None and tn is not None:
        return f"Total {ta} → {tn}"
    if meta.get("sugerencia"):
        return str(meta["sugerencia"])[:160]
    return ""


def _normalize_quote_event(ev, folio_map: dict, nombre_map: dict) -> AuditEvent:
    try:
        meta = json.loads(ev.metadata_json) if ev.metadata_json else {}
        if not isinstance(meta, dict):
            meta = {}
    except Exception:
        meta = {}
    folio = folio_map.get(ev.orden_id)
    return AuditEvent(
        fuente="cotizacion",
        fecha=ev.creado_en,
        usuario=(nombre_map.get(ev.creado_por_id) or "—") if ev.creado_por_id else "—",
        usuario_id=ev.creado_por_id,
        accion=_accion_quote(ev.canal, ev.estatus, meta),
        entidad=folio or f"Cotización #{ev.orden_id}",
        detalle=_detalle_quote(ev.asunto, meta),
        link=f"/spa/seguimiento?orden={ev.orden_id}",
    )


def _normalize_merge_log(row, nombre_map: dict) -> AuditEvent:
    detalle = (
        f"{row.loser_nombre or 'Empresa'} "
        f"(RFC {row.loser_rfc or '—'}, saldo {row.loser_saldo if row.loser_saldo is not None else 0}, "
        f"{row.n_ordenes or 0} órdenes) → survivor #{row.survivor_id}"
    )
    return AuditEvent(
        fuente="fusion_cliente",
        fecha=row.merged_at,
        usuario=(nombre_map.get(row.merged_by_id) or "—") if row.merged_by_id else "—",
        usuario_id=row.merged_by_id,
        accion="Empresas fusionadas",
        entidad=f"Empresa #{row.survivor_id}",
        detalle=detalle,
        link=f"/spa/clientes?id={row.survivor_id}",
    )


@router.get("/audit", dependencies=[Depends(allow_superadmin)])
def get_audit(
    db: Session = Depends(get_db),
    fuente: Optional[Literal["cotizacion", "fusion_cliente"]] = None,
    usuario_id: Optional[int] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    # --- quote_events ---
    if fuente in (None, "cotizacion"):
        q = db.query(models.QuoteEvent)
        if usuario_id is not None:
            q = q.filter(models.QuoteEvent.creado_por_id == usuario_id)
        if desde is not None:
            q = q.filter(models.QuoteEvent.creado_en >= datetime.combine(desde, time.min))
        if hasta is not None:
            q = q.filter(models.QuoteEvent.creado_en < datetime.combine(hasta + timedelta(days=1), time.min))
        qrows = q.all()
        orden_ids = {e.orden_id for e in qrows}
        folio_map: dict = {}
        if orden_ids:
            for oid, folio in (
                db.query(models.OrdenVenta.id, models.OrdenVenta.folio)
                .filter(models.OrdenVenta.id.in_(orden_ids))
                .all()
            ):
                folio_map[oid] = folio
    else:
        qrows, folio_map = [], {}

    # --- cliente_merge_log ---
    if fuente in (None, "fusion_cliente"):
        m = db.query(models.ClienteMergeLog)
        if usuario_id is not None:
            m = m.filter(models.ClienteMergeLog.merged_by_id == usuario_id)
        if desde is not None:
            m = m.filter(models.ClienteMergeLog.merged_at >= datetime.combine(desde, time.min))
        if hasta is not None:
            m = m.filter(models.ClienteMergeLog.merged_at < datetime.combine(hasta + timedelta(days=1), time.min))
        mrows = m.all()
    else:
        mrows = []

    # --- resolución batch de nombres (sin N+1) ---
    uids = {e.creado_por_id for e in qrows if e.creado_por_id} | {
        r.merged_by_id for r in mrows if r.merged_by_id
    }
    nombre_map: dict = {}
    if uids:
        for uid, nombre in (
            db.query(models.Usuario.id, models.Usuario.nombre)
            .filter(models.Usuario.id.in_(uids))
            .all()
        ):
            nombre_map[uid] = nombre

    eventos = [_normalize_quote_event(e, folio_map, nombre_map) for e in qrows]
    eventos += [_normalize_merge_log(r, nombre_map) for r in mrows]

    # Orden fecha desc. server_default garantiza fecha no-nula.
    eventos.sort(key=lambda x: x.fecha, reverse=True)
    total = len(eventos)
    start = (page - 1) * page_size
    items = eventos[start : start + page_size]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Módulo C — Salud del sistema: GET /api/superadmin/health
# ---------------------------------------------------------------------------

@router.get("/health", dependencies=[Depends(allow_superadmin)])
def get_health(db: Session = Depends(get_db)):
    """Estado completo del sistema: app, DB, conteos, FX, integraciones, config."""
    from app.main import APP_STARTED_AT

    now = datetime.now(timezone.utc)
    settings = get_settings()

    # --- App info ---
    app_info = {
        "version": "2.0.0",
        "git_sha": os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("GIT_SHA") or None,
        "python": platform.python_version(),
        "env": (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "development"),
        "started_at": APP_STARTED_AT.isoformat(),
        "uptime_seconds": int((now - APP_STARTED_AT).total_seconds()),
    }

    # --- DB ping ---
    try:
        db.execute(text("SELECT 1"))
        db_status = {"status": "ok", "error": None}
    except Exception as exc:
        db_status = {"status": "error", "error": str(exc)}

    # --- Counts (each wrapped independently so one missing table doesn't 500) ---
    def _count(model):
        try:
            return db.query(model).count()
        except Exception:
            return -1

    counts = {
        "usuarios":          _count(models.Usuario),
        "clientes":          _count(models.Cliente),
        "contactos":         _count(models.Contacto),
        "productos":         _count(models.Producto),
        "ordenes_venta":     _count(models.OrdenVenta),
        "remisiones":        _count(models.Remision),
        "ordenes_compra":    _count(models.OrdenCompra),
        "deals":             _count(models.Deal),
        "quote_events":      _count(models.QuoteEvent),
        "gastos":            _count(models.Gasto),
        "productos_fantasma": _count(models.ProductoFantasma),
    }

    # --- FX: last row from tipos_cambio_dia ---
    fx_info = None
    try:
        last_fx = (
            db.query(models.TipoCambioDia)
            .order_by(models.TipoCambioDia.obtenido_en.desc())
            .first()
        )
        if last_fx:
            obtenido_en = last_fx.obtenido_en
            age_horas: Optional[float] = None
            if obtenido_en:
                # obtenido_en may be timezone-aware or naive; normalize
                if obtenido_en.tzinfo is None:
                    obtenido_en_aware = obtenido_en.replace(tzinfo=timezone.utc)
                else:
                    obtenido_en_aware = obtenido_en
                age_horas = round((now - obtenido_en_aware).total_seconds() / 3600, 2)
            fx_info = {
                "fecha": last_fx.fecha.isoformat() if last_fx.fecha else None,
                "usd_mxn": float(last_fx.usd_mxn) if last_fx.usd_mxn is not None else None,
                "fuente": last_fx.fuente,
                "obtenido_en": obtenido_en.isoformat() if obtenido_en else None,
                "age_horas": age_horas,
            }
    except Exception:
        fx_info = None

    # --- Integrations (presence only — never expose values) ---
    integraciones = {
        "smtp": bool(settings.smtp_host and settings.smtp_user),
        "anthropic": bool(settings.anthropic_api_key),
        "banxico": bool(os.getenv("BANXICO_TOKEN")),
    }

    return {
        "app": app_info,
        "db": db_status,
        "counts": counts,
        "fx": fx_info,
        "integraciones": integraciones,
        "runtime_config": effective_summary(db),
    }


# ---------------------------------------------------------------------------
# Módulo D — Mantenimiento: POST /api/superadmin/maintenance/*
# ---------------------------------------------------------------------------

class _WhichBody(BaseModel):
    which: str


_RESEED_MAP = {
    "ddl":        "run_backfill_ddl",
    "marcas":     "seed_marcas",
    "sat":        "seed_sat_catalogos_pequenos",
    "sat_unidad": "seed_sat_clave_unidad",
    "contactos":  "seed_contactos_principal",
    "pipeline":   "seed_default_pipeline",
}

_JOB_WHITELIST = {"marcar_vencidos", "refresh_fx"}


@router.post("/maintenance/reseed", dependencies=[Depends(allow_superadmin)])
def maintenance_reseed(payload: _WhichBody, db: Session = Depends(get_db)):
    """Re-ejecuta una función de seed específica. Claves: ddl, marcas, sat, sat_unidad, contactos, pipeline."""
    if payload.which not in _RESEED_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Clave inválida: '{payload.which}'. Opciones: {sorted(_RESEED_MAP.keys())}",
        )
    fn_name = _RESEED_MAP[payload.which]
    try:
        from app.db import seeds as _seeds
        fn = getattr(_seeds, fn_name)
        fn(db)
        return {"ok": True, "which": payload.which, "mensaje": f"{fn_name} ejecutado correctamente."}
    except Exception as exc:
        return {"ok": False, "which": payload.which, "mensaje": str(exc)}


@router.post("/maintenance/job", dependencies=[Depends(allow_superadmin)])
def maintenance_job(payload: _WhichBody, db: Session = Depends(get_db)):
    """Lanza un job puntual. Claves: marcar_vencidos, refresh_fx."""
    if payload.which not in _JOB_WHITELIST:
        raise HTTPException(
            status_code=400,
            detail=f"Clave inválida: '{payload.which}'. Opciones: {sorted(_JOB_WHITELIST)}",
        )
    try:
        if payload.which == "marcar_vencidos":
            from app.services.cuentas_por_cobrar import marcar_vencidos
            n = marcar_vencidos(db)
            return {"ok": True, "which": payload.which, "actualizados": n}
        elif payload.which == "refresh_fx":
            from app.services.fx_service import get_or_fetch
            # Respect MANUAL override: don't overwrite if today is MANUAL.
            existing = (
                db.query(models.TipoCambioDia)
                .filter(models.TipoCambioDia.fecha == hoy_negocio())
                .first()
            )
            if existing and existing.fuente == "MANUAL":
                return {
                    "ok": True,
                    "which": payload.which,
                    "mensaje": "Override MANUAL activo; no se refresco.",
                    "fecha": existing.fecha.isoformat(),
                    "usd_mxn": float(existing.usd_mxn),
                    "fuente": existing.fuente,
                }
            row = get_or_fetch(db, force=True)
            return {
                "ok": True,
                "which": payload.which,
                "fecha": row.fecha.isoformat(),
                "usd_mxn": float(row.usd_mxn),
                "fuente": row.fuente,
            }
    except Exception as exc:
        return {"ok": False, "which": payload.which, "mensaje": str(exc)}


class _SeedContextBody(BaseModel):
    dry_run: bool = False


@router.post("/maintenance/seed-context", dependencies=[Depends(allow_superadmin)])
def maintenance_seed_context(payload: _SeedContextBody, db: Session = Depends(get_db)):
    """Re-ejecuta el seed de context/ (productos, clientes, cotizaciones de muestra, etc.)."""
    try:
        from scripts.import_context_data import run_seed
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo importar el script de seed: {exc}",
        )
    try:
        return run_seed(db, dry_run=payload.dry_run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Seed falló: {exc}")
