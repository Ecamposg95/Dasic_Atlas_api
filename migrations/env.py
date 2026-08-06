"""Alembic env.py — configurado para DASIC ERP.

Lee DATABASE_URL desde el ambiente (compatible con Railway y .env local).
Usa los modelos SQLAlchemy para migraciones automáticas (--autogenerate).
"""
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

from alembic import context

# ---------------------------------------------------------------------------
# Cargar .env si existe (desarrollo local)
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Config de Alembic
# ---------------------------------------------------------------------------
config = context.config

# Logging desde alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Inyectar DATABASE_URL desde el ambiente (sobrescribe alembic.ini)
# ---------------------------------------------------------------------------
from app.core.config import get_settings  # noqa: E402

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

# ---------------------------------------------------------------------------
# Metadata de los modelos para autogenerate
# ---------------------------------------------------------------------------
from app.db.base import Base  # noqa: E402
import app.models  # noqa: E402, F401  # registra todos los modelos en Base.metadata

target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Funciones de migración
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Modo offline: emite SQL sin conexión a la BD."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo online: conecta a la BD y aplica migraciones."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
