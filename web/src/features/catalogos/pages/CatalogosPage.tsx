import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookMarked, Tags, Layers, Ruler, Wrench, FileSearch } from 'lucide-react';
import { api } from '@/lib/api';
import type { ResumenCatalogo } from '../types';
import { MarcasTab } from '../components/MarcasTab';
import { CategoriasTab } from '../components/CategoriasTab';
import { UnidadesTab } from '../components/UnidadesTab';
import { CategoriasServicioTab } from '../components/CategoriasServicioTab';
import { SatTab } from '../components/SatTab';

type Tab = 'marcas' | 'categorias' | 'unidades' | 'categorias-servicio' | 'sat';

const TABS: { key: Tab; label: string; Icon: typeof Tags }[] = [
  { key: 'marcas', label: 'Marcas', Icon: Tags },
  { key: 'categorias', label: 'Categorías de producto', Icon: Layers },
  { key: 'unidades', label: 'Unidades', Icon: Ruler },
  { key: 'categorias-servicio', label: 'Categorías de servicio', Icon: Wrench },
  { key: 'sat', label: 'Catálogos SAT', Icon: FileSearch },
];

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
      <header className="flex items-center gap-2">
        <BookMarked className="h-5 w-5 text-accent-glow" />
        <h1 className="text-2xl font-semibold">Catálogos</h1>
      </header>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Marcas</div>
            <div className="text-2xl font-bold">{resumen.total_marcas}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Productos</div>
            <div className="text-2xl font-bold">{resumen.total_productos}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Categorías</div>
            <div className="text-2xl font-bold">{resumen.total_categorias_producto}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Unidades</div>
            <div className="text-2xl font-bold">{resumen.total_unidades}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex gap-1 overflow-x-auto whitespace-nowrap">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px inline-flex items-center gap-1.5 ${
              tab === key
                ? 'border-accent-glow text-accent-glow'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

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
