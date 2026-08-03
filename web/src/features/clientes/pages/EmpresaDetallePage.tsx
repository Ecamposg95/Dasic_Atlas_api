import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Cliente } from '../types';
import { ResumenTab } from '../components/tabs/ResumenTab';
import { ActividadTab } from '../components/tabs/ActividadTab';
import { NotasTab } from '../components/tabs/NotasTab';
import { DealsTab } from '../components/tabs/DealsTab';
import { ContactosTab } from '../components/tabs/ContactosTab';
import { EstadoCuentaTab } from '../components/tabs/EstadoCuentaTab';

const TABS = ['Resumen', 'Contactos', 'Estado de cuenta', 'Actividad', 'Notas', 'Deals'] as const;
type Tab = (typeof TABS)[number];

const estatusBadge: Record<string, string> = {
  activo: 'bg-emerald-500/15 text-emerald-400',
  inactivo: 'bg-muted-foreground/15 text-muted-foreground',
  prospecto: 'bg-sky-500/15 text-sky-400',
};

export function EmpresaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const clienteId = Number(id);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Resumen');

  const { data: empresa } = useQuery<Cliente>({
    queryKey: ['cliente', clienteId],
    queryFn: () => api.get<Cliente>(`/api/clientes/${clienteId}`),
    enabled: clienteId > 0,
  });

  if (!clienteId) return <div className="p-6">Empresa inválida.</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/spa/clientes')} className="text-xs text-muted-foreground hover:underline mb-2">← Empresas</button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{empresa?.nombre_empresa ?? 'Empresa'}</h1>
          <div className="text-sm text-muted-foreground">
            {empresa?.rfc_tax_id ?? 'sin RFC'}
            {empresa?.estatus && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${estatusBadge[empresa.estatus] ?? ''}`}>{empresa.estatus}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-accent-glow text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Resumen' && <ResumenTab clienteId={clienteId} />}
      {tab === 'Contactos' && <ContactosTab clienteId={clienteId} />}
      {tab === 'Estado de cuenta' && <EstadoCuentaTab clienteId={clienteId} monedaCredito={empresa?.moneda_credito} />}
      {tab === 'Actividad' && <ActividadTab clienteId={clienteId} />}
      {tab === 'Notas' && <NotasTab clienteId={clienteId} />}
      {tab === 'Deals' && <DealsTab clienteId={clienteId} />}
    </div>
  );
}

export default EmpresaDetallePage;
