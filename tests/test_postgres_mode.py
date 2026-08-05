"""Pruebas que solo tienen sentido contra PostgreSQL real.

Se omiten automáticamente en modo SQLite (ver `tests/conftest.py`). Sirven de
plantilla para las pruebas de concurrencia de la Ola 0: dos conexiones reales,
lock real, resultado determinista.
"""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.services import folio_service


@pytest.mark.postgres
def test_funciones_de_lock_son_reales_no_shims(pg_engine):
    """`hashtext`/`pg_advisory_xact_lock` existen en la base: en modo SQLite se
    parchean a no-op y este assert no significaría nada."""
    with pg_engine.connect() as conn:
        assert conn.execute(text("SELECT hashtext('remision:1')")).scalar() is not None
        assert conn.execute(
            text("SELECT proname FROM pg_proc WHERE proname = 'pg_advisory_xact_lock' LIMIT 1")
        ).scalar() == "pg_advisory_xact_lock"


@pytest.mark.postgres
def test_advisory_lock_bloquea_a_la_segunda_transaccion(pg_engine):
    """El lock que usa `folio_service.pg_locker` serializa de verdad: mientras
    una transacción lo tiene, otra no puede tomarlo.

    Se usa `lock_timeout` para no colgar la suite: si la segunda transacción
    tuviera el camino libre (shim no-op), pasaría sin error y el test fallaría.
    """
    clave = "remision:concurrencia"
    with pg_engine.connect() as uno, pg_engine.connect() as dos:
        uno.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": clave})

        dos.execute(text("SET lock_timeout = '400ms'"))
        with pytest.raises(OperationalError):
            dos.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": clave})
        dos.rollback()

        # Liberado el lock (fin de la transacción), la segunda ya puede tomarlo.
        uno.rollback()
        dos.execute(text("SET lock_timeout = '2s'"))
        dos.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": clave})
        dos.rollback()


@pytest.mark.postgres
def test_pg_locker_de_produccion_corre_sin_parches(db):
    """El locker por defecto del código de producción funciona tal cual contra
    la base de pruebas — sin shims registrados."""
    folio_service.pg_locker(db, "remision:1")
    db.rollback()
