"""CRM v2 — detalle de oportunidad: campos extra en deals + tabla deal_actividades

Revision ID: 20260804_01
Revises: 20260611_01

Deals: probabilidad (0-100, validado en Pydantic), fecha_cierre_estimada,
proximo_paso y notas. Nueva tabla deal_actividades (timeline: notas,
llamadas, emails, reuniones, visitas y eventos de sistema).

Las 4 columnas de deals tienen espejo en app/db/seeds.py::_BACKFILL_DDL
(Railway NO corre Alembic en deploy; el backfill es el camino real a
producción). deal_actividades no necesita backfill: create_all() la crea.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260804_01"
down_revision = "20260611_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS probabilidad INTEGER")
    op.execute("ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS fecha_cierre_estimada DATE")
    op.execute("ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS proximo_paso VARCHAR(300)")
    op.execute("ALTER TABLE IF EXISTS deals ADD COLUMN IF NOT EXISTS notas TEXT")

    op.create_table(
        "deal_actividades",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("organization_id", sa.String(length=36), nullable=True, index=True),
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=True,
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("deal_actividades")
    op.execute("ALTER TABLE IF EXISTS deals DROP COLUMN IF EXISTS notas")
    op.execute("ALTER TABLE IF EXISTS deals DROP COLUMN IF EXISTS proximo_paso")
    op.execute("ALTER TABLE IF EXISTS deals DROP COLUMN IF EXISTS fecha_cierre_estimada")
    op.execute("ALTER TABLE IF EXISTS deals DROP COLUMN IF EXISTS probabilidad")
