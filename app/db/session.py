from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import get_settings


settings = get_settings()
SQLALCHEMY_DATABASE_URL = settings.database_url

# Configurar engine según BD — SQLite no soporta pool_size, max_overflow, pool_recycle, pool_pre_ping
engine_kwargs = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # SQLite: usar defaults (NullPool o SingletonThreadPool)
    pass
else:
    # PostgreSQL y otras BD: usar pool parameters
    engine_kwargs = {
        "pool_size": 20,
        "max_overflow": 20,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    }

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
