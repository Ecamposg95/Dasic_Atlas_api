// web/src/lib/permissions.ts
//
// Helpers centralizados para chequeos de rol en la SPA.
//
// Backend (`/api/auth/me` → `capabilities_for`) entrega `rol` en lowercase
// (`'administrador'`, `'superadmin'`, `'gerente_comercial'`, `'ventas'`,
// `'operativo'`). Cualquier comparación con UPPERCASE como `'ADMINISTRADOR'`
// es un bug: el check siempre da `false` y los admins no ven sus botones.
//
// Estos hooks normalizan a lowercase y aceptan también los aliases legacy
// (`'admin'`, `'asistente'`) por si quedan rows con rol viejo en DB.

import { useAuth } from '@/stores/auth';

function normalize(rol: string | null | undefined): string {
  return (rol ?? '').toLowerCase();
}

/**
 * Admin tier puro: ADMINISTRADOR o SUPERADMIN.
 * Úsalo para acciones destructivas / configuración crítica
 * (eliminar producto, override TC, marcar vencidos, etc.).
 */
export function useIsAdmin(): boolean {
  const user = useAuth((s) => s.user);
  const rol = normalize(user?.rol);
  // 'admin' es alias legacy aceptado por el backend al leer rows viejos.
  return rol === 'administrador' || rol === 'superadmin' || rol === 'admin';
}

/** SUPERADMIN estricto (NO incluye administrador). Para la consola de plataforma. */
export function useIsSuperadmin(): boolean {
  const user = useAuth((s) => s.user);
  return normalize(user?.rol) === 'superadmin';
}

/**
 * Nombres de las capacidades que `/api/auth/me` entrega como flags booleanos
 * (`capabilities_for` en `app/security/permissions.py`). Tenerlos como unión
 * evita que un typo silencioso —`can('cancelar_remison')`— devuelva `false`
 * para siempre y esconda un botón sin que nadie se entere.
 */
export type Capability =
  | 'ver_dashboard_team'
  | 'ver_dashboard_inventory'
  | 'ver_reportes'
  | 'exportar_reportes'
  | 'ver_gastos'
  | 'registrar_pago'
  | 'gestionar_usuarios'
  | 'ver_fx'
  | 'ver_remisiones'
  | 'crear_remision'
  | 'emitir_remision'
  | 'recibir_remision'
  | 'cancelar_remision'
  | 'sobre_entrega_remision'
  | 'remision_a_cotizacion';

/**
 * ¿El backend le concede esta capacidad al usuario?
 *
 * Es la forma preferida de esconder acciones: la matriz declarativa del
 * backend (`PERMISSIONS`) es la única fuente de verdad, y estos flags viajan
 * ya resueltos en `/api/auth/me` — el propio endpoint dice que existen para
 * que el frontend esconda UI. Comparar roles a mano en la pantalla es lo que
 * produjo acciones visibles que el backend rechaza con 403.
 *
 * Ojo: para las variantes `:own`, `can()` devuelve `true` (el rol podría
 * ejecutar la acción sobre SUS documentos) y la pertenencia la sigue
 * aplicando el backend. El flag responde "¿puede alguna vez?", no
 * "¿puede sobre este documento?".
 */
export function useCan(cap: Capability): boolean {
  const user = useAuth((s) => s.user);
  return user?.[cap] === true;
}

/**
 * ¿El backend declara visible este módulo de menú para el usuario?
 *
 * `modulos_visibles` viene de `MODULOS_VISIBLES_BY_ROL` y el comentario en el
 * backend es literal: "el frontend filtra por estos". Hasta ahora no lo hacía
 * y el menú se mostraba completo a todos los roles.
 *
 * Un módulo **sin clasificar** en el backend devuelve `true`: la matriz cubre
 * 11 de los 21 módulos de la SPA, y esconder los otros 10 por omisión se los
 * quitaría también a los administradores.
 */
export function useModuloVisible(): (modulo?: string) => boolean {
  const user = useAuth((s) => s.user);
  const visibles = user?.modulos_visibles;
  return (modulo?: string) => {
    if (!modulo) return true;
    if (!Array.isArray(visibles) || visibles.length === 0) return true;
    return visibles.includes(modulo);
  };
}

/**
 * Admin tier + Gerente Comercial.
 * Úsalo para vistas/acciones de mando intermedio que NO requieren
 * un admin puro (p.ej. ver totales de ventas en Reportes).
 */
export function useIsAdminOrGerente(): boolean {
  const user = useAuth((s) => s.user);
  const rol = normalize(user?.rol);
  return (
    rol === 'administrador' ||
    rol === 'superadmin' ||
    rol === 'admin' ||
    rol === 'gerente_comercial'
  );
}
