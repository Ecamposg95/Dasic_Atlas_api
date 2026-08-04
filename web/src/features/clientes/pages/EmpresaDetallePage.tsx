import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Cliente } from '../types';
import { ResumenTab } from '../components/tabs/ResumenTab';
import { ActividadTab } from '../components/tabs/ActividadTab';
import { NotasTab } from '../components/tabs/NotasTab';
import { DealsTab } from '../components/tabs/DealsTab';
import { ContactosTab } from '../components/tabs/ContactosTab';
import { EstadoCuentaTab } from '../components/tabs/EstadoCuentaTab';
import { PlantasTab } from '../components/tabs/PlantasTab';
import { ActivosTab } from '../components/tabs/ActivosTab';

const TABS = ['Resumen', 'Contactos', 'Plantas', 'Activos', 'Estado de cuenta', 'Actividad', 'Notas', 'Deals'] as const;
type Tab = (typeof TABS)[number];

const estatusBadge: Record<string, string> = {
  activo: 'bg-emerald-500/15 text-emerald-400',
  inactivo: 'bg-muted-foreground/15 text-muted-foreground',
  prospecto: 'bg-sky-500/15 text-sky-400',
};

export function EmpresaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const clienteId = Number(id);
  const [tab, setTab] = useState<Tab>('Resumen');

  const { data: empresa } = useQuery<Cliente>({
    queryKey: ['cliente', clienteId],
    queryFn: () => api.get<Cliente>(`/api/clientes/${clienteId}`),
    enabled: clienteId > 0,
  });

  if (!clienteId) return <div className="p-6">Empresa inválida.</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        backTo="/spa/clientes"
        backLabel="Empresas"
        title={empresa?.nombre_empresa ?? 'Empresa'}
        description={
          <>
            {empresa?.rfc_tax_id ?? 'sin RFC'}
            {empresa?.estatus && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${estatusBadge[empresa.estatus] ?? ''}`}>{empresa.estatus}</span>
            )}
          </>
        }
      />
      <Tabs
        className="mb-4 overflow-x-auto"
        tabs={TABS.map((t) => ({ key: t, label: t }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'Resumen' && <ResumenTab clienteId={clienteId} />}
      {tab === 'Contactos' && <ContactosTab clienteId={clienteId} />}
      {tab === 'Plantas' && <PlantasTab clienteId={clienteId} />}
      {tab === 'Activos' && <ActivosTab clienteId={clienteId} />}
      {tab === 'Estado de cuenta' && <EstadoCuentaTab clienteId={clienteId} monedaCredito={empresa?.moneda_credito} />}
      {tab === 'Actividad' && <ActividadTab clienteId={clienteId} />}
      {tab === 'Notas' && <NotasTab clienteId={clienteId} />}
      {tab === 'Deals' && <DealsTab clienteId={clienteId} />}
    </div>
  );
}

export default EmpresaDetallePage;
