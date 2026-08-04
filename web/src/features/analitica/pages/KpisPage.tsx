import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
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
      <Tabs
        tabs={TABS}
        value={active}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
      />
      {active === 'ventas' ? <ReportesPage embedded /> : <ReportesServicioPage embedded />}
    </div>
  );
}
