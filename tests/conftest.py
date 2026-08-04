import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configurar variables de entorno ANTES de importar app (que carga config)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum!")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "25")

from app.db import Base
from app import models


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def usuario(db):
    """Factory: usuario(rol='administrador') -> models.Usuario persistido."""
    def _make(rol="administrador", email=None):
        u = models.Usuario(
            nombre=f"Test {rol}",
            email=email or f"{rol}@test.local",
            password_hash="x",
            rol=rol,
            activo=True,
        )
        db.add(u)
        db.commit()
        return u
    return _make
