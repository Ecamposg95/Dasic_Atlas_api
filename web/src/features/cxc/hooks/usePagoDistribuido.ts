import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidarCobranza } from '@/lib/cobranza-cache';
import type { PagoDistribuidoRequest, PagoDistribuidoResponse } from '../types';

export function usePagoDistribuido(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<PagoDistribuidoResponse, { status?: number; detail?: string }, PagoDistribuidoRequest>({
    mutationFn: (body) =>
      api.post<PagoDistribuidoResponse>(`/api/clientes/${clienteId}/pago-distribuido`, body),
    onSuccess: () => invalidarCobranza(qc, clienteId),
  });
}
