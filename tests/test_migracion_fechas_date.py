"""La conversión de `fecha_creacion`/`fecha_vencimiento` a DATE.

Es la parte del arreglo que toca DATOS EXISTENTES, así que es la que hay que
probar de verdad: si la regla de conversión se equivoca, 195 documentos quedan
fechados mal y no hay vuelta atrás automática.

La dificultad está en que las filas tienen dos orígenes y el mismo valor
significa cosas distintas según cuál sea:

  00:00 UTC   → lo escribió el cotizador mandando "<fecha>T00:00:00".
                La parte de fecha ES la que capturó el usuario.
  con hora    → lo generó el backend con `utcnow()`. Es un instante, y el día
                correcto es el que era en CDMX en ese momento.

Aplicar una sola regla a todas estropea uno de los dos grupos. Estas pruebas
fijan ese comportamiento sobre una tabla real de Postgres, porque el CASE es
SQL puro y en SQLite no existe `AT TIME ZONE`.
"""
import pytest
from sqlalchemy import text

pytestmark = pytest.mark.postgres

# Mismo SQL que la migración 20260806_01 y que `_FECHAS_A_DATE` en seeds.py.
CONVERSION = """
ALTER TABLE _fechas_prueba
  ALTER COLUMN fecha_creacion TYPE date USING (
    CASE
      WHEN (fecha_creacion AT TIME ZONE 'UTC')::time = '00:00:00'
        THEN (fecha_creacion AT TIME ZONE 'UTC')::date
      ELSE (fecha_creacion AT TIME ZONE 'America/Mexico_City')::date
    END
  )
"""


@pytest.fixture()
def tabla(pg_engine):
    """Tabla desechable con la forma que tenía `ordenes_venta` antes."""
    with pg_engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS _fechas_prueba"))
        c.execute(text("CREATE TABLE _fechas_prueba (id serial primary key, nota text, fecha_creacion timestamptz)"))
    yield pg_engine
    with pg_engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS _fechas_prueba"))


def _insertar(engine, nota, valor):
    with engine.begin() as c:
        c.execute(text("INSERT INTO _fechas_prueba (nota, fecha_creacion) VALUES (:n, :v)"),
                  {"n": nota, "v": valor})


def _convertir_y_leer(engine):
    with engine.begin() as c:
        c.execute(text(CONVERSION))
        return {n: f for n, f in c.execute(text("SELECT nota, fecha_creacion FROM _fechas_prueba")).all()}


def test_una_fecha_capturada_por_el_cotizador_no_se_mueve(tabla):
    """El caso de las 139 filas: medianoche UTC. Es la fecha que el usuario
    escribió, y tiene que sobrevivir intacta."""
    _insertar(tabla, "capturada", "2026-08-06 00:00:00+00")

    r = _convertir_y_leer(tabla)

    assert str(r["capturada"]) == "2026-08-06", "se corrió la fecha que capturó el usuario"


def test_un_instante_del_backend_se_lee_en_la_zona_del_negocio(tabla):
    """El caso de las 56 filas: hora real. Un documento creado a las 23:30 UTC
    se hizo, en México, a las 17:30 del MISMO día — no del siguiente."""
    _insertar(tabla, "tarde", "2026-08-06 23:30:00+00")

    r = _convertir_y_leer(tabla)

    assert str(r["tarde"]) == "2026-08-06"


def test_un_instante_de_madrugada_utc_pertenece_al_dia_anterior_en_mexico(tabla):
    """01:00 UTC del día 7 son las 19:00 del día 6 en CDMX: el documento se
    hizo el 6. Aquí es donde una conversión ingenua desde UTC se equivoca."""
    _insertar(tabla, "madrugada", "2026-08-07 01:00:00+00")

    r = _convertir_y_leer(tabla)

    assert str(r["madrugada"]) == "2026-08-06"


def test_los_dos_grupos_conviven_en_la_misma_conversion(tabla):
    """La prueba que justifica el CASE: con una sola regla, uno de los dos
    sale mal. Con la del CASE, los dos salen bien."""
    _insertar(tabla, "capturada", "2026-08-06 00:00:00+00")   # cotizador
    _insertar(tabla, "instante", "2026-08-07 01:00:00+00")    # backend

    r = _convertir_y_leer(tabla)

    assert str(r["capturada"]) == "2026-08-06"
    assert str(r["instante"]) == "2026-08-06"


def test_el_primero_de_enero_no_cambia_de_ano(tabla):
    """Donde un día de desfase cuesta más caro."""
    _insertar(tabla, "ano_nuevo", "2027-01-01 00:00:00+00")

    r = _convertir_y_leer(tabla)

    assert str(r["ano_nuevo"]) == "2027-01-01"


def test_la_conversion_es_idempotente(tabla):
    """`_FECHAS_A_DATE` corre en cada arranque de la app: si la columna ya es
    DATE no debe tocar nada. La guarda va por `information_schema`."""
    _insertar(tabla, "x", "2026-08-06 00:00:00+00")
    _convertir_y_leer(tabla)

    with tabla.begin() as c:
        tipo = c.execute(text("""
            SELECT data_type FROM information_schema.columns
            WHERE table_name = '_fechas_prueba' AND column_name = 'fecha_creacion'
        """)).scalar()
    assert tipo == "date"

    # Segunda pasada con la guarda real: no encuentra timestamp y no hace nada.
    with tabla.begin() as c:
        c.execute(text("""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='_fechas_prueba' AND column_name='fecha_creacion'
                           AND data_type LIKE 'timestamp%') THEN
                RAISE EXCEPTION 'no debería entrar';
              END IF;
            END $$;
        """))
        valor = c.execute(text("SELECT fecha_creacion FROM _fechas_prueba")).scalar()
    assert str(valor) == "2026-08-06"
