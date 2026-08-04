"""
Matriz central de permisos DASIC.

Modelo de autorización:

- Cuatro roles operativos: ADMIN, GERENTE_COMERCIAL, VENTAS, OPERATIVO.
  (SUPERADMIN se trata igual que ADMIN.)
- Permisos declarativos: tuplas (action, resource).
- VENTAS tiene permisos `:own` (solo recursos propios), aplicado vía
  `scope_query_by_owner` en queries SQLAlchemy.

Helpers:

  can(user, action, resource) -> bool
  require(user, action, resource)             # levanta 403
  scope_query_by_owner(query, user, model)    # filtra por dueño si VENTAS

Mantenemos los decoradores `allow_admin`, `allow_admin_asistente`, etc. en
`jwt.py` por compatibilidad. Endpoints nuevos prefieren `require()` por
claridad de intención.
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status

from app.models.enums import RolUsuario


# ---------- Constantes de matriz ----------

# Wildcard: ADMIN puede todo. Se evalúa primero en `can()`.
_ALL = ("*", "*")

# Permisos por rol. action puede ser:
#   - "read", "write", "create", "delete", "convert", "cancel", "export",
#     "ajuste", "recibir", "manage"
# resource puede ser:
#   - "cotizacion", "venta", "cliente", "producto", "oc", "stock",
#     "usuario", "dashboard:full", "dashboard:team", "dashboard:own",
#     "dashboard:inventory", "reportes", "gasto", "fx", "costo"
# El sufijo ":own" en la action significa "solo recursos cuyo dueño es el user"
# (ventas crea, edita y ve sólo lo suyo). El frontend/scoper convierte esto
# en filtros SQL.

PERMISSIONS: dict[RolUsuario, set[tuple[str, str]]] = {
    RolUsuario.ADMINISTRADOR: {_ALL},
    RolUsuario.SUPERADMIN: {_ALL},  # alias técnico

    RolUsuario.GERENTE_COMERCIAL: {
        # cotizaciones / ventas: ver y gestionar todas
        ("read", "cotizacion"), ("write", "cotizacion"),
        ("create", "cotizacion"), ("convert", "cotizacion"),
        ("cancel", "cotizacion"),
        ("read", "venta"),
        # clientes
        ("read", "cliente"), ("write", "cliente"), ("create", "cliente"),
        ("pago", "cliente"),  # registrar pagos / CxC
        # productos: lectura completa con costo
        ("read", "producto"), ("write", "producto"), ("read", "costo"),
        # OCs: ver y gestionar
        ("read", "oc"), ("write", "oc"), ("create", "oc"), ("recibir", "oc"),
        # inventario
        ("read", "stock"), ("ajuste", "stock"),
        # dashboard: ver del equipo entero
        ("read", "dashboard:team"),
        ("read", "dashboard:full"),
        # reportes y gastos
        ("read", "reportes"), ("export", "reportes"),
        ("read", "gasto"), ("write", "gasto"),
        ("read", "fx"),
        # remisiones: gestión completa
        ("read", "remision"), ("create", "remision"), ("write", "remision"),
        ("emitir", "remision"), ("cancel", "remision"), ("sobreentrega", "remision"),
        ("convertir", "remision"),
    },

    RolUsuario.VENTAS: {
        # cotizaciones / ventas: solo las propias
        ("read:own", "cotizacion"), ("write:own", "cotizacion"),
        ("create", "cotizacion"), ("convert:own", "cotizacion"),
        ("cancel:own", "cotizacion"),
        ("read:own", "venta"),
        # clientes: lectura completa (cartera compartida B2B), edición sólo de los que creó
        ("read", "cliente"), ("create", "cliente"), ("write:own", "cliente"),
        # productos: solo precios (sin costo). El schema ProductoResponseVendedor ya filtra.
        ("read", "producto"),
        # inventario: lectura para ver stock al cotizar
        ("read", "stock"),
        # OCs: solo las vinculadas a sus cotizaciones
        ("read:own", "oc"),
        # dashboard solo lo suyo
        ("read", "dashboard:own"),
        # reportes propios
        ("read:own", "reportes"),
        ("read", "fx"),
        # remisiones: solo las propias, sin cancelar ni sobre-entrega
        ("read:own", "remision"), ("create", "remision"), ("write:own", "remision"),
        ("emitir:own", "remision"), ("convertir:own", "remision"),
    },

    RolUsuario.OPERATIVO: {
        # Inventario: ver y modificar
        ("read", "producto"), ("write", "producto"), ("read", "costo"),
        ("read", "stock"), ("ajuste", "stock"),
        # OCs: ver y recibir (entrada de stock al recibir)
        ("read", "oc"), ("recibir", "oc"),
        # Dashboard del módulo de inventario
        ("read", "dashboard:inventory"),
        # Proveedores: solo lectura
        ("read", "proveedor"),
        # remisiones: consulta de emitidas/recibidas + recepción física
        ("read", "remision"), ("recibir", "remision"),
    },
}


def _normalize_role(rol) -> Optional[RolUsuario]:
    """Tolera enum, string canónico y aliases legacy ('admin', 'asistente'…)."""
    if rol is None:
        return None
    try:
        return RolUsuario.from_input(rol)
    except (ValueError, KeyError, AttributeError):
        return None


def can(user, action: str, resource: str) -> bool:
    """¿El user puede ejecutar (action, resource)?

    Si el rol tiene wildcard *.* (ADMIN), True.
    Si tiene la tupla exacta (action, resource), True.
    Si la action pedida es base ("read") y el rol tiene la versión :own
    ("read:own"), True (lo que el caller usará luego con `scope_query_by_owner`).
    """
    if user is None:
        return False
    rol = _normalize_role(getattr(user, "rol", None))
    if rol is None:
        return False
    perms = PERMISSIONS.get(rol, set())
    if _ALL in perms:
        return True
    if (action, resource) in perms:
        return True
    # Permitir si tiene la versión :own (responsabilidad del caller scoping).
    if (f"{action}:own", resource) in perms:
        return True
    return False


def require(user, action: str, resource: str) -> None:
    """Como `can` pero levanta 403 si no."""
    if not can(user, action, resource):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tienes permiso para {action} {resource}",
        )


def is_owner_scoped(user, action: str, resource: str) -> bool:
    """¿El permiso aplicable al user es la versión :own?

    Útil para que el caller decida si filtrar la query.
    """
    if user is None:
        return False
    rol = _normalize_role(getattr(user, "rol", None))
    if rol is None:
        return False
    perms = PERMISSIONS.get(rol, set())
    if _ALL in perms:
        return False  # admin no escopa
    if (action, resource) in perms:
        return False  # tiene permiso amplio
    if (f"{action}:own", resource) in perms:
        return True
    return False


def scope_query_by_owner(query, user, owner_field, action: str = "read", resource: str = "cotizacion"):
    """Filtra la query por dueño si el user solo tiene permiso :own.

    `owner_field` debe ser un Column o atributo de modelo (ej. `OrdenVenta.vendedor_id`).
    Si el user es admin/gerente, devuelve la query sin tocar.
    """
    if not is_owner_scoped(user, action, resource):
        return query
    return query.filter(owner_field == user.id)


# ---------- Capabilities expuestas al frontend ----------
# Mapa amigable consumido por GET /api/me. El frontend hace
# `$store.user.can('crear_cotizacion')` sin tener que conocer la matriz interna.

CAPABILITY_FLAGS: dict[str, tuple[str, str]] = {
    "ver_cotizaciones": ("read", "cotizacion"),
    "crear_cotizacion": ("create", "cotizacion"),
    "editar_cotizacion": ("write", "cotizacion"),
    "convertir_a_venta": ("convert", "cotizacion"),
    "cancelar_cotizacion": ("cancel", "cotizacion"),
    "ver_clientes": ("read", "cliente"),
    "crear_cliente": ("create", "cliente"),
    "editar_cliente": ("write", "cliente"),
    "ver_productos": ("read", "producto"),
    "editar_producto": ("write", "producto"),
    "ver_costos": ("read", "costo"),
    "ver_oc": ("read", "oc"),
    "crear_oc": ("create", "oc"),
    "recibir_oc": ("recibir", "oc"),
    "ajustar_stock": ("ajuste", "stock"),
    "ver_dashboard_full": ("read", "dashboard:full"),
    "ver_dashboard_team": ("read", "dashboard:team"),
    "ver_dashboard_inventory": ("read", "dashboard:inventory"),
    "ver_reportes": ("read", "reportes"),
    "exportar_reportes": ("export", "reportes"),
    "ver_gastos": ("read", "gasto"),
    "registrar_pago": ("pago", "cliente"),
    "gestionar_usuarios": ("manage", "usuario"),
    "ver_fx": ("read", "fx"),
    "ver_remisiones": ("read", "remision"),
    "crear_remision": ("create", "remision"),
    "emitir_remision": ("emitir", "remision"),
    "recibir_remision": ("recibir", "remision"),
    "cancelar_remision": ("cancel", "remision"),
    "sobre_entrega_remision": ("sobreentrega", "remision"),
    "remision_a_cotizacion": ("convertir", "remision"),
}

# Módulos de sidebar. El frontend filtra por estos.
MODULOS_VISIBLES_BY_ROL: dict[RolUsuario, list[str]] = {
    RolUsuario.ADMINISTRADOR: [
        "dashboard", "cotizador", "seguimiento", "inventario",
        "clientes", "compras", "gastos", "reportes", "usuarios", "catalogos",
        "remisiones",
    ],
    RolUsuario.SUPERADMIN: [
        "dashboard", "cotizador", "seguimiento", "inventario",
        "clientes", "compras", "gastos", "reportes", "usuarios", "catalogos",
        "remisiones",
    ],
    RolUsuario.GERENTE_COMERCIAL: [
        "dashboard", "cotizador", "seguimiento", "inventario",
        "clientes", "compras", "gastos", "reportes", "catalogos",
        "remisiones",
    ],
    RolUsuario.VENTAS: [
        "dashboard", "cotizador", "seguimiento", "inventario",
        "clientes", "compras", "reportes", "catalogos",
        "remisiones",
    ],
    RolUsuario.OPERATIVO: [
        "dashboard", "inventario", "compras", "catalogos",
        "remisiones",
    ],
}


def capabilities_for(user) -> dict:
    """Devuelve dict listo para `/api/me` con flags can_* + modulos_visibles."""
    rol = _normalize_role(getattr(user, "rol", None))

    # gestionar_usuarios es action="manage" sobre resource="usuario": solo admin.
    perms = PERMISSIONS.get(rol, set()) if rol else set()
    is_admin = _ALL in perms

    flags = {nombre: can(user, action, resource)
             for nombre, (action, resource) in CAPABILITY_FLAGS.items()}
    flags["gestionar_usuarios"] = is_admin

    return {
        "rol": rol.api_value if rol else None,
        "rol_label": _ROL_LABELS.get(rol, "Sin rol") if rol else "Sin rol",
        "modulos_visibles": MODULOS_VISIBLES_BY_ROL.get(rol, []) if rol else [],
        **flags,
    }


_ROL_LABELS = {
    RolUsuario.ADMINISTRADOR: "Administrador",
    RolUsuario.SUPERADMIN: "Super Admin",
    RolUsuario.GERENTE_COMERCIAL: "Gerente Comercial",
    RolUsuario.VENTAS: "Ventas",
    RolUsuario.OPERATIVO: "Almacén / Operativo",
}
