import { useEffect, useMemo, useState } from 'react';
import { Truck, AlertTriangle, Package } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { useCotizador } from '../store';
import { useProveedores } from '../hooks/useProveedores';
import { agruparOCs, type GrupoOC, type SubtotalPorMoneda } from '../lib/previewOC';

function fmtMoney(n: number, m: string) {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function SubtotalesLine({ subtotales }: { subtotales: SubtotalPorMoneda[] }) {
  if (subtotales.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-sm text-accent-glow">
      {subtotales.map((s, i) => (
        <span key={s.moneda}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {fmtMoney(s.monto, s.moneda)}
        </span>
      ))}
    </span>
  );
}

/**
 * Drawer lateral derecho: muestra el desglose de OCs que NACERÁN al guardar
 * la cotización. Todo client-side: no llama al backend, proyecta desde el
 * cart actual usando `agruparOCs`.
 *
 * Se abre por `window.dispatchEvent(new CustomEvent('cot:open-preview-oc'))`.
 * Patrón visual idéntico a `DrawerBorradores`.
 */
export function PreviewOCDrawer() {
  const [open, setOpen] = useState(false);
  const cart = useCotizador((s) => s.cart);
  const { data: proveedores } = useProveedores();

  useEffect(() => {
    function onOpen() {
      window.dispatchEvent(new CustomEvent('cot:close-borradores'));
      setOpen(true);
    }
    function onClose() { setOpen(false); }
    window.addEventListener('cot:open-preview-oc', onOpen);
    window.addEventListener('cot:close-preview-oc', onClose);
    return () => {
      window.removeEventListener('cot:open-preview-oc', onOpen);
      window.removeEventListener('cot:close-preview-oc', onClose);
    };
  }, []);

  const grupos = useMemo<GrupoOC[]>(() => agruparOCs(cart), [cart]);

  if (!open) return null;

  const provMap = new Map((proveedores ?? []).map((p) => [p.id, p.nombre_empresa]));
  const gruposConProv = grupos.filter((g) => g.proveedor_id != null);
  const grupoSinProv = grupos.find((g) => g.proveedor_id == null) ?? null;
  const isEmpty = cart.length === 0;

  return (
    // `data-overlay` marca overlay abierto para useAtajos (suprime atajos de teclado).
    <div data-overlay className="contents">
      <Drawer
        size="md"
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-accent-glow" /> Preview OCs
          </span>
        }
        footer={
          <p className="w-full text-[10px] text-muted-foreground leading-relaxed">
            Subtotales por proveedor en moneda nativa de cada línea (sin TC, sin
            utilidad, sin descuento). El backend genera las OCs reales al usar
            "Sugerir OC" después de guardar.
          </p>
        }
      >
        <div className="space-y-3">
          {isEmpty && (
            <div className="text-xs text-muted-foreground text-center p-6 flex flex-col items-center gap-2">
              <Package className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <span>Agrega productos al carrito para ver el preview de OCs.</span>
            </div>
          )}

          {!isEmpty && (
            <>
              <div className="text-[11px] text-muted-foreground">
                Proyección al guardar la cotización: {gruposConProv.length} OC(s)
                {grupoSinProv ? ` · ${grupoSinProv.items.length} línea(s) sin proveedor` : ''}
              </div>

              {gruposConProv.map((g) => {
                const nombre =
                  g.proveedor_id != null
                    ? provMap.get(g.proveedor_id) ?? `Proveedor #${g.proveedor_id}`
                    : '—';
                return (
                  <div
                    key={g.proveedor_id ?? 'sin'}
                    className="bg-slate-100 dark:bg-slate-950 border border-border rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{nombre}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {g.items.length} línea(s)
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Total
                        </div>
                        <SubtotalesLine subtotales={g.subtotales} />
                      </div>
                    </div>
                    <ul className="space-y-1 text-xs">
                      {g.items.map((it) => (
                        <li key={it.uid} className="flex items-baseline gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span className="font-mono text-cyan-400 shrink-0">
                            {it.sku}
                          </span>
                          <span className="text-muted-foreground shrink-0">×{it.qty}</span>
                          <span className="text-foreground truncate flex-1">
                            {it.nom}
                          </span>
                          <span className="font-mono text-muted-foreground shrink-0">
                            {fmtMoney(it.cost, it.moneda)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {grupoSinProv && (
                <div className="bg-amber-900/10 border border-amber-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2 text-amber-300 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Sin proveedor ({grupoSinProv.items.length} línea
                    {grupoSinProv.items.length === 1 ? '' : 's'})
                  </div>
                  <ul className="space-y-1 text-xs text-amber-200/80">
                    {grupoSinProv.items.map((it) => (
                      <li key={it.uid} className="flex items-baseline gap-2">
                        <span className="text-amber-500/60">•</span>
                        <span className="font-mono text-amber-300 shrink-0">
                          {it.sku}
                        </span>
                        <span className="text-amber-300/70 shrink-0">×{it.qty}</span>
                        <span className="truncate flex-1">{it.nom}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-300/70 mt-2">
                    Asigna proveedor para que estas líneas generen OC.
                    {' '}
                    {grupoSinProv.items.some((i) => i.tipo_linea === 'producto_catalogo') && (
                      <span>
                        Productos del catálogo se heredan de
                        {' '}<code>proveedor_principal_id</code>.
                      </span>
                    )}
                  </p>
                </div>
              )}

              {gruposConProv.length === 0 && !grupoSinProv && (
                <div className="text-xs text-muted-foreground text-center p-4">
                  No hay líneas para agrupar.
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
