import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, BellRing, BookMarked, ClipboardCheck, Coins, Contact, FileClock, FileText, Ghost,
  KanbanSquare, LayoutDashboard, ListChecks, Package, Receipt, ShoppingCart, ShieldCheck, Tags,
  Truck, UserCog, Users, Wallet, Wrench,
} from 'lucide-react';

// Config única de navegación: el Sidebar la renderiza y el Header deriva
// breadcrumbs de ella. Un solo lugar para agregar/reordenar módulos.

export type NavItem = { to: string; label: string; Icon: LucideIcon };
export type NavSection = { title: string; items: NavItem[] };

export const SECTIONS: NavSection[] = [
  {
    title: 'Comercial',
    items: [
      { to: '/spa/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/spa/crm', label: 'CRM Pipeline', Icon: KanbanSquare },
      { to: '/spa/cotizador', label: 'Cotizador', Icon: FileText },
      { to: '/spa/borradores', label: 'Borradores', Icon: FileClock },
      { to: '/spa/seguimiento', label: 'Seguimiento', Icon: ListChecks },
      { to: '/spa/recordatorios', label: 'Recordatorios', Icon: BellRing },
    ],
  },
  {
    title: 'Clientes',
    items: [
      { to: '/spa/clientes', label: 'Empresas', Icon: Users },
      { to: '/spa/contactos', label: 'Contactos', Icon: Contact },
    ],
  },
  {
    title: 'Operación',
    items: [
      { to: '/spa/compras', label: 'Compras', Icon: ShoppingCart },
      { to: '/spa/remisiones', label: 'Remisiones', Icon: Truck },
      { to: '/spa/reportes-servicio-docs', label: 'Reportes de servicio', Icon: ClipboardCheck },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/spa/inventario', label: 'Catálogo de productos', Icon: Package },
      { to: '/spa/servicios', label: 'Servicios', Icon: Wrench },
      { to: '/spa/precios', label: 'Precios', Icon: Tags },
      { to: '/spa/fantasmas', label: 'Fantasmas', Icon: Ghost },
      { to: '/spa/catalogos', label: 'Diccionarios', Icon: BookMarked },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/spa/cuentas-por-cobrar', label: 'Cuentas por cobrar', Icon: Wallet },
      { to: '/spa/gastos', label: 'Gastos', Icon: Receipt },
      { to: '/spa/fx', label: 'Tipo de cambio', Icon: Coins },
    ],
  },
  {
    title: 'Analítica',
    items: [
      { to: '/spa/analitica', label: 'KPIs', Icon: BarChart3 },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/spa/usuarios', label: 'Usuarios', Icon: UserCog },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      { to: '/spa/superadmin', label: 'Consola', Icon: ShieldCheck },
    ],
  },
];

// Rutas que no aparecen en el menú pero pertenecen a una sección (breadcrumbs).
const EXTRA_ROUTES: Array<{ prefix: string; section: string; label: string }> = [
  { prefix: '/spa/empresas-unificar', section: 'Clientes', label: 'Empresas' },
  { prefix: '/spa/empresas/', section: 'Clientes', label: 'Empresas' },
  { prefix: '/spa/remisiones-nueva', section: 'Operación', label: 'Remisiones' },
  { prefix: '/spa/superadmin/', section: 'Plataforma', label: 'Consola' },
];

/** Devuelve [sección, página] para la ruta actual, o null si no se reconoce. */
export function breadcrumbFor(pathname: string): [string, string] | null {
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (pathname === it.to) return [s.title, it.label];
    }
  }
  for (const r of EXTRA_ROUTES) {
    if (pathname.startsWith(r.prefix)) return [r.section, r.label];
  }
  return null;
}
