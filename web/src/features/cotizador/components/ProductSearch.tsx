import { useState, useEffect, useRef, useCallback } from 'react';
import { useDismiss } from '@/lib/useDismiss';
import { Search, Package, Sparkles, Ghost, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ApiError } from '@/lib/api';
import { useProductosSearch } from '../hooks/useProductosSearch';
import { useFantasmasSearch, type FantasmaPrevio } from '../hooks/useFantasmasSearch';
import { fetchAutoUtilidad } from '../hooks/useAutoUtilidad';
import { useCotizador } from '../store';
import type { Producto, Servicio } from '../types';
import { CatalogoFiltros } from './CatalogoFiltros';

export type ProductSearchHandlers = {
  onPickProducto: (p: Producto, qty: number) => void | Promise<void>;
  onPickServicio: (s: Servicio, qty: number) => void;
  onPickFantasma: (f: FantasmaPrevio, qty: number) => void;
  onOpenAddFantasma: (initial: { initialSku?: string; initialDescripcion?: string }) => void;
};

export function ProductSearch({ handlers }: { handlers?: ProductSearchHandlers } = {}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  // Phase 5 (Task 5.1): filtros para el scope de búsqueda.
  // Desde 2026-05-26 el modo 'producto' busca en paralelo el catálogo Y los
  // fantasmas previos, mostrando todo en una sola lista mezclada. La tab
  // 'Fantasma' independiente se eliminó — solo queda Productos / Servicios.
  const [tipo, setTipo] = useState<'producto' | 'servicio'>('producto');
  const [marcaId, setMarcaId] = useState<number | null>(null);
  const [marcaNombre, setMarcaNombre] = useState<string | null>(null);
  const [categoriaNombre, setCategoriaNombre] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Container outer ref — necesario para el click-outside check porque la
  // estructura DOM ya no es input dentro de 2 niveles de div: ahora hay un
  // flex wrapper extra para el botón '+ Fantasma' (2026-05-23). El dropdown
  // es sibling del flex wrapper, así que basar el check en parentElement
  // chain del input bota el dropdown al primer click adentro.
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultHandlers: ProductSearchHandlers = {
    onPickProducto: async (p, qty) => {
      const cliente_id = useCotizador.getState().cliente_id;
      const util = await fetchAutoUtilidad(cliente_id, p.id);
      useCotizador.getState().addProducto(p, qty, util ?? undefined);
    },
    onPickServicio: (svc, qty) => useCotizador.getState().addServicio(svc, qty),
    onPickFantasma: (f, qty) =>
      useCotizador.getState().addLineaAdhoc({
        descripcion: f.descripcion,
        sku_libre: f.sku_libre || undefined,
        costo: Number(f.costo_referencia) || 0,
        moneda: (f.moneda || 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN',
        proveedor_sugerido_id: f.proveedor_sugerido_id,
        utilidad: 30,
        qty,
      }),
    onOpenAddFantasma: (initial) =>
      window.dispatchEvent(new CustomEvent('cot:open-add-fantasma', { detail: initial })),
  };
  const h = handlers ?? defaultHandlers;
  const { data, isLoading, error } = useProductosSearch({
    q,
    tipo,
    marca_id: marcaId,
    marca_nombre: marcaNombre,
    categoria_nombre: categoriaNombre,
  });

  const items = data?.items ?? [];
  const servicios = data?.servicios ?? [];
  const cantidadParseada = data?.cantidad ?? null;

  // En modo producto, traemos también fantasmas previos para mostrarlos
  // mezclados debajo de los productos del catálogo. En modo servicio no
  // tiene sentido — los servicios son su propio dominio.
  const fantasmasQuery = useFantasmasSearch(tipo === 'producto' ? q : '');
  const fantasmas: FantasmaPrevio[] = tipo === 'producto' ? fantasmasQuery.items : [];
  const fantasmasLoading = tipo === 'producto' && fantasmasQuery.isLoading;

  // Auth error en la búsqueda → bounce a login.
  // CotizadorPage solo redirige por errores de useCotizacionLoader; el primary
  // variant de useProductosSearch ahora burbujea 401 y lo manejamos aquí.
  useEffect(() => {
    const status = (error as unknown as ApiError | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  // Close on outside click or Escape — check contra containerRef (incluye filtros,
  // input, botón fantasma Y dropdown). Si target está dentro, no cerrar.
  const closeSearch = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, closeSearch, open);

  async function onSelect(p: Producto) {
    await h.onPickProducto(p, cantidadParseada ?? 1);
    setQ('');
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onSelectServicio(s: Servicio) {
    h.onPickServicio(s, cantidadParseada ?? 1);
    setQ('');
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onSelectFantasma(f: FantasmaPrevio) {
    h.onPickFantasma(f, cantidadParseada ?? 1);
    setQ('');
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function fmtCost(cost: number, moneda: string) {
    return `${moneda} $${cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  }

  function stockChip(stock: number) {
    if (stock > 0) return <span className="text-[10px] bg-emerald-900/30 text-emerald-300 px-1.5 py-0.5 rounded">{stock} en stock</span>;
    if (stock === 0) return <span className="text-[10px] bg-amber-900/30 text-amber-300 px-1.5 py-0.5 rounded">Sin stock</span>;
    return <span className="text-[10px] bg-rose-900/30 text-rose-300 px-1.5 py-0.5 rounded">Stock negativo</span>;
  }

  return (
    <div className="relative" ref={containerRef}>
      <CatalogoFiltros
        tipo={tipo}
        onTipoChange={setTipo}
        marcaId={marcaId}
        marcaNombre={marcaNombre}
        onMarcaChange={(id, nombre) => {
          setMarcaId(id);
          setMarcaNombre(nombre);
        }}
        categoriaNombre={categoriaNombre}
        onCategoriaChange={setCategoriaNombre}
      />
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={
              tipo === 'servicio'
                ? 'Buscar servicio (ej. "instalación" o "SRV-0001")…'
                : 'Buscar producto o fantasma previo (ej. "5 GV2ME14" o "rodamiento")…'
            }
            className="pl-7 h-8 text-xs"
            data-cot-search
            aria-haspopup="listbox"
            aria-expanded={open}
          />
          {cantidadParseada != null && q.trim() && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold pointer-events-none flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" /> ×{cantidadParseada}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => h.onOpenAddFantasma({ initialDescripcion: '' })}
          title="Agregar producto que no está en el catálogo"
          className="shrink-0 h-8 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium rounded border border-amber-700/50 bg-amber-900/20 text-amber-300 hover:bg-amber-900/40 hover:border-amber-500 transition"
        >
          <Ghost className="h-3 w-3" />
          <span className="hidden sm:inline">Fantasma</span>
        </button>
      </div>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 mt-1 max-h-80 overflow-y-auto bg-card border border-border-strong rounded-md shadow-xl z-20">
          {tipo === 'servicio' ? (
            // Modo Servicios: render del catálogo de servicios.
            <>
              {(servicios.length > 0 || isLoading) && (
                <div className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center justify-between">
                  <span>{isLoading ? 'Buscando…' : `${servicios.length} servicio(s)`}</span>
                  {cantidadParseada != null && <span className="text-violet-400">Cantidad detectada: {cantidadParseada}</span>}
                </div>
              )}
              {!isLoading && servicios.length === 0 && (
                <div className="p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">Sin coincidencias en el catálogo de servicios</div>
                </div>
              )}
              {servicios.map((s) => (
                <button key={s.id} type="button" role="option" aria-selected={false} onClick={() => onSelectServicio(s)}
                  className="w-full text-left px-2 py-1.5 hover:bg-emerald-950/30 transition border-b border-border last:border-b-0 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-emerald-300">{s.codigo}</span>
                      {s.categoria_servicio && (
                        <span className="text-[10px] text-muted-foreground">· {s.categoria_servicio}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-foreground truncate">{s.nombre}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                    {fmtCost(Number(s.costo ?? 0), (s.moneda || 'MXN').toUpperCase())}
                  </div>
                </button>
              ))}
            </>
          ) : (
            // Modo producto unificado (2026-05-26): catálogo + fantasmas previos
            // en una sola lista. Productos primero (más prioritario), fantasmas
            // debajo con su badge ámbar y `×veces_solicitado`. Empty state ofrece
            // capturar fantasma nuevo solo cuando ambas búsquedas regresan vacío.
            (() => {
              const totalCount = items.length + fantasmas.length;
              const anyLoading = isLoading || fantasmasLoading;
              const bothEmpty = !anyLoading && totalCount === 0;
              return (
                <>
                  {(totalCount > 0 || anyLoading) && (
                    <div className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center justify-between">
                      <span>
                        {anyLoading
                          ? 'Buscando…'
                          : `${items.length} producto(s)${fantasmas.length > 0 ? ` · ${fantasmas.length} fantasma(s) previo(s)` : ''}`}
                      </span>
                      {cantidadParseada != null && (
                        <span className="text-violet-400">Cantidad detectada: {cantidadParseada}</span>
                      )}
                    </div>
                  )}
                  {bothEmpty && (
                    <div className="p-3 text-center space-y-2">
                      <div className="text-[11px] text-muted-foreground">
                        Sin coincidencias en el catálogo ni en fantasmas previos
                      </div>
                      {q.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            h.onOpenAddFantasma({ initialSku: q.trim() });
                            setOpen(false);
                            setQ('');
                          }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded border border-amber-700/50 bg-amber-900/20 text-amber-300 hover:bg-amber-900/40 hover:border-amber-500 transition"
                        >
                          <Ghost className="h-3 w-3" />
                          Agregar como fantasma "{q.trim().length > 30 ? q.trim().slice(0, 30) + '…' : q.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                  {items.map(({ producto: p }) => (
                    <button
                      key={`p-${p.id}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => onSelect(p)}
                      className="w-full text-left px-2 py-1.5 hover:bg-surface-2/60 transition border-b border-border last:border-b-0 flex items-center gap-2"
                    >
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-accent-glow">
                            {p.sku_comercial || p.sku}
                          </span>
                          {p.marca && <span className="text-[10px] text-muted-foreground">· {p.marca}</span>}
                          {stockChip(p.stock_actual)}
                        </div>
                        <div className="text-[11px] text-foreground truncate">{p.nombre}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                        {fmtCost(Number(p.costo_compra ?? 0), p.moneda_compra || 'MXN')}
                      </div>
                    </button>
                  ))}
                  {fantasmas.length > 0 && items.length > 0 && (
                    <div className="sticky z-[5] bg-amber-950/30 border-y border-amber-700/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-amber-300/80 flex items-center gap-1">
                      <Ghost className="h-2.5 w-2.5" /> Fantasmas previos
                    </div>
                  )}
                  {fantasmas.map((f) => (
                    <button
                      key={`f-${f.id}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => onSelectFantasma(f)}
                      className="w-full text-left px-2 py-1.5 hover:bg-amber-950/30 transition border-b border-border last:border-b-0 flex items-center gap-2"
                    >
                      <Ghost className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/50">
                            Fantasma
                          </span>
                          {f.sku_libre && (
                            <span className="font-mono text-[11px] font-bold text-amber-300">
                              {f.sku_libre}
                            </span>
                          )}
                          {f.proveedor_sugerido_nombre && (
                            <span className="text-[10px] text-muted-foreground">
                              · {f.proveedor_sugerido_nombre}
                            </span>
                          )}
                          {f.veces_solicitado > 1 && (
                            <span
                              className="text-[10px] bg-amber-900/30 text-amber-300 px-1.5 py-0.5 rounded"
                              title={`Solicitado ${f.veces_solicitado} veces previamente`}
                            >
                              ×{f.veces_solicitado}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-foreground truncate">{f.descripcion}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                        {(f.moneda || 'MXN').toUpperCase()} $
                        {Number(f.costo_referencia).toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </button>
                  ))}
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
