import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookMarked, Tags, Layers, Ruler, Wrench, FileSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import type { ResumenCatalogo } from '../types';
import { MarcasTab } from '../components/MarcasTab';
import { CategoriasTab } from '../components/CategoriasTab';
import { UnidadesTab } from '../components/UnidadesTab';
import { CategoriasServicioTab } from '../components/CategoriasServicioTab';
import { SatTab } from '../components/SatTab';

type Tab = 'marcas' | 'categorias' | 'unidades' | 'categorias-servicio' | 'sat';

const TAB_DEFS: { key: Tab; text: string; Icon: typeof Tags }[] = [
  { key: 'marcas', text: 'Marcas', Icon: Tags },
  { key: 'categorias', text: 'Categorías de producto', Icon: Layers },
  { key: 'unidades', text: 'Unidades', Icon: Ruler },
  { key: 'categorias-servicio', text: 'Categorías de servicio', Icon: Wrench },
  { key: 'sat', text: 'Catálogos SAT', Icon: FileSearch },
];

const TABS = TAB_DEFS.map(({ key, text, Icon }) => ({
  key,
  label: (
    <span className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  ),
}));

export function CatalogosPage() {
  const [tab, setTab] = useState<Tab>('marcas');

  const { data: resumen, error } = useQuery<ResumenCatalogo>({
    queryKey: ['catalogos', 'resumen'],
    queryFn: () => api.get<ResumenCatalogo>('/api/catalogos/resumen'),
    staleTime: 60_000,
  });

  // 401 → login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-accent-glow" />
            Catálogos
          </span>
        }
      />

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Marcas</div>
            <div className="text-xl font-bold">{resumen.total_marcas}</div>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Productos</div>
            <div className="text-xl font-bold">{resumen.total_productos}</div>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Categorías</div>
            <div className="text-xl font-bold">{resumen.total_categorias_producto}</div>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Unidades</div>
            <div className="text-xl font-bold">{resumen.total_unidades}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="overflow-x-auto whitespace-nowrap" />

      {/* Tab content */}
      <div>
        {tab === 'marcas' && <MarcasTab />}
        {tab === 'categorias' && <CategoriasTab />}
        {tab === 'unidades' && <UnidadesTab />}
        {tab === 'categorias-servicio' && <CategoriasServicioTab />}
        {tab === 'sat' && <SatTab />}
      </div>
    </div>
  );
}
