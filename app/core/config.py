import logging
import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    access_token_expire_minutes: int
    # Duración de la sesión cuando el usuario marca "recordar sesión".
    # Faltaba en el dataclass pese a que `auth.py` la lee: ver abajo.
    remember_session_days: int
    token_cookie_name: str
    cookie_secure: bool
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    smtp_from: str
    smtp_use_tls: bool
    anthropic_api_key: str
    anthropic_model: str
    iva_rate: float
    quote_validity_days: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_dotenv()

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL no está configurada.")

    secret_key = os.getenv("SECRET_KEY", "").strip()
    if not secret_key:
        raise RuntimeError("SECRET_KEY no está configurada.")
    if len(secret_key) < 32:
        raise RuntimeError(
            "SECRET_KEY debe tener al menos 32 caracteres (HS256). "
            f"Actual: {len(secret_key)} chars. Genera con `openssl rand -hex 32`."
        )

    access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))
    remember_session_days = int(os.getenv("REMEMBER_SESSION_DAYS", "30"))
    token_cookie_name = os.getenv("TOKEN_COOKIE_NAME", "access_token").strip() or "access_token"
    cookie_secure = _as_bool(os.getenv("COOKIE_SECURE", "false"), default=False)

    # Aviso temprano en producción si la cookie no es Secure.
    # ENV puede ser "production" en Railway/Render; si no, asumimos dev.
    _env = os.getenv("ENV", "").strip().lower() or os.getenv("ENVIRONMENT", "").strip().lower()
    if _env in {"production", "prod"} and not cookie_secure:
        logger.error(
            "COOKIE_SECURE=false en producción. La cookie de auth viaja por HTTP "
            "y puede ser interceptada. Setea COOKIE_SECURE=true."
        )

    smtp_user = os.getenv("SMTP_USER", "").strip()

    return Settings(
        database_url=normalize_database_url(database_url),
        secret_key=secret_key,
        access_token_expire_minutes=access_token_expire_minutes,
        # Se leía de REMEMBER_SESSION_DAYS y NO se pasaba: el campo ni
        # siquiera existía en Settings, así que `settings.remember_session_days`
        # en auth.py lanzaba AttributeError y el login con "recordar sesión"
        # marcado devolvía 500 con credenciales válidas.
        remember_session_days=remember_session_days,
        token_cookie_name=token_cookie_name,
        cookie_secure=cookie_secure,
        smtp_host=os.getenv("SMTP_HOST", "").strip(),
        smtp_port=int(os.getenv("SMTP_PORT", "587") or 587),
        smtp_user=smtp_user,
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_from=os.getenv("SMTP_FROM", "").strip() or smtp_user,
        smtp_use_tls=_as_bool(os.getenv("SMTP_USE_TLS", "true"), default=True),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6").strip() or "claude-sonnet-4-6",
        iva_rate=float(os.getenv("IVA_RATE", "0.16") or "0.16"),
        quote_validity_days=int(os.getenv("QUOTE_VALIDITY_DAYS", "15") or "15"),
    )
