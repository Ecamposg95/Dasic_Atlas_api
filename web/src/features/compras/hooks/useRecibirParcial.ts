import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RecepcionParcialPayload, RecepcionParcialResponse } from '../types';

export function useRecibirParcial(id: number) {
  const qc = useQueryClient();
  return useMutation<RecepcionParcialResponse, { status?: number; detail?: string }, RecepcionParcialPayload>({
    mutationFn: (payload) => api.post<RecepcionParcialResponse>(`/api/compras/${id}/recibir-parcial`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenesCompra'] });
      qc.invalidateQueries({ queryKey: ['ordenCompraDetalle', id] });
      // Recibir da entrada al inventario de las líneas de catálogo
      // (`_aplicar_recepcion` en routers/compras.py), con su fila en
      // movimientos_stock: sin esto, existencias y kardex quedan viejos.
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['cardex'] });
    },
  });
}
