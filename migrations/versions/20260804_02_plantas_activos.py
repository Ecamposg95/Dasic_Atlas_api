"""Base instalada: tablas plantas y activos_instalados

Revision ID: 20260804_02
Revises: 20260804_01

Plantas (sitios físicos de un cliente) y activos instalados (equipos del
cliente, opcionalmente asociados a una planta). Tablas nuevas: create_all()
las crea en producción (sin entrada en _BACKFILL_DDL); esta migración es el
registro canónico para el camino Alembic-only.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260804_02"
down_revision = "20260804_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plantas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "cliente_id",
            sa.Integer(),
            sa.ForeignKey("clientes.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("nombre", sa.String(length=160), nullable=False),
        sa.Column("direccion", sa.String(length=300), nullable=True),
        sa.Column("ciudad", sa.String(length=120), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "activos_instalados",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "cliente_id",
            sa.Integer(),
            sa.ForeignKey("clientes.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "planta_id",
            sa.Integer(),
            sa.ForeignKey("plantas.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("tipo", sa.String(length=80), nullable=True),
        sa.Column("fabricante", sa.String(length=120), nullable=True),
        sa.Column("modelo", sa.String(length=120), nullable=True),
        sa.Column("serie", sa.String(length=120), nullable=True),
        sa.Column("ubicacion", sa.String(length=200), nullable=True),
        sa.Column("fecha_instalacion", sa.Date(), nullable=True),
        sa.Column("garantia_hasta", sa.Date(), nullable=True),
        sa.Column(
            "estado",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'operativo'"),
        ),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("activos_instalados")
    op.drop_table("plantas")
