import { NavLink } from 'react-router-dom';
import { Hexagon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useIsSuperadmin } from '@/lib/permissions';

// ─── Health banner types (minimal — only what the banner needs) ──────────────
type BannerHealth = {
  app?: { version?: string; git_sha?: string; env?: string };
};

// ─── Sub-nav links ────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { to: '/spa/superadmin',               label: 'Overview',        end: true  },
  { to: '/spa/superadmin/usuarios',      label: 'Usuarios',        end: false },
  { to: '/spa/superadmin/config',        label: 'Configuración',   end: false },
  { to: '/spa/superadmin/audit',         label: 'Auditoría',       end: false },
  { to: '/spa/superadmin/salud',         label: 'Salud',           end: false },
  { to: '/spa/superadmin/mantenimiento', label: 'Mantenimiento',   end: false },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface PlatformShellProps {
  title: string;
  children: React.ReactNode;
}

export function PlatformShell({ title, children }: PlatformShellProps) {
  const isSuperadmin = useIsSuperadmin();

  const { data: health } = useQuery<BannerHealth>({
    queryKey: ['superadmin', 'health', 'banner'],
    queryFn: () => api.get<BannerHealth>('/api/superadmin/health'),
    staleTime: 60_000,
    // Don't throw on error — banner stays visible without badges
    retry: false,
  });

  if (!isSuperadmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Solo el super-administrador puede acceder a esta consola.
      </div>
    );
  }

  const version = health?.app?.version;
  const gitSha = health?.app?.git_sha;
  const env = health?.app?.env;
  const shortSha = gitSha ? gitSha.slice(0, 7) : null;

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Dev banner ──────────────────────────────────────────────────────── */}
      <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Hexagon className="h-4 w-4 text-emerald-400 fill-emerald-400/20" />
          <span className="font-mono text-xs font-bold text-emerald-400 tracking-widest uppercase">
            Atlas · Platform Console
          </span>
        </div>
        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-500/70">
          entorno de plataforma · solo dev
        </span>
        {/* Badges: only render when health loaded */}
        {env && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 uppercase">
            {env}
          </span>
        )}
        {version && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            v{version}
          </span>
        )}
        {shortSha && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground border border-muted-foreground/20">
            {shortSha}
          </span>
        )}
      </div>

      {/* ── Horizontal sub-nav ──────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 px-4 py-1.5 bg-emerald-500/5 border-b border-emerald-500/20 overflow-x-auto">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              [
                'font-mono text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10',
              ].join(' ')
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Page title ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-3 border-b border-emerald-500/10">
        <h1 className="font-mono text-xl font-bold text-emerald-400 tracking-tight">
          {title}
        </h1>
      </div>

      {/* ── Content area with faint platform tint ───────────────────────────── */}
      <div className="flex-1 bg-emerald-500/[0.02] p-6">
        {children}
      </div>
    </div>
  );
}
