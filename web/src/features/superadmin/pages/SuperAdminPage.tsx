import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, ScrollText, Activity, Database, UserCog } from 'lucide-react';
import { PlatformShell } from '../components/PlatformShell';

const CARDS = [
  {
    to: '/spa/superadmin/usuarios',
    icon: UserCog,
    title: 'Usuarios de plataforma',
    desc: 'Crear y gestionar cuentas, incl. superadmins.',
    activo: true,
  },
  {
    to: '/spa/superadmin/config',
    icon: SlidersHorizontal,
    title: 'Configuración',
    desc: 'IVA y vigencia de cotización, sin redeploy.',
    activo: true,
  },
  {
    to: '/spa/superadmin/audit',
    icon: ScrollText,
    title: 'Auditoría',
    desc: 'Línea de tiempo de actividad registrada.',
    activo: true,
  },
  {
    to: '/spa/superadmin/salud',
    icon: Activity,
    title: 'Salud del sistema',
    desc: 'Estado de app, DB, integraciones y FX.',
    activo: true,
  },
  {
    to: '/spa/superadmin/mantenimiento',
    icon: Database,
    title: 'Datos y mantenimiento',
    desc: 'Re-seeds, jobs, ingesta de contexto y zona roja.',
    activo: true,
  },
];

export function SuperAdminPage() {
  const navigate = useNavigate();

  return (
    <PlatformShell title="Consola de plataforma">
      <div className="max-w-4xl">
        <p className="font-mono text-xs text-muted-foreground mb-6">
          Acceso restringido al super-administrador. Módulos de configuración, auditoría y mantenimiento.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CARDS.map((c) => (
            <button
              key={c.title}
              type="button"
              disabled={!c.activo}
              onClick={() => c.activo && navigate(c.to)}
              className={[
                'text-left rounded-xl p-4 transition-all',
                c.activo
                  ? 'border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer'
                  : 'border border-dashed border-border opacity-50 cursor-not-allowed',
              ].join(' ')}
            >
              <c.icon className="h-5 w-5 text-emerald-400 mb-3" />
              <div className="font-mono text-sm font-semibold text-foreground">{c.title}</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-1">{c.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </PlatformShell>
  );
}
