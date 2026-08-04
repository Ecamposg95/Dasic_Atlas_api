import { useEffect, useRef } from 'react';
import { X, Truck, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/lib/confirm';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/lib/api';
import { useGenerarOC } from '../hooks/useSugerirOC';
import type { SugerirOCResponse } from '../types';

function fmtMoney(n: number, m: string) {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

// El backend (`/api/ventas/{id}/generar-oc`) no acepta selección parcial —
// genera todas las OCs sugeridas en una sola transacción. Por eso este modal
// muestra el preview por proveedor y delega en un único botón "Generar".
export function SugerirOCModal({
  cotizacionId,
  folio,
  data,
  onClose,
}: {
  cotizacionId: number;
  folio: string;
  data: SugerirOCResponse;
  onClose: () => void;
}) {
  const generar = useGenerarOC();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const porProveedor = data.por_proveedor ?? [];
  const sinProveedor = data.sin_proveedor ?? [];
  const hayProveedores = porProveedor.length > 0;
  const haySinProveedor = sinProveedor.length > 0;
  const stockSuficiente = !hayProveedores && !haySinProveedor;

  async function onGenerar() {
    if (!hayProveedores) {
      toast({ kind: 'error', title: 'No hay proveedores asignados', description: 'Asigna proveedor a los productos faltantes y vuelve a intentarlo.' });
      return;
    }
    if (haySinProveedor) {
      const cont = await confirm({
        mensaje: `Hay ${sinProveedor.length} línea(s) sin proveedor asignado que NO entrarán en la OC. ¿Continuar de todos modos?`,
        tono: 'danger',
      });
      if (!cont) return;
    }
    try {
      const r = await generar.mutateAsync(cotizacionId);
      toast({ kind: 'success', title: `${r.ocs.length} OC(s) creadas`, description: r.ocs.map((o) => o.folio).join(', ') });
      onClose();
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudieron generar las OCs', description: err.detail });
    }
  }

  return (
    <div
      data-overlay
      className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sugeriroc-title" className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full p-5 my-4">
        <div className="flex items-center justify-between mb-4">
          <h3 id="sugeriroc-title" className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4 text-accent-glow" /> Sugerir órdenes de compra · {folio}
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {stockSuficiente && (
          <div className="text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-700/50 rounded p-4 flex items-center gap-2">
            <Check className="h-4 w-4" /> Stock suficiente para todas las líneas. No se requieren OCs.
          </div>
        )}

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {porProveedor.map((prov) => {
            const items = prov.items ?? [];
            return (
              <div key={prov.proveedor_id} className="bg-background border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-semibold text-sm flex-1">{prov.proveedor_empresa ?? `Proveedor #${prov.proveedor_id}`}</div>
                  <div className="font-mono text-sm text-accent-glow">
                    {fmtMoney(prov.subtotal, items[0]?.moneda ?? 'MXN')}
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] text-muted-foreground uppercase">
                    <tr>
                      <th className="text-left py-1">SKU</th>
                      <th className="text-left py-1">Descripción</th>
                      <th className="text-center py-1">Cantidad</th>
                      <th className="text-right py-1">Costo unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l, idx) => (
                      <tr key={`${prov.proveedor_id}-${l.producto_id ?? 'fantasma'}-${idx}`} className="border-t border-border">
                        <td className="py-1 font-mono text-cyan-400">{l.sku ?? '—'}</td>
                        <td className="py-1 text-foreground truncate max-w-xs">{l.nombre}</td>
                        <td className="py-1 text-center">{l.cantidad}</td>
                        <td className="py-1 text-right font-mono">{fmtMoney(l.costo_unitario, l.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {haySinProveedor && (
            <div className="bg-amber-900/10 border border-amber-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2 text-amber-300 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4" /> Líneas sin proveedor asignado ({sinProveedor.length})
              </div>
              <ul className="text-xs text-amber-200/80 space-y-1">
                {sinProveedor.map((l, idx) => (
                  <li key={`${l.producto_id ?? 'fantasma'}-${idx}`}>
                    <span className="font-mono text-amber-300">{l.sku ?? '—'}</span> — {l.nombre} · faltan {l.faltante}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-300/70 mt-2">
                Asigna proveedor principal en el catálogo para incluirlas en las OCs sugeridas.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={generar.isPending}>Cancelar</Button>
          <Button onClick={onGenerar} disabled={generar.isPending || !hayProveedores}>
            {generar.isPending ? 'Generando…' : `Generar ${porProveedor.length} OC(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
