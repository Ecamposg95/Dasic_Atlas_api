# Atlas ERP/POS — Stack & Patrones de Referencia

Documento extraído de [Atlas_ERP_POS](../Atlas_ERP_POS) para uso como base en nuevos proyectos de la familia Synet/Atlas. Todos los snippets son código real del proyecto origen.

## Estatus en este repositorio

Este documento es el **baseline canonico de desarrollo** para `dasic-atlas-api`.

Regla operativa:

1. Toda decision tecnica nueva debe alinearse primero con este baseline.
1. Si un cambio requiere desviarse, debe documentarse en `context/STACK_ADOPTION_CHECKLIST.md` (seccion "Delta DASIC").
1. La documentacion derivada (`ARCHITECTURE.md`, `CRM_SPEC.md`, `ROADMAP.md`, `README.md`) debe mantenerse consistente con este baseline.

## Delta DASIC (aplicado)

Para este repo se aplican estas decisiones sobre el baseline Atlas:

1. `DATABASE_URL` obligatorio con PostgreSQL para desarrollo local (sin fallback operativo a SQLite).
1. Driver objetivo: `psycopg` (v3) con soporte de URLs `postgres://` y `postgresql://`.
1. `Organization.id` en UUID y usuario asociado a una sola organizacion.
1. Multi-tenant via header `X-Organization-ID` y branch scope con `X-Branch-ID`.
1. Auth SSR en cookie HttpOnly (objetivo de arquitectura).
1. Preset de referencia: **DASIC ERP Industrial (CRM-first)**.

---

## 1. Stack & Versiones

| Componente | Tecnología | Versión |
|---|---|---|
| Lenguaje | Python | 3.12 |
| Framework | FastAPI | 0.127.0 |
| ASGI Server (dev) | Uvicorn | 0.40.0 |
| ASGI Server (prod) | Gunicorn + Uvicorn worker | latest |
| ORM | SQLAlchemy | 2.0.45 |
| DB Driver | psycopg2-binary | latest |
| DB (prod) | PostgreSQL | — |
| DB (local/test) | SQLite | built-in |
| Validación | Pydantic | 2.12.5 |
| JWT | python-jose | 3.5.0 |
| Hashing | passlib + bcrypt | 1.7.4 / 3.2.0 |
| Config | python-dotenv | 1.2.1 |
| Templates (SSR) | Jinja2 | 3.1.4 |
| PDF | reportlab | 4.4.7 |
| Data | pandas | 2.3.3 |
| QR/Barcode | qrcode / python-barcode | 8.2 / 0.16.1 |
| Deploy | Railway + nixpacks | — |

### requirements.txt mínimo para nuevo proyecto

```
fastapi==0.127.0
uvicorn==0.40.0
sqlalchemy==2.0.45
psycopg2-binary
pydantic==2.12.5
python-jose[cryptography]==3.5.0
passlib[bcrypt]==1.7.4
bcrypt==3.2.0
python-dotenv==1.2.1
python-multipart
```

---

## 2. Estructura de Carpetas

```
project_root/
├── app/
│   ├── main.py              # FastAPI app: init, middleware, routers, rutas SSR
│   ├── database.py          # Engine, SessionLocal, Base, get_db()
│   ├── dependencies.py      # DI: get_current_active_organization, check_view_permission
│   ├── core/
│   │   ├── events.py        # EventBus (pub/sub síncrono)
│   │   ├── role_permissions.py  # Matriz de permisos por rol
│   │   └── role_matrix.py   # Mapeo de permisos
│   ├── models/
│   │   ├── __init__.py      # Exporta todos los modelos (necesario para create_all)
│   │   ├── base.py
│   │   └── mixins.py        # UUIDMixin, AuditMixin, TenantMixin
│   ├── routers/             # Un archivo por dominio de negocio
│   ├── schemas/             # Pydantic schemas (request/response) por dominio
│   ├── security/
│   │   ├── __init__.py      # JWT, get_current_user, get_current_user_from_cookie
│   │   └── require_module.py  # Feature flag dependency
│   ├── services/            # Lógica de negocio desacoplada de endpoints
│   ├── utils/               # Helpers (pdf, folios, etc.)
│   └── subscribers/         # Event handlers registrados en startup
├── scripts/
│   ├── init_db.py           # Crear tablas idempotente
│   ├── init_users.py        # Seed usuarios iniciales
│   └── railway_init.py      # Script de arranque en producción
├── tests/
├── requirements.txt
├── .env                     # Variables de entorno (no commitear)
├── .env.example
├── Procfile                 # Para Railway/Heroku
├── nixpacks.toml            # Build config para Railway
└── CLAUDE.md
```

