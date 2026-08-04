"""cantidades Numeric(12,3) + unidad snapshot + tabla unidades_medida

Revision ID: 20260803_02
Revises: 20260803_01
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_02"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("detalles_orden", "cantidad", type_=sa.Numeric(12, 3))
    op.alter_column("detalles_remision", "cantidad", type_=sa.Numeric(12, 3))
    op.add_column("detalles_orden", sa.Column("unidad", sa.String(20), nullable=True))
    op.add_column("detalles_remision", sa.Column("unidad", sa.String(20), nullable=True))
    op.create_table(
        "unidades_medida",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(40), nullable=False, unique=True),
        sa.Column("abreviatura", sa.String(20), nullable=False),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("unidades_medida")
    op.drop_column("detalles_remision", "unidad")
    op.drop_column("detalles_orden", "unidad")
    op.alter_column("detalles_remision", "cantidad", type_=sa.Integer())
    op.alter_column("detalles_orden", "cantidad", type_=sa.Integer())
