import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Fantasma } from '../types';
import type { PromoverInput, PromoverResponse, SugerirSkuResponse } from '../types';

export function PromoverModal({
  fantasma,
  onClose,
}: {
  fantasma: Fantasma;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [sku, setSku] = useState(fantasma.sku_libre ?? '');
  const [cantidad, setCantidad] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    api
      .get<SugerirSkuResponse>(`/api/fantasmas/${fantasma.id}/sugerir-sku`)
      .then((r) => { if (activo && r.sku_sugerido) setSku((prev) => prev || r.sku_sugerido); })
      .catch(() => { /* sin sugerencia: el usuario escribe el SKU */ });
    return () => { activo = false; };
  }, [fantasma.id]);

  const mut = useMutation<PromoverResponse, { status?: number; detail?: string }, PromoverInput>({
    mutationFn: (payload) => api.post<PromoverResponse>(`/api/fantasmas/${fantasma.id}/promover`, payload),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['fantasmas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast({ kind: 'success', title: `Promovido a ${r.sku}`, description: r.stock_inicial > 0 ? `Entrada de ${r.stock_inicial} al inventario` : 'Producto creado sin stock inicial' });
      onClose();
    },
    onError: (e) => {
      if (e.status === 401) { window.location.href = '/spa/login'; return; }
      setErr(e.detail ?? 'No se pudo promover');
    },
  });

  function onSubmit() {
    setErr(null);
    const skuTrim = sku.trim();
    if (!skuTrim) { setErr('El SKU es obligatorio.'); return; }
    const cant = parseInt(cantidad, 10);
    if (!Number.isFinite(cant) || cant < 0) { setErr('La cantidad debe ser 0 o mayor.'); return; }
    const min = stockMinimo.trim() === '' ? null : parseInt(stockMinimo, 10);
    mut.mutate({ sku: skuTrim, cantidad: cant, stock_minimo: Number.isFinite(min as number) ? (min as number) : null });
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
      <div className="bg-card border border-violet-700/50 rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-violet-500" /> Promover a producto
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground truncate" title={fantasma.descripcion}>{fantasma.descripcion}</p>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">SKU del producto *</label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" placeholder="Ej. SCHN-0007" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Cantidad recibida</label>
              <Input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="text-right" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Stock mínimo (opcional)</label>
              <Input type="number" min="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} className="text-right" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Cantidad 0 crea el producto sin entrada de stock. Cualquier cantidad &gt; 0 registra una ENTRADA auditada en el kardex.</p>
          {err && <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 text-rose-700 dark:text-rose-300">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button size="sm" onClick={onSubmit} disabled={mut.isPending}>{mut.isPending ? 'Promoviendo…' : 'Promover'}</Button>
        </div>
      </div>
    </div>
  );
}
