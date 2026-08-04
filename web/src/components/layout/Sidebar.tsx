import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useIsSuperadmin } from '@/lib/permissions';
import { branding } from '@/lib/branding';
import { SECTIONS } from './nav-config';

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
        {/* Marca: badge de acento + wordmark */}
        <div
          className={`flex items-center gap-3 px-4 pt-5 pb-4 shrink-0 border-b border-sidebar-border ${
            collapsed ? 'md:px-0 md:justify-center' : ''
          }`}
          title={`${branding.organizationName} · ${branding.productName}`}
        >
          <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-accent-glow to-accent-deep flex items-center justify-center shadow-glow-accent">
            <span className="text-sm font-black text-slate-950 leading-none">
              {branding.organizationName.charAt(0)}
            </span>
          </div>
          <div className={`min-w-0 leading-tight ${collapsed ? 'md:hidden' : ''}`}>
            <div className="text-[15px] font-bold tracking-tight text-sidebar-strong truncate">
              {branding.organizationName}
            </div>
            <div className="text-[9.5px] uppercase tracking-[0.22em] text-sidebar-dim truncate">
              {branding.productName} <span className="text-accent-glow">·</span> {branding.tagline}
            </div>
          </div>
        </div>

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {secciones.map((section) => (
            <div key={section.title}>
              <div
                className={`px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-dim ${
                  collapsed ? 'md:hidden' : ''
                }`}
              >
                {section.title}
              </div>
              {/* Separador visual entre grupos en modo colapsado */}
              <div className={`hidden ${collapsed ? 'md:block' : ''} mx-3 mb-2 border-t border-sidebar-border`} />
              <div className="space-y-0.5">
                {section.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors duration-150 ${
                        collapsed ? 'md:justify-center md:px-0' : ''
                      } ${
                        isActive
                          ? 'bg-sidebar-activebg text-sidebar-active font-semibold'
                          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Rail de acento del ítem activo */}
                        <span
                          className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-active transition-opacity ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          } ${collapsed ? 'md:hidden' : ''}`}
                          aria-hidden="true"
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? 'text-sidebar-active' : 'text-sidebar-dim group-hover:text-sidebar-strong'
                          }`}
                        />
                        <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
                      </>
                    )}
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
