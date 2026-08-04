import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { ReportesPage } from '@/features/reportes/pages/ReportesPage';
import { ReportesServicioPage } from '@/features/reportes_servicio/pages/ReportesServicioPage';

const TABS = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'operativo', label: 'Operativo' },
] as const;

export function KpisPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') === 'operativo' ? 'operativo' : 'ventas';

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-4">
      <PageHeader title="Analítica" description="KPIs de ventas y operación" />
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              active === t.key
                ? 'border-accent-glow text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'ventas' ? <ReportesPage embedded /> : <ReportesServicioPage embedded />}
    </div>
  );
}