---

## 3. Database (`app/database.py`)

```python
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

# Railway/Heroku usan postgres:// — SQLAlchemy requiere postgresql://
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Detecta conexiones caídas antes de usarlas
)

# SQLite: habilitar foreign keys y WAL para mejor concurrencia
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in SQLALCHEMY_DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency de FastAPI — siempre cerrar la sesión al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 4. Mixins de Modelos (`app/models/mixins.py`)

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import declarative_mixin

@declarative_mixin
class UUIDMixin:
    """Primary key UUID como string de 36 chars."""
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

@declarative_mixin
class AuditMixin:
    """Timestamps automáticos + soft delete."""
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # None = activo

@declarative_mixin
class TenantMixin:
    """Multi-tenancy: aísla datos por organización."""
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=True, index=True)
```

### Uso

```python
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin, TenantMixin

class Product(Base, UUIDMixin, AuditMixin, TenantMixin):
    __tablename__ = "products"

    name = Column(String, index=True, nullable=False)
    # organization_id, id, created_at, updated_at, deleted_at — heredados
```

---

## 5. Autenticación (`app/security/__init__.py`)

```python
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.users import User

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Dependency para endpoints API. Lee cookie o Authorization header."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no válidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        cookie = request.cookies.get("access_token", "")
        token = cookie.replace("Bearer ", "") if cookie.startswith("Bearer ") else cookie

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise credentials_exception

    # Inyectar contexto en request.state para acceso downstream
    request.state.ctx_id = payload.get("ctx_id")
    request.state.ctx_type = payload.get("ctx_type")
    request.state.role = payload.get("role")
    return user
```

### Emisión del token (en router de auth)

```python
# POST /api/auth/login
access_token = create_access_token({
    "sub": user.username,
    "role": user.role.value,
    "ctx_id": branch_id,       # None = HQ, int = sucursal específica
    "ctx_type": "HQ" or "BRANCH",
})
response.set_cookie(
    key="access_token",
    value=f"Bearer {access_token}",
    httponly=True,          # JS no puede leerla
    max_age=60 * 60 * 12,   # 12 horas
    samesite="lax",
    secure=False,           # True en producción con HTTPS
)
```

---

## 6. Roles & Permisos

```python
# app/models/users.py
import enum

class Role(str, enum.Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    DUEÑO = "DUEÑO"
    GERENTE = "GERENTE"
    CAJERO = "CAJERO"
    VENDEDOR = "VENDEDOR"
    SOPORTE_OPERATIVO = "SOPORTE_OPERATIVO"
    CLIENTE = "CLIENTE"

class PlatformRole(str, enum.Enum):
    SUPERADMIN = "SUPERADMIN"   # Admin de la plataforma SaaS
    SUPPORT = "SUPPORT"
    NONE = "NONE"               # Usuario normal
```

### Feature flag por organización

```python
# app/security/require_module.py
def require_module(module_key: str):
    """Dependency factory — bloquea el endpoint si el módulo no está activo."""
    async def _enforce(
        request: Request,
        current_user=Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        org_id = request.state.ctx_id  # o get_current_active_organization
        enabled = db.query(OrganizationModule).filter(
            OrganizationModule.organization_id == org_id,
            OrganizationModule.module_key == module_key,
            OrganizationModule.is_enabled == True,
        ).first()
        if not enabled:
            raise HTTPException(status_code=403, detail=f"Módulo '{module_key}' no habilitado")
        return True
    return _enforce

# Uso en router:
@router.get("/stats", dependencies=[Depends(require_module("pos"))])
def get_stats(...): ...
```

---

## 7. Patrón de Router

```python
# app/routers/products.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.security import get_current_user
from app.models.users import User
from app.models.products import Product
from app.schemas.products import ProductCreate, ProductRead

router = APIRouter()

@router.get("/", response_model=list[ProductRead])
def list_products(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_id: int = Depends(get_current_active_organization),  # Multi-tenant
):
    return (
        db.query(Product)
        .filter(Product.organization_id == org_id, Product.deleted_at == None)
        .offset(skip)
        .limit(limit)
        .all()
    )

@router.post("/", response_model=ProductRead, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_id: int = Depends(get_current_active_organization),
):
    product = Product(**payload.model_dump(), organization_id=org_id)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product
```

### Registro en main.py

```python
from app.routers import products, sales, auth

app.include_router(auth.router,     prefix="/api/auth",     tags=["Autenticación"])
app.include_router(products.router, prefix="/api/products", tags=["Productos"])
app.include_router(sales.router,    prefix="/api/sales",    tags=["Ventas"])
```

