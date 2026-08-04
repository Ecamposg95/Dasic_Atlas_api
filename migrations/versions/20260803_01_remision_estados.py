"""remisiones: estados + ciclo de vida (folio nullable, emision/cancelacion)

Revision ID: 20260803_01
Revises: 20260804_01

Nota: la fecha del nombre de archivo (2026-08-03) es anterior a la de
20260804_01 (2026-08-04, CRM v2 detalle de oportunidad) porque este task
se planificó antes de que esa migración aterrizara en main. Para no crear
dos heads de Alembic, esta migración encadena DESPUÉS de 20260804_01 (el
head real en esta rama) en vez de sobre 20260611_01 como decía el plan
original.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260803_01"
down_revision = "20260804_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("remisiones", sa.Column("estado", sa.String(20), nullable=False, server_default="BORRADOR"))
    op.add_column("remisiones", sa.Column("emitida_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("remisiones", sa.Column("emitida_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("cancelada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("remisiones", sa.Column("cancelada_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("motivo_cancelacion", sa.Text(), nullable=True))
    op.add_column("remisiones", sa.Column("sobre_entrega_autorizada_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True))
    op.add_column("remisiones", sa.Column("stock_descontado", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_remisiones_estado", "remisiones", ["estado"])
    # Backfill de históricos: con recepción -> RECIBIDA; el resto -> EMITIDA.
    # NOMBRE en mayúsculas (no el `value` lowercase) porque TolerantEnum
    # persiste el nombre del miembro al escribir vía ORM (ver
    # app/models/enums.py:TolerantEnum.process_bind_param) — mismo criterio
    # que la normalización UPPER de ordenes_venta.estatus en 20260608_01.
    op.execute("UPDATE remisiones SET estado = CASE WHEN recibido_at IS NOT NULL THEN 'RECIBIDA' ELSE 'EMITIDA' END")


def downgrade() -> None:
    op.drop_index("ix_remisiones_estado", "remisiones")
    for col in ("estado", "emitida_at", "emitida_por_id", "cancelada_at",
                "cancelada_por_id", "motivo_cancelacion",
                "sobre_entrega_autorizada_por_id", "stock_descontado"):
        op.drop_column("remisiones", col)
