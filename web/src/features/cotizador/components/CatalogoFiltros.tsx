import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Shape real del backend (`app/routers/catalogos.py`):
//   GET /api/catalogos/marcas             → MarcaResponse[]
//   GET /api/catalogos/categorias-producto → { items: [{ categoria, n_productos }] }
//
// Importante: el endpoint de categorías NO devuelve `id` — son strings libres
// del campo `productos.categoria`. Por eso usamos `nombre` como identidad.

type Marca = {
  id: number;
  nombre: string;
  abreviatura: string;
  categoria: string | null;
  n_productos: number;
};

type CategoriasResponse = {
  items: Array<{ categoria: string; n_productos: number }>;
};

// 'fantasma' se eliminó como tab independiente (2026-05-26): la búsqueda
// de productos ahora incluye fantasmas previos en la misma lista mezclada,
// con badge ámbar y `×veces_solicitado` para distinguirlos.
type Props = {
  tipo: 'producto' | 'servicio';
  onTipoChange: (t: 'producto' | 'servicio') => void;
  marcaId: number | null;
  marcaNombre: string | null;
  onMarcaChange: (id: number | null, nombre: string | null) => void;
  categoriaNombre: string | null;
  onCategoriaChange: (nombre: string | null) => void;
};

export function CatalogoFiltros(props: Props) {
  const { data: marcas } = useQuery<Marca[]>({
    queryKey: ['catalogos', 'marcas'],
    queryFn: () => api.get<Marca[]>('/api/catalogos/marcas'),
    staleTime: 5 * 60_000,
  });
  const { data: categoriasResp } = useQuery<CategoriasResponse>({
    queryKey: ['catalogos', 'categorias-producto'],
    queryFn: () => api.get<CategoriasResponse>('/api/catalogos/categorias-producto'),
    staleTime: 5 * 60_000,
  });

  const categorias = categoriasResp?.items ?? [];

  // La tabla `marcas` tiene filas duplicadas por nombre (captura manual, con
  // distinta abreviatura). El filtro de productos abajo filtra por NOMBRE
  // (useProductosSearch manda `marca=<nombre>`), así que colapsar el dropdown
  // por nombre es correcto: una opción por marca, sumando sus productos, y el
  // filtro sigue trayendo todos los productos de esa marca.
  const marcasUnicas = useMemo(() => {
    const map = new Map<string, { id: number; nombre: string; n_productos: number }>();
    for (const m of marcas ?? []) {
      const key = m.nombre.trim().toLowerCase();
      const ex = map.get(key);
      if (ex) {
        ex.n_productos += m.n_productos;
      } else {
        map.set(key, { id: m.id, nombre: m.nombre, n_productos: m.n_productos });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [marcas]);

  return (
    <div className="flex flex-col gap-2 mb-2">
      <div className="inline-flex gap-1 p-1 rounded-md bg-background/60 border border-border w-fit">
        <button
          type="button"
          onClick={() => props.onTipoChange('producto')}
          className={`px-2.5 py-1 text-[11px] rounded transition ${
            props.tipo === 'producto'
              ? 'bg-surface-2 text-accent-glow'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Productos
        </button>
        <button
          type="button"
          onClick={() => props.onTipoChange('servicio')}
          className={`px-2.5 py-1 text-[11px] rounded transition ${
            props.tipo === 'servicio'
              ? 'bg-surface-2 text-emerald-300'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Servicios
        </button>
      </div>
      {props.tipo === 'producto' && (
        <div className="flex gap-2">
          <select
            value={props.marcaId ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                props.onMarcaChange(null, null);
                return;
              }
              const id = Number(raw);
              const m = marcasUnicas.find((x) => x.id === id);
              props.onMarcaChange(id, m?.nombre ?? null);
            }}
            className="h-8 rounded border border-border-strong bg-card px-2 text-xs flex-1 focus:border-accent-glow outline-none"
          >
            <option value="">Todas las marcas</option>
            {marcasUnicas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
                {m.n_productos > 0 ? ` (${m.n_productos})` : ''}
              </option>
            ))}
          </select>
          <select
            value={props.categoriaNombre ?? ''}
            onChange={(e) => props.onCategoriaChange(e.target.value || null)}
            className="h-8 rounded border border-border-strong bg-card px-2 text-xs flex-1 focus:border-accent-glow outline-none"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria}
                {c.n_productos > 0 ? ` (${c.n_productos})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
