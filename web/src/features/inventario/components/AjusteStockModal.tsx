import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Producto } from '../types';

type Props = {
  producto: Producto;
  onClose: () => void;
};

type AjustePayload = {
  delta: number;
  motivo: string;
};

export function AjusteStockModal({ producto, onClose }: Props) {
  const [delta, setDelta] = useState<string>('0');
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const qc = useQueryClient();

  const mut = useMutation<Producto, { status?: number; detail?: string }, AjustePayload>({
    mutationFn: (payload) =>
      api.post<Producto>(`/api/productos/${producto.id}/ajustar-stock`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast({ kind: 'success', title: 'Stock ajustado correctamente' });
      onClose();
    },
    onError: (e) => {
      if (e.status === 401) {
        window.location.href = '/spa/login';
        return;
      }
      if (e.status === 403) {
        toast({ kind: 'error', title: 'Solo admin', description: 'Se requiere rol administrador para ajustar stock.' });
        return;
      }
      toast({ kind: 'error', title: 'No se pudo ajustar stock', description: e.detail });
    },
  });

  const deltaNum = parseInt(delta, 10);
  const nuevoStock = Number.isFinite(deltaNum)
    ? Math.max(0, producto.stock_actual + deltaNum)
    : producto.stock_actual;

  function onSubmit() {
    setErr(null);
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
      setErr('El ajuste debe ser un número entero distinto de cero.');
      return;
    }
    if (!motivo.trim()) {
      setErr('El motivo es obligatorio.');
      return;
    }
    mut.mutate({ delta: d, motivo: motivo.trim() });
  }

  return (
    <Modal title={`Ajustar stock — ${producto.nombre}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        {/* Resumen actual */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2 rounded-lg text-sm">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Stock actual</div>
            <div className="text-xl font-bold text-foreground">{producto.stock_actual}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Stock proyectado</div>
            <div
              className={`text-xl font-bold ${
                Number.isFinite(deltaNum) && deltaNum < 0 && nuevoStock < producto.stock_minimo
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {nuevoStock}
            </div>
          </div>
        </div>

        {/* Delta */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Ajuste (positivo = entrada, negativo = salida)
          </label>
          <Input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="ej. 10 o -5"
          />
        </div>

        {/* Motivo */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Motivo *</label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe el motivo del ajuste…"
            rows={3}
          />
        </div>

        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={mut.isPending}>
          {mut.isPending ? 'Ajustando…' : 'Aplicar ajuste'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