---

## 8. Inicialización de la App (`app/main.py`)

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.database import engine, Base

# Crear tablas al arrancar (desarrollo; en prod usar railway_init.py)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="My Atlas App", version="1.0.0")

# Middleware
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # Restringir en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Archivos estáticos y templates (si aplica SSR)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Routers
from app.routers import auth, products  # etc.
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

# Startup: registrar event subscribers
@app.on_event("startup")
def startup():
    from app.subscribers import setup_all_subscribers
    setup_all_subscribers()
```

---

## 9. Event Bus (`app/core/events.py`)

```python
from dataclasses import dataclass
from typing import Dict, List, Type, Callable
import logging

logger = logging.getLogger(__name__)

class BaseEvent:
    pass

@dataclass
class SalesDocumentCreated(BaseEvent):
    sales_document_id: str
    organization_id: int
    branch_id: int

class EventBus:
    _subscribers: Dict[Type[BaseEvent], List[Callable]] = {}

    @classmethod
    def subscribe(cls, event_type: Type[BaseEvent], handler: Callable):
        cls._subscribers.setdefault(event_type, []).append(handler)

    @classmethod
    def publish(cls, event: BaseEvent):
        for handler in cls._subscribers.get(type(event), []):
            try:
                handler(event)
            except Exception as e:
                logger.error(f"Error en handler de evento: {e}", exc_info=True)
```

### Uso

```python
# En el router, después de crear la venta:
EventBus.publish(SalesDocumentCreated(
    sales_document_id=doc.id,
    organization_id=org_id,
    branch_id=branch_id,
))

# En subscribers/inventory.py:
def check_reorder_levels(event: SalesDocumentCreated):
    # Verificar stock, emitir alertas, etc.
    ...

# En startup:
EventBus.subscribe(SalesDocumentCreated, check_reorder_levels)
```

---

## 10. Multi-Tenancy

### Regla fundamental
**Toda query filtra por `organization_id`**. Nunca devolver datos de otra organización.

```python
# Correcto
db.query(Product).filter(Product.organization_id == org_id).all()

# Incorrecto — devuelve datos de todos los tenants
db.query(Product).all()
```

### Resolución de org context

```python
# app/dependencies.py
async def get_current_active_organization(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> int:
    """Retorna el organization_id activo para el usuario en el contexto actual."""
    ctx_id = request.state.ctx_id
    # Validar que el usuario tiene acceso a esa org
    membership = db.query(UserOrganization).filter(
        UserOrganization.user_id == current_user.id,
        UserOrganization.organization_id == ctx_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Sin acceso a esta organización")
    return ctx_id
```

---

## 11. Variables de Entorno

### `.env.example`

```
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
SECRET_KEY=change_me_in_production_use_secrets_manager
INIT_USERS_ON_BOOT=false
```

### `.env` (local, no commitear)

```
DATABASE_URL=sqlite:///./dev.db
SECRET_KEY=dev_secret_local
INIT_USERS_ON_BOOT=true
```

---

## 12. Despliegue en Railway

### `Procfile`

```
web: python scripts/railway_init.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### `nixpacks.toml`

```toml
[phases.setup]
nixpkgs = ["python312", "postgresql"]

[phases.install]
cmds = ["pip install -r requirements.txt"]
```

### `scripts/railway_init.py` (patrón)

```python
"""Script idempotente de inicialización para Railway/producción."""
import os
from app.database import engine, Base

def main():
    print("Creando tablas...")
    Base.metadata.create_all(bind=engine)  # Idempotente

    # Seed superadmin si no existe
    from app.database import SessionLocal
    from app.models.users import User
    from app.security import hash_password

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            admin = User(
                username="admin",
                password_hash=hash_password(os.getenv("ADMIN_PASSWORD", "changeme")),
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("Superadmin creado.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
```

---

## 13. Testing

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

TEST_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

---

## Notas de Arquitectura

- **No hay migraciones Alembic activas** — se usa `Base.metadata.create_all()` en dev y el script de init en prod. Para proyectos nuevos con evolución de schema frecuente, considerar Alembic.
- **SSR opcional** — Jinja2 solo si el proyecto requiere HTML server-side. Si es API pura, omitir templates y static files.
- **Sin Docker** — Railway usa nixpacks. Si se necesita Docker, agregar `Dockerfile`.
- **PIN vs Password** — Atlas_ERP_POS usó PIN numérico (4-6 dígitos) como autenticación de cajero. Proyectos API normales usan password completa con bcrypt.
