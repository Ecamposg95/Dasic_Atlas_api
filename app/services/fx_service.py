"""Servicio de tipo de cambio USD/MXN.

Estrategia:
1. Cache en `tipos_cambio_dia` (1 row por fecha).
2. Fuente primaria: Banxico SIE serie SF63528 (TC FIX). Requiere BANXICO_TOKEN.
3. Fallback: api.exchangerate.host (sin token).
"""

from __future__ import annotations

import json
import logging
import os
from app.core.fechas import hoy_negocio
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app import models

log = logging.getLogger(__name__)

BANXICO_SERIE = "SF63528"
BANXICO_URL = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/{serie}/datos/oportuno"
# Fallback público sin token: open.er-api.com (rates en USD-base)
EXCHANGERATE_URL = "https://open.er-api.com/v6/latest/USD"


class FXError(RuntimeError):
    pass


def _http_get_json(url: str, headers: Optional[dict] = None, timeout: int = 8) -> dict:
    req = Request(url, headers=headers or {})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _from_banxico(token: str) -> tuple[Decimal, date]:
    url = BANXICO_URL.format(serie=BANXICO_SERIE)
    data = _http_get_json(url, headers={"Bmx-Token": token})
    serie = data["bmx"]["series"][0]
    dato = serie["datos"][0]
    valor = Decimal(dato["dato"].replace(",", ""))
    fecha_str = dato["fecha"]  # "DD/MM/YYYY"
    d, m, y = fecha_str.split("/")
    return valor, date(int(y), int(m), int(d))


def _from_exchangerate() -> tuple[Decimal, date]:
    """open.er-api.com: respuesta {result, base_code, rates: {MXN: ...}, time_last_update_unix}"""
    data = _http_get_json(EXCHANGERATE_URL)
    if data.get("result") != "success":
        raise ValueError(f"open.er-api error: {data.get('error-type', 'desconocido')}")
    rates = data.get("rates") or {}
    if "MXN" not in rates:
        raise ValueError("Respuesta sin MXN")
    rate = Decimal(str(rates["MXN"]))
    ts = data.get("time_last_update_unix")
    if ts:
        return rate, datetime.utcfromtimestamp(int(ts)).date()
    return rate, hoy_negocio()


def get_or_fetch(
    db: Session,
    fecha: Optional[date] = None,
    force: bool = False,
) -> "models.TipoCambioDia":
    fecha = fecha or hoy_negocio()

    if not force:
        existing = (
            db.query(models.TipoCambioDia)
            .filter(models.TipoCambioDia.fecha == fecha)
            .first()
        )
        if existing:
            return existing

    token = (os.getenv("BANXICO_TOKEN") or "").strip()
    valor: Optional[Decimal] = None
    fuente = "MANUAL"
    fecha_real = fecha

    if token:
        try:
            valor, fecha_real = _from_banxico(token)
            fuente = "BANXICO"
        except (URLError, HTTPError, KeyError, IndexError, ValueError) as exc:
            log.warning("Banxico FX fetch falló: %s. Caigo a fallback.", exc)

    if valor is None:
        try:
            valor, fecha_real = _from_exchangerate()
            fuente = "EXCHANGERATE"
        except (URLError, HTTPError, KeyError, ValueError) as exc:
            log.error("Fallback exchangerate.host también falló: %s", exc)
            raise FXError("No se pudo obtener TC de ninguna fuente.") from exc

    row = (
        db.query(models.TipoCambioDia)
        .filter(models.TipoCambioDia.fecha == fecha_real)
        .first()
    )
    if row:
        if force:
            row.usd_mxn = valor
            row.fuente = fuente
            row.obtenido_en = datetime.utcnow()
    else:
        row = models.TipoCambioDia(fecha=fecha_real, usd_mxn=valor, fuente=fuente)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
