import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Settings, User as UserIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuth, type User } from '@/stores/auth';
import { branding } from '@/lib/branding';
import { ThemeToggle } from './ThemeToggle';

function initialsOf(u: User): string {
  const parts = (u.nombre || u.email || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Aún si falla el POST (cookie ya inválida, red caída), forzamos cleanup local.
    }
    setUser(null);
    setOpen(false);
    setBusy(false);
    toast({ kind: 'success', title: 'Sesión cerrada' });
    navigate('/', { replace: true });
  }

  return (
    <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-card/70 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menú"
          className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
          {branding.organizationName} <span className="text-accent-glow">·</span> {branding.productName}
        </h2>
      </div>

      {user && (
        <div className="flex items-center gap-1">
          <ThemeToggle />

          <button
            type="button"
            onClick={onLogout}
            disabled={busy}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-2 transition group"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow">
                {initialsOf(user)}
              </span>
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm text-foreground">{user.nombre || user.email}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.rol_label}</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-elev-2 overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  disabled
                  title="Próximamente"
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground flex items-center gap-2 cursor-not-allowed"
                >
                  <UserIcon className="h-3.5 w-3.5" /> Mi perfil
                </button>
                <button
                  type="button"
                  disabled
                  title="Próximamente"
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground flex items-center gap-2 cursor-not-allowed"
                >
                  <Settings className="h-3.5 w-3.5" /> Configuración
                </button>
                <div className="border-t border-border" />
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 text-sm text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2 transition disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {busy ? 'Cerrando…' : 'Cerrar sesión'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
