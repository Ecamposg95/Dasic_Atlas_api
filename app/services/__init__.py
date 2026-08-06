from sqlalchemy.orm import Session

from app.models import Usuario
from app.schemas import UsuarioCreate
from passlib.context import CryptContext
from typing import Optional

# Configuración de Hashing
# Usamos bcrypt porque está declarado en requirements.txt (passlib[bcrypt]).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserService:
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifica si la contraseña coincide."""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        """Genera el hash seguro."""
        return pwd_context.hash(password)

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[Usuario]:
        return db.query(Usuario).filter(Usuario.email == email).first()

    @staticmethod
    def create_user(db: Session, user: UsuarioCreate) -> Usuario:
        """Crea un nuevo usuario con la contraseña encriptada."""
        hashed_password = UserService.get_password_hash(user.password)
        db_user = Usuario(
            nombre=user.nombre,
            email=user.email,
            password_hash=hashed_password,
            rol=user.rol,
            activo=user.activo
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
