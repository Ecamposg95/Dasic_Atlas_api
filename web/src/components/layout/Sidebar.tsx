import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, BellRing, BookMarked, ChevronsLeft, ChevronsRight, ClipboardCheck, Coins, Contact,
  FileClock, FileText, Ghost, KanbanSquare, LayoutDashboard, ListChecks, Package, Receipt,
  ShoppingCart, ShieldCheck, Tags, Truck, UserCog, Users, Wallet, Wrench,
} from 'lucide-react';
import { useIsSuperadmin } from '@/lib/permissions';
import { branding } from '@/lib/branding';

type NavItem = { to: string; label: string; Icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
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

export function Sidebar({
  open,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: {
  open: boolean;
  onClose: () => void;
  /** Modo compacto (solo iconos) en desktop; en móvil el drawer siempre es completo. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const isSuper = useIsSuperadmin();
  const secciones = isSuper ? SECTIONS : SECTIONS.filter((s) => s.title !== 'Plataforma');

  // Cerrar el drawer con Escape (solo relevante en mobile; en desktop es estático).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[88vw] bg-sidebar text-sidebar-text border-r border-sidebar-border flex flex-col transition-transform duration-200 md:static md:translate-x-0 md:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[68px]' : 'md:w-64'}`}
      >
        <div className={`px-4 pt-4 pb-3 shrink-0 border-b border-sidebar-border ${collapsed ? 'md:px-0 md:text-center' : ''}`}>
          <div className="text-xl font-bold leading-tight" title={`${branding.organizationName} · ${branding.productName}`}>
            {collapsed ? (
              <>
                <span className="hidden md:inline">{branding.organizationName.charAt(0)}</span>
                <span className="md:hidden">{branding.organizationName}</span>
              </>
            ) : (
              branding.organizationName
            )}
          </div>
          <div className={`text-[10px] uppercase tracking-[0.2em] text-sidebar-dim mt-0.5 ${collapsed ? 'md:hidden' : ''}`}>
            {branding.productName} <span className="text-accent-glow">·</span> {branding.tagline}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {secciones.map((section) => (
            <div key={section.title}>
              <div className={`px-2 mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-dim ${collapsed ? 'md:hidden' : ''}`}>
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition ${
                        collapsed ? 'md:justify-center md:px-0' : ''
                      } ${
                        isActive
                          ? 'bg-sidebar-activebg text-sidebar-active font-medium'
                          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong'
                      }`
                    }
                  >
                    <Icon className={`shrink-0 ${collapsed ? 'h-3.5 w-3.5 md:h-4 md:w-4' : 'h-3.5 w-3.5'}`} />
                    <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {onToggleCollapsed && (
          <div className="hidden md:block shrink-0 border-t border-sidebar-border p-2">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-sidebar-dim hover:bg-sidebar-hover hover:text-sidebar-strong transition ${
                collapsed ? 'justify-center px-0' : ''
              }`}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              {!collapsed && <span>Colapsar</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
