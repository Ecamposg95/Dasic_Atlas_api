"""remision_origen_id en ordenes_venta — conversión remisión→cotización

Revision ID: 20260803_03
Revises: 20260803_02
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_03"
down_revision = "20260803_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ordenes_venta",
        sa.Column("remision_origen_id", sa.Integer(), sa.ForeignKey("remisiones.id"), nullable=True),
    )
    op.create_index(
        "ix_ordenes_venta_remision_origen_id", "ordenes_venta", ["remision_origen_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_ordenes_venta_remision_origen_id", table_name="ordenes_venta")
    op.drop_column("ordenes_venta", "remision_origen_id")
