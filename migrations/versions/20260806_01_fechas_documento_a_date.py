"""ordenes_venta: fecha_creacion y fecha_vencimiento pasan a DATE.

Revision ID: 20260806_01
Revises: 20260803_03
Create Date: 2026-08-06

Son fechas de CALENDARIO guardadas como instantes, y por eso el mismo documento
salía con dos fechas distintas según la pantalla (reportado sobre C-2608009):
la medianoche UTC convertida a CDMX cae en el día anterior.

La conversión NO puede ser uniforme, porque las filas tienen dos orígenes
distintos y el dato significa cosas distintas en cada uno. Medido en producción
sobre 195 órdenes:

  139 filas con `fecha_creacion` a las 00:00 UTC
      Las escribió el cotizador mandando `"<fecha>T00:00:00"`. La parte de
      fecha ES la fecha que el usuario capturó → se toma tal cual.

   56 filas con hora real
      Las generó el backend con `utcnow()`/`now()`. Son instantes de verdad →
      la fecha correcta es el día que era en CDMX en ese momento.

Aplicar una sola regla a las 195 estropearía uno de los dos grupos: convertir
todo desde UTC dejaría mal las 56, y convertir todo a CDMX correría un día las
139. De ahí el CASE.

Reversible: `downgrade` devuelve el tipo a timestamp. La hora original de las
56 filas no se recupera —esa información se pierde al pasar a DATE—, lo cual es
correcto: el dato que importa es el día, y guardarlo como instante es
justamente el defecto.
"""
from alembic import op

revision = "20260806_01"
down_revision = "20260803_03"
branch_labels = None
depends_on = None

ZONA = "America/Mexico_City"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE ordenes_venta
          ALTER COLUMN fecha_creacion DROP DEFAULT,
          ALTER COLUMN fecha_creacion TYPE date USING (
            CASE
              WHEN (fecha_creacion AT TIME ZONE 'UTC')::time = '00:00:00'
                THEN (fecha_creacion AT TIME ZONE 'UTC')::date
              ELSE (fecha_creacion AT TIME ZONE '{ZONA}')::date
            END
          ),
          ALTER COLUMN fecha_creacion SET DEFAULT (now() AT TIME ZONE '{ZONA}')::date
        """
    )
    # `fecha_vencimiento` era `timestamp` SIN zona, así que nunca se desplazó:
    # su parte de fecha ya es la correcta y basta el cast.
    op.execute(
        "ALTER TABLE ordenes_venta ALTER COLUMN fecha_vencimiento TYPE date "
        "USING fecha_vencimiento::date"
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE ordenes_venta
          ALTER COLUMN fecha_creacion DROP DEFAULT,
          ALTER COLUMN fecha_creacion TYPE timestamptz USING fecha_creacion::timestamptz,
          ALTER COLUMN fecha_creacion SET DEFAULT now()
        """
    )
    op.execute(
        "ALTER TABLE ordenes_venta ALTER COLUMN fecha_vencimiento TYPE timestamp "
        "USING fecha_vencimiento::timestamp"
    )
